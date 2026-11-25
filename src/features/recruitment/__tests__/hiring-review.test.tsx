import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { getAssessmentVersion, resetOrgLibrary } from "@/features/assessment-library/services/org-library";
import { mockClient } from "@/features/ai/testing";

import { CandidateReportView, HiringReviewListView, ShortlistView } from "../components/hiring-review-views";
import { getCandidate, saveCvAnalysis } from "../services/candidates";
import { inviteToAssessment, saveAnswer, scoreWrittenAnswer, startAssessment, submitAssessment } from "../services/delivery";
import {
  candidateReport,
  compareCandidates,
  decide,
  hiringManagerVacancies,
  overrideOutcome,
  shortlist,
} from "../services/hiring-review";
import { confirmInterviewScores, giveConsent, inviteToInterview, saveInterviewAnswer, startInterview, submitInterview } from "../services/interview";
import { confirmNotProgressed } from "../services/outcome-review";
import { listOutbox, resetRecruitment } from "../services/vacancies";

// BCMS Talent Assessment guide, step 7b: Hiring Manager review and shortlisting.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/manager/recruitment",
  useSearchParams: () => new URLSearchParams(),
}));

const session = vi.hoisted(() => ({ userId: "user-michael", organisationId: "org-gec" }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user } = await import("@/config/mock-users");
  const state = () => ({ user: user(session.userId), userId: session.userId, organisationId: session.organisationId });
  const useSessionStore = Object.assign(<T,>(selector: (s: ReturnType<typeof state>) => T) => selector(state()), {
    persist: { onFinishHydration: () => () => {}, hasHydrated: () => true },
    getState: state,
  });
  return { useSessionStore };
});

const GEC = "org-gec";
const VAC = "vac-sales-exec";
const HRBP = getMockUser("user-priya").name;
const MICHAEL = { userId: "user-michael", name: getMockUser("user-michael").name };

function takeAssessment(appId: string, correct: boolean, writtenScore: number) {
  const token = inviteToAssessment(GEC, appId, HRBP);
  startAssessment(token);
  for (const item of getAssessmentVersion(GEC, "oa-sales-custom", "1.0")!.items) {
    if (item.responseType === "case_response") saveAnswer(token, item.id, { text: "Prioritise outlets by value." });
    else {
      const key = item.scoring.correctOptionId!;
      saveAnswer(token, item.id, { optionId: correct ? key : item.options.find((o) => o.id !== key)!.id });
    }
  }
  submitAssessment(token);
  scoreWrittenAnswer(GEC, appId, "q05", writtenScore, "", HRBP);
}

/** Adaeze: CV analysed, assessment 100%, interview 75% → Qualified. Bola: assessment 13% → Not Progressed. */
async function buildPipeline() {
  const cv = await mockClient("user-priya").analyzeCv({
    role_title: "Sales Executive",
    requirements: [
      { skill_name: "Negotiation", category: "technical", target_level: "Proficient" },
      { skill_name: "Planning", category: "behavioural", target_level: null },
      { skill_name: "Data analysis", category: "technical", target_level: null },
    ],
    cv_text: getCandidate(GEC, "app-se-1")!.cvText!,
  });
  saveCvAnalysis(GEC, "app-se-1", cv, HRBP);
  takeAssessment("app-se-1", true, 4);
  const token = inviteToInterview(GEC, "app-se-1", HRBP);
  giveConsent(token, "text", "");
  startInterview(token);
  for (const q of ["q01", "q02", "q03", "q04"]) saveInterviewAnswer(token, q, "A specific example with actions and a measured outcome.", "text");
  submitInterview(token);
  confirmInterviewScores(GEC, "app-se-1", { q01: { score: 4 }, q02: { score: 3 }, q03: { score: 3 }, q04: { score: 2 } }, HRBP);
  takeAssessment("app-se-2", false, 1);
  confirmNotProgressed(GEC, "app-se-2", "Checked by HR.", HRBP);
}

beforeEach(async () => {
  push.mockReset();
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
  session.userId = "user-michael";
  await buildPipeline();
});

