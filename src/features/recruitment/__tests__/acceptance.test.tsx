import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { getAssessmentVersion, resetOrgLibrary } from "@/features/assessment-library/services/org-library";
import { mockClient } from "@/features/ai/testing";

import { PublicApplicationView } from "../components/public-application-view";
import { cvRequirements, getCandidate, saveCvAnalysis } from "../services/candidates";
import { attemptFor, getCandidateAssessment, inviteToAssessment, saveAnswer, scoreWrittenAnswer, startAssessment, submitAssessment } from "../services/delivery";
import { candidateReport, decide } from "../services/hiring-review";
import { funnel, metrics } from "../services/insights";
import {
  confirmInterviewScores,
  giveConsent,
  interviewFor,
  interviewScoringRequest,
  inviteToInterview,
  saveInterviewAnswer,
  saveInterviewSuggestion,
  startInterview,
  submitInterview,
} from "../services/interview";
import {
  approveVacancy,
  assessmentOptions,
  createVacancy,
  emptyDetails,
  getPublicVacancy,
  getVacancy,
  interviewSetOptions,
  listApplications,
  listOutbox,
  publicApplyPath,
  publishVacancy,
  resetRecruitment,
  sendForApproval,
} from "../services/vacancies";

/**
 * BCMS Talent Assessment guide §17 — "Minimum end-to-end acceptance test", run as one journey.
 * Each step is its own test and builds on the previous one, so a failure names the step.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/apply",
  useSearchParams: () => new URLSearchParams(),
}));

const GEC = "org-gec";
const HRBP = getMockUser("user-priya").name;
const MICHAEL = { userId: "user-michael", name: getMockUser("user-michael").name };
const CANDIDATE_EMAIL = "tolu.ade@example.com";

const journey: { vacancyId: string; token: string; applicationId: string } = { vacancyId: "", token: "", applicationId: "" };

async function cvFile() {
  const zip = new JSZip();
  const lines = [
    "Tolu Ade",
    "Sales Executive, Bright Foods, Lagos (2020 - 2026)",
    "I negotiated annual trading terms with 35 retail outlets and grew volume by 22%.",
    "I planned weekly outlet visits across a territory of 90 stores.",
    "BSc Marketing, 2019",
  ];
  zip.file("word/document.xml", `<w:document><w:body>${lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return new File([await zip.generateAsync({ type: "arraybuffer" })], "Tolu_CV.docx");
}

beforeAll(() => {
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
});

describe("BCMS Talent Assessment — minimum end-to-end acceptance test", () => {
  it("1. HR creates a vacancy and selects a published BCMS role profile", () => {
    journey.vacancyId = createVacancy(
      GEC,
      {
        ...emptyDetails(),
        title: "Field Sales Executive",
        department: "Commercial",
        location: "Lagos",
        summary: "Grow volume across general-trade outlets.",
        roleId: "role-sales-exec",
        assessment: assessmentOptions(GEC).find((a) => a.assessmentId === "oa-sales-custom")!,
        stages: {
          assessment: { enabled: true, threshold: 70 },
          interview: { enabled: true, threshold: 65, questionSet: interviewSetOptions(GEC).find((a) => a.assessmentId === "oa-sales-interview")! },
        },
        hiringManager: MICHAEL,
      },
      HRBP,
    );
    expect(getVacancy(GEC, journey.vacancyId)).toMatchObject({ roleTitle: "Sales Executive", status: "draft" });
  });

  it("2. The Hiring Manager approves the assessment thresholds", () => {
    sendForApproval(GEC, journey.vacancyId, HRBP);
    approveVacancy(GEC, journey.vacancyId, MICHAEL);
    expect(getVacancy(GEC, journey.vacancyId)!.approvals[0]).toMatchObject({ version: 1, assessment: 70, interview: 65, approvedBy: MICHAEL.name });
  });

  it("3. HR publishes a unique link that opens outside the employee portal", () => {
    journey.token = publishVacancy(GEC, journey.vacancyId, HRBP);
    expect(publicApplyPath(journey.token)).toMatch(/^\/apply\/gec-field-sales-executive-/);
    expect(getPublicVacancy(journey.token)).toMatchObject({ title: "Field Sales Executive", closedReason: null });
  });

  it("4. The candidate submits a CV and email address successfully", async () => {
    const user = userEvent.setup();
    const { container } = render(<PublicApplicationView token={journey.token} />);
    await user.click(screen.getByRole("button", { name: "Apply Now" }));
    await user.type(screen.getByLabelText(/^Full name/), "Tolu Ade");
    await user.type(screen.getByLabelText(/^Email/), CANDIDATE_EMAIL);
    await user.type(screen.getByLabelText(/^Confirm email/), CANDIDATE_EMAIL);
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, await cvFile());
    await screen.findByText("Tolu_CV.docx");
    await user.click(screen.getByLabelText("I agree to the privacy and consent statement"));
    await user.click(screen.getByRole("button", { name: "Submit Application" }));
    expect(await screen.findByText("Application submitted")).toBeTruthy();
    journey.applicationId = listApplications(GEC, journey.vacancyId)[0]!.id;
  });

  it("5. BCMS creates a candidate record and shows CV-to-role skill evidence", async () => {
    const candidate = getCandidate(GEC, journey.applicationId)!;
    expect(candidate).toMatchObject({ email: CANDIDATE_EMAIL, stage: "new_application" });
    const req = cvRequirements(getVacancy(GEC, journey.vacancyId)!)!;
    const analysis = await mockClient("user-priya").analyzeCv({ role_title: req.roleTitle, requirements: req.requirements, cv_text: candidate.cvText! });
    saveCvAnalysis(GEC, journey.applicationId, analysis, HRBP);
    const negotiation = getCandidate(GEC, journey.applicationId)!.cvAnalysis!.result.skills.find((s) => s.skill_name === "Negotiation")!;
    expect(negotiation.status).toBe("found");
    expect(negotiation.passages[0]).toBe("I negotiated annual trading terms with 35 retail outlets and grew volume by 22%.");
  });

  it("6. The role-based assessment invitation is sent to the candidate's confirmed email", () => {
    const token = inviteToAssessment(GEC, journey.applicationId, HRBP);
    const mail = listOutbox(GEC).find((e) => e.kind === "assessment_invitation" && e.applicationId === journey.applicationId)!;
    expect(mail.to).toBe(CANDIDATE_EMAIL);
    expect(mail.body).toContain(`/assessment/${token}`);
    expect(JSON.stringify(getCandidateAssessment(token))).not.toMatch(/correctOptionId|rubric/);
  });

  it("7. The candidate completes the assigned assessment and BCMS records the attempt and score", () => {
    const attempt = attemptFor(GEC, journey.applicationId)!;
    startAssessment(attempt.token);
    for (const item of getAssessmentVersion(GEC, "oa-sales-custom", "1.0")!.items) {
      if (item.responseType === "case_response") saveAnswer(attempt.token, item.id, { text: "Prioritise high-value outlets and review weekly." });
      else saveAnswer(attempt.token, item.id, { optionId: item.scoring.correctOptionId! });
    }
    submitAssessment(attempt.token);
    scoreWrittenAnswer(GEC, journey.applicationId, "q05", 3, "Clear priorities", HRBP);
    expect(attemptFor(GEC, journey.applicationId)!.score).toMatchObject({
      percent: 88,
      outcome: "passed",
      thresholdSnapshotVersion: 1,
      scoringRuleVersion: expect.any(String),
    });
    expect(attemptFor(GEC, journey.applicationId)!.assessmentVersion).toBe("1.0");
  });

  it("8. A candidate who meets the approved threshold receives an AI-avatar interview invitation", () => {
    inviteToInterview(GEC, journey.applicationId, HRBP);
    expect(getCandidate(GEC, journey.applicationId)!.stage).toBe("avatar_invited");
    expect(listOutbox(GEC).some((e) => e.kind === "interview_invitation" && e.to === CANDIDATE_EMAIL)).toBe(true);
  });

  it("9. BCMS evaluates interview answers against role-linked competencies and the approved rubric", async () => {
    const session = interviewFor(GEC, journey.applicationId)!;
    giveConsent(session.token, "text", "Typing chosen.");
    startInterview(session.token);
    const answer =
      "Last year a key customer complained about late deliveries. I agreed clear priorities, took specific actions with the distributor and measured the outcome weekly; on-time delivery reached 97% and I learned to plan earlier.";
    for (const q of ["q01", "q02", "q03", "q04"]) saveInterviewAnswer(session.token, q, answer, "text");
    submitInterview(session.token);
    const suggestion = await mockClient("user-priya").scoreInterview(interviewScoringRequest(GEC, journey.applicationId));
    expect(suggestion.scores.map((s) => s.question_id)).toEqual(["q01", "q02", "q03", "q04"]);
    expect(suggestion.scores.every((s) => s.evidence.every((e) => answer.includes(e)))).toBe(true);
    saveInterviewSuggestion(GEC, journey.applicationId, suggestion, HRBP);
  });

  it("10. BCMS applies the saved thresholds and records the progression outcome and reason", () => {
    confirmInterviewScores(GEC, journey.applicationId, { q01: { score: 4 }, q02: { score: 3 }, q03: { score: 3 }, q04: { score: 3 } }, HRBP);
    const candidate = getCandidate(GEC, journey.applicationId)!;
    expect(candidate.stage).toBe("qualified");
    expect(candidate.stageHistory.at(-1)!.note).toMatch(/81% against the approved interview threshold of 65% \(threshold snapshot v1/);
  });

  it("11. The Hiring Manager reviews the report and selects the candidate for a physical interview", () => {
    const report = candidateReport(GEC, journey.applicationId, MICHAEL.userId);
    expect(report.summary).toMatchObject({ assessmentPct: 88, interviewPct: 81, group: "qualified" });
    decide(GEC, journey.applicationId, MICHAEL, "selected", "Strong evidence across all competencies");
    expect(getCandidate(GEC, journey.applicationId)!.decisions.at(-1)).toMatchObject({ decision: "selected", by: MICHAEL.name });
  });

  it("12. Recruitment Insights reflects the candidate journey and stage outcomes", () => {
    const steps = Object.fromEntries(funnel(GEC, { vacancyId: journey.vacancyId }).map((s) => [s.id, s.count]));
    expect(steps).toEqual({
      applied: 1,
      cv: 1,
      a_invited: 1,
      a_completed: 1,
      a_passed: 1,
      i_invited: 1,
      i_completed: 1,
      qualified: 1,
      selected: 1,
    });
    expect(metrics(GEC, { vacancyId: journey.vacancyId }).find((m) => m.id === "selections")!.value).toBe("1");
  });
});

// Keeps the public page's form semantics checked alongside the journey.
describe("Acceptance check helpers", () => {
  it("renders the published vacancy publicly", () => {
    render(<PublicApplicationView token={journey.token} />);
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Field Sales Executive" })).toBeTruthy();
  });
});
