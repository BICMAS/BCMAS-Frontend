import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { getAssessmentVersion, resetOrgLibrary } from "@/features/assessment-library/services/org-library";
import { mockClient, renderWithAi } from "@/features/ai/testing";

import { CandidateInterviewView } from "../components/candidate-interview-view";
import { InterviewResults } from "../components/interview-results";
import { getCandidate } from "../services/candidates";
import { inviteToAssessment, saveAnswer, scoreWrittenAnswer, startAssessment, submitAssessment } from "../services/delivery";
import {
  MAX_REPEATS,
  confirmInterviewScores,
  declineConsent,
  getCandidateInterview,
  giveConsent,
  hrInterviewView,
  interviewEligibility,
  interviewFor,
  interviewScoringRequest,
  inviteToInterview,
  repeatQuestion,
  reportTechnicalIssue,
  resendInterview,
  saveInterviewAnswer,
  saveInterviewSuggestion,
  startInterview,
  submitInterview,
} from "../services/interview";
import { listOutbox, resetRecruitment } from "../services/vacancies";

// BCMS Talent Assessment guide, step 7a: AI-avatar competency interview.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/talent/candidates",
  useSearchParams: () => new URLSearchParams(),
}));

const session = vi.hoisted(() => ({ userId: "user-priya", organisationId: "org-gec" }));
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
const HRBP = getMockUser("user-priya").name;
const APP = "app-se-1";

const STRONG =
  "Last year a key supermarket customer complained about stock-outs. I agreed clear priorities for the top products, set specific actions with the distributor and measured the outcome weekly; availability reached 98% and I learned to review orders earlier.";

/** Adaeze passes the role-based assessment (100%), which makes her eligible for the interview. */
function passAssessment() {
  const token = inviteToAssessment(GEC, APP, HRBP);
  startAssessment(token);
  for (const item of getAssessmentVersion(GEC, "oa-sales-custom", "1.0")!.items) {
    if (item.responseType === "case_response") saveAnswer(token, item.id, { text: "Prioritise outlets by value and review weekly." });
    else saveAnswer(token, item.id, { optionId: item.scoring.correctOptionId! });
  }
  submitAssessment(token);
  scoreWrittenAnswer(GEC, APP, "q05", 4, "", HRBP);
}

function completeInterview(answers: Record<string, string>) {
  passAssessment();
  const token = inviteToInterview(GEC, APP, HRBP);
  giveConsent(token, "text", "Typing chosen.");
  startInterview(token);
  for (const [id, text] of Object.entries(answers)) saveInterviewAnswer(token, id, text, "text");
  submitInterview(token);
  return token;
}

beforeEach(() => {
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
  session.userId = "user-priya";
});

describe("Interview invitation", () => {
  it("is only for candidates who met the approved assessment threshold", () => {
    expect(interviewEligibility(GEC, APP)).toMatchObject({ ok: false, reason: expect.stringMatching(/met the approved assessment threshold/) });
    expect(() => inviteToInterview(GEC, APP, HRBP)).toThrow(/met the approved assessment threshold/);
    passAssessment();
    const token = inviteToInterview(GEC, APP, HRBP);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(interviewFor(GEC, APP)).toMatchObject({ questionSetId: "oa-sales-interview", questionSetVersion: "1.0", thresholdSnapshotVersion: 1 });
    expect(getCandidate(GEC, APP)!.stage).toBe("avatar_invited");
    expect(listOutbox(GEC).some((e) => e.kind === "interview_invitation" && e.body.includes(`/interview/${token}`))).toBe(true);
    expect(() => inviteToInterview(GEC, APP, HRBP)).toThrow(/Already invited/);
  });

  it("never sends rubrics to the candidate", () => {
    passAssessment();
    const view = getCandidateInterview(inviteToInterview(GEC, APP, HRBP))!;
    expect(view.questions).toHaveLength(4);
    expect(JSON.stringify(view)).not.toMatch(/rubric|descriptor|threshold|score/);
  });
});

describe("Candidate interview rules", () => {
  it("needs consent before starting and records how the candidate chose to answer", () => {
    passAssessment();
    const token = inviteToInterview(GEC, APP, HRBP);
    expect(() => startInterview(token)).toThrow(/agree to how the interview works/);
    declineConsent(token, "I would prefer a phone call");
    giveConsent(token, "voice", "Microphone tested.");
    startInterview(token);
    const s = interviewFor(GEC, APP)!;
    expect(s).toMatchObject({ status: "in_progress", answerMode: "voice" });
    expect(s.events.map((e) => e.type)).toEqual(["invited", "consent_declined", "consented", "equipment_checked", "started"]);
  });

  it(`allows each question to be repeated ${MAX_REPEATS} times, logs problems and reschedules with a new link`, () => {
    passAssessment();
    const token = inviteToInterview(GEC, APP, HRBP);
    giveConsent(token, "text", "");
    startInterview(token);
    repeatQuestion(token, "q01");
    repeatQuestion(token, "q01");
    expect(() => repeatQuestion(token, "q01")).toThrow(/repeated 2 times/);
    saveInterviewAnswer(token, "q01", "Partial answer", "text");
    reportTechnicalIssue(token, "Microphone stopped working", true);
    const fresh = resendInterview(GEC, APP, HRBP);
    expect(getCandidateInterview(token)).toBeNull();
    expect(getCandidateInterview(fresh)!.answers.q01).toEqual({ text: "Partial answer", repeats: 2 });
    expect(hrInterviewView(GEC, APP)!.session.answers).toEqual({}); // hidden until completed
  });
});