describe("Hiring Manager access and evidence", () => {
  it("is the Line Manager's Hiring Review menu, and only the vacancy's Hiring Manager may review", () => {
    const hrefs = getNavigationConfig("line_manager").sections.flatMap((s) => s.items).map((i) => i.href);
    expect(hrefs).toContain("/manager/recruitment");
    expect(() => shortlist(GEC, VAC, "user-priya")).toThrow(/Only the vacancy's Hiring Manager/);
    expect(hiringManagerVacancies(GEC, MICHAEL.userId).find((r) => r.vacancy.id === VAC)).toMatchObject({
      qualified: 1,
      notProgressed: 1,
      awaitingDecision: 1,
    });
  });

  it("reports skill-by-skill evidence with the versions and thresholds used", () => {
    const report = candidateReport(GEC, "app-se-1", MICHAEL.userId);
    expect(report.summary).toMatchObject({ assessmentPct: 100, interviewPct: 75, cvCoveragePct: expect.any(Number), group: "qualified" });
    expect(report.snapshot).toMatchObject({ version: 1, assessment: 70, interview: 65 });
    expect(report.evidence.find((e) => e.competency === "Customer focus")).toMatchObject({ assessmentPct: 100, interviewPct: 100, overallPct: 100 });
    expect(report.evidence.find((e) => e.competency === "Problem solving")?.interviewPct).toBe(50);
    expect(report.strengths).toContain("Customer focus");
    expect(report.gaps).toContain("Data analysis"); // not found in the CV and not scored elsewhere
  });
});

describe("Decisions and overrides", () => {
  it("selects a qualified candidate, records it and tells the candidate", () => {
    decide(GEC, "app-se-1", MICHAEL, "selected", "Strong customer focus");
    const c = getCandidate(GEC, "app-se-1")!;
    expect(c.decisions.at(-1)).toMatchObject({ decision: "selected", by: MICHAEL.name, note: "Strong customer focus" });
    expect(c.stage).toBe("qualified");
    expect(listOutbox(GEC).some((e) => e.kind === "shortlist_outcome" && e.to === "adaeze.okonkwo@example.com")).toBe(true);
  });

  it("will not select below-threshold candidates without an override, and overrides need a reason", () => {
    expect(() => decide(GEC, "app-se-2", MICHAEL, "selected", "")).toThrow(/override the outcome with a reason/);
    expect(() => overrideOutcome(GEC, "app-se-2", MICHAEL, "qualified", "Good")).toThrow(/at least 15 characters/);
    overrideOutcome(GEC, "app-se-2", MICHAEL, "qualified", "Strong references from two previous employers in this territory");
    const c = getCandidate(GEC, "app-se-2")!;
    expect(c.stage).toBe("qualified");
    expect(c.decisions.at(-1)).toMatchObject({ decision: "override", override: { from: "not_progressed", to: "qualified" } });
    expect(c.stageHistory.at(-1)?.note).toMatch(/^Override by Hiring Manager: Strong references/);
    decide(GEC, "app-se-2", MICHAEL, "selected", "");
  });

  it("needs a note to hold or not progress, and not progressing changes the stage", () => {
    expect(() => decide(GEC, "app-se-1", MICHAEL, "hold", " ")).toThrow(/why the candidate is on hold/);
    decide(GEC, "app-se-1", MICHAEL, "hold", "Waiting for the second vacancy to open");
    expect(() => decide(GEC, "app-se-1", MICHAEL, "not_progressed", "")).toThrow(/Give a reason/);
    decide(GEC, "app-se-1", MICHAEL, "not_progressed", "Role filled internally");
    expect(getCandidate(GEC, "app-se-1")!.stage).toBe("not_progressed");
    expect(getCandidate(GEC, "app-se-1")!.decisions.map((d) => d.decision)).toEqual(["hold", "not_progressed"]);
  });

  it("does not decide on candidates still in progress, and compares 2–4 candidates", () => {
    expect(() => decide(GEC, "app-se-3", MICHAEL, "hold", "x")).toThrow(/not finished/);
    expect(() => compareCandidates(GEC, ["app-se-1"], MICHAEL.userId)).toThrow(/2 to 4/);
    const { reports, competencies } = compareCandidates(GEC, ["app-se-1", "app-se-2"], MICHAEL.userId);
    expect(reports.map((r) => r.summary.assessmentPct)).toEqual([100, 13]);
    expect(competencies).toContain("Customer focus");
  });
});

describe("Hiring Manager screens", () => {
  it("lists vacancies with what is waiting for a decision", () => {
    render(<HiringReviewListView />);
    expect(screen.getByText("Sales Executive")).toBeTruthy();
    expect(screen.getByText("1 awaiting your decision")).toBeTruthy();
  });

  it("shows candidates by outcome and compares them side by side", async () => {
    const user = userEvent.setup();
    render(<ShortlistView vacancyId={VAC} />);
    const table = screen.getByRole("table", { name: "Candidates" });
    expect(within(table).getByText("Adaeze Okonkwo")).toBeTruthy();
    await user.click(screen.getByLabelText("Compare Adaeze Okonkwo"));
    await user.click(screen.getByRole("tab", { name: /Not Progressed/ }));
    await user.click(screen.getByLabelText("Compare Bola Adeyemi"));
    await user.click(screen.getByRole("button", { name: "Compare Candidates (2)" }));
    const comparison = await screen.findByRole("table", { name: "Comparison" });
    expect(within(comparison).getByText("Bola Adeyemi")).toBeTruthy();
    expect(within(comparison).getAllByText("100%").length).toBeGreaterThan(0);
  });

  it("records a selection from the candidate report", async () => {
    const user = userEvent.setup();
    render(<CandidateReportView applicationId="app-se-1" />);
    expect(screen.getByRole("table", { name: "Skill evidence" })).toBeTruthy();
    expect(screen.getByText(/Threshold snapshot v1 approved by/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Select for Physical Interview" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Select" }));
    await waitFor(() => expect(getCandidate(GEC, "app-se-1")!.decisions.at(-1)?.decision).toBe("selected"));
    expect(screen.getByRole("list", { name: "Decision history" }).textContent).toMatch(/Selected for physical interview/);
  });

  it("requires a reason to override from the report", async () => {
    const user = userEvent.setup();
    render(<CandidateReportView applicationId="app-se-2" />);
    expect(screen.getByRole("button", { name: "Select for Physical Interview" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Override Outcome" }));
    const dialog = await screen.findByRole("dialog");
    const record = within(dialog).getByRole("button", { name: "Record override" });
    expect(record.hasAttribute("disabled")).toBe(true);
    await user.type(within(dialog).getByLabelText(/Reason for overriding/), "Excellent work sample from a previous role");
    await user.click(record);
    await waitFor(() => expect(getCandidate(GEC, "app-se-2")!.stage).toBe("qualified"));
  });

  it("is hidden from people who are not the Hiring Manager", () => {
    session.userId = "user-priya";
    render(<ShortlistView vacancyId={VAC} />);
    expect(screen.getByText(/hiring review are for Hiring Managers/)).toBeTruthy();
  });
});