describe("Scoring: AI suggests, a person confirms", () => {
  it("routes by the approved interview threshold and records changes to the AI suggestion", async () => {
    completeInterview({ q01: STRONG, q02: STRONG, q03: STRONG, q04: STRONG });
    expect(getCandidate(GEC, APP)!.stage).toBe("avatar_completed");

    const suggestion = await mockClient("user-priya").scoreInterview(interviewScoringRequest(GEC, APP));
    expect(suggestion.scores.every((s) => s.evidence.every((q) => STRONG.includes(q)))).toBe(true);
    saveInterviewSuggestion(GEC, APP, suggestion, HRBP);

    expect(() => confirmInterviewScores(GEC, APP, { q01: { score: 4 } }, HRBP)).toThrow(/Confirm a score for Q02/);
    expect(() => confirmInterviewScores(GEC, APP, { q01: { score: 9 }, q02: { score: 3 }, q03: { score: 3 }, q04: { score: 3 } }, HRBP)).toThrow(/rubric level/);
    confirmInterviewScores(GEC, APP, { q01: { score: 4, comment: "Measured outcome" }, q02: { score: 3 }, q03: { score: 3 }, q04: { score: 2 } }, HRBP);

    const s = interviewFor(GEC, APP)!;
    expect(s.score).toMatchObject({ percent: 75, threshold: 65, outcome: "passed", thresholdSnapshotVersion: 1 });
    expect(s.score!.reason).toMatch(/75% against the approved interview threshold of 65%.*confirmed by/);
    expect(getCandidate(GEC, APP)!.stage).toBe("qualified");
    expect(() => confirmInterviewScores(GEC, APP, { q01: { score: 1 }, q02: { score: 1 }, q03: { score: 1 }, q04: { score: 1 } }, HRBP)).toThrow(/final/);
  });

  it("does not progress a candidate below the interview threshold", () => {
    completeInterview({ q01: "I helped." });
    confirmInterviewScores(GEC, APP, { q01: { score: 1 }, q02: { score: 0 }, q03: { score: 0 }, q04: { score: 0 } }, HRBP);
    expect(getCandidate(GEC, APP)!.stage).toBe("not_progressed");
    expect(getCandidate(GEC, APP)!.stageHistory.at(-1)?.note).toMatch(/6% against the approved interview threshold of 65%/);
  });
});

describe("Candidate interview page", () => {
  it("explains the interview, takes consent, checks equipment and runs the questions", async () => {
    const user = userEvent.setup();
    passAssessment();
    const token = inviteToInterview(GEC, APP, HRBP);
    render(<CandidateInterviewView token={token} />);

    expect(screen.getByText(/appearance, accent, way of speaking/)).toBeTruthy();
    const proceed = screen.getByRole("button", { name: "Continue to equipment check" });
    expect(proceed.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByLabelText("I agree to take part in the AI-avatar interview"));
    await user.click(proceed);

    const check = screen.getByRole("region", { name: "Equipment check" });
    expect(within(check).getByText(/Not available in this browser/)).toBeTruthy(); // jsdom has no speech recognition
    await user.click(within(check).getByRole("button", { name: "Start Interview" }));

    expect(await screen.findByText(/Question 1 of 4/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Ada, AI interviewer · Sales Executive" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Repeat question \(2 left\)/ }));
    expect(screen.getByRole("button", { name: /Repeat question \(1 left\)/ })).toBeTruthy();
    await user.type(screen.getByLabelText("Your answer"), "I met the buyer and agreed a recovery plan.");
    await user.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText(/Question 2 of 4/)).toBeTruthy();

    for (let i = 2; i < 4; i += 1) await user.click(screen.getByRole("button", { name: "Next question" }));
    await user.click(screen.getByRole("button", { name: "End Interview" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/3 questions have no answer/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "End Interview" }));

    expect(await screen.findByText("Interview complete")).toBeTruthy();
    expect(interviewFor(GEC, APP)!.answers.q01?.text).toBe("I met the buyer and agreed a recovery plan.");
  });
});

describe("HR interview tab", () => {
  it("runs AI scoring, lets HR confirm the scores and shows the result", async () => {
    const user = userEvent.setup();
    completeInterview({ q01: STRONG, q02: STRONG, q03: STRONG, q04: STRONG });
    renderWithAi(<InterviewResults organisationId={GEC} applicationId={APP} actor={HRBP} />, mockClient("user-priya"));
    await user.click(await screen.findByRole("button", { name: "Run AI scoring" }));
    expect((await screen.findAllByText(/AI suggests \d\/4/)).length).toBe(4);
  });

  it("confirms the scores into a final result", async () => {
    const user = userEvent.setup();
    completeInterview({ q01: STRONG, q02: STRONG, q03: STRONG, q04: STRONG });
    renderWithAi(<InterviewResults organisationId={GEC} applicationId={APP} actor={HRBP} />, mockClient("user-priya"));
    for (let q = 1; q <= 4; q += 1) await user.click(await screen.findByLabelText(`Q${q} score 3`));
    await user.click(screen.getByRole("button", { name: "Confirm scores" }));
    await waitFor(() => expect(interviewFor(GEC, APP)!.score?.percent).toBe(75));
  });
});
