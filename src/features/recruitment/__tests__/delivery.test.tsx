import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { getAssessmentVersion, resetOrgLibrary } from "@/features/assessment-library/services/org-library";
import { mockClient, renderWithAi } from "@/features/ai/testing";

import { CandidateAssessmentView } from "../components/candidate-assessment-view";
import { CandidateProfileView } from "../components/candidate-profile-view";
import { getCandidate } from "../services/candidates";
import {
  attemptFor,
  getCandidateAssessment,
  hrAttemptView,
  inviteToAssessment,
  resendInvitation,
  saveAnswer,
  scoreWrittenAnswer,
  startAssessment,
  submitAssessment,
} from "../services/delivery";
import { listOutbox, recruitmentStore, resetRecruitment } from "../services/vacancies";

// BCMS Talent Assessment guide, step 6b: assessment invitation, delivery and scoring.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
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
// Sales Executive – Custom v1.0: Q01–Q04 keyed choice items (1 point each), Q05 written (rubric 1–4).
const version = () => getAssessmentVersion(GEC, "oa-sales-custom", "1.0")!;
const attemptRecord = (applicationId: string) => recruitmentStore.data().attempts.find((a) => a.applicationId === applicationId)!;

function answerAll(token: string, correct: boolean, written: string) {
  for (const item of version().items) {
    if (item.responseType === "case_response") saveAnswer(token, item.id, { text: written });
    else {
      const key = item.scoring.correctOptionId!;
      const wrong = item.options.find((o) => o.id !== key)!.id;
      saveAnswer(token, item.id, { optionId: correct ? key : wrong });
    }
  }
}

beforeEach(() => {
  push.mockReset();
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
  session.userId = "user-priya";
});

describe("Invitation", () => {
  it("sends a secure, expiring link to the confirmed email and moves the candidate on", () => {
    const token = inviteToAssessment(GEC, "app-se-1", HRBP);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const attempt = attemptFor(GEC, "app-se-1")!;
    expect(attempt).toMatchObject({ status: "invited", assessmentId: "oa-sales-custom", assessmentVersion: "1.0", thresholdSnapshotVersion: 1 });
    expect(new Date(attempt.expiresAt).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    const mail = listOutbox(GEC).find((e) => e.kind === "assessment_invitation")!;
    expect(mail).toMatchObject({ to: "adaeze.okonkwo@example.com" });
    expect(mail.body).toContain(`/assessment/${token}`);
    expect(getCandidate(GEC, "app-se-1")!.stage).toBe("assessment_invited");
    expect(() => inviteToAssessment(GEC, "app-se-1", HRBP)).toThrow(/Resend Invitation/);
  });

  it("replaces the link when resent; the old link stops working", () => {
    const first = inviteToAssessment(GEC, "app-se-1", HRBP);
    const second = resendInvitation(GEC, "app-se-1", HRBP);
    expect(second).not.toBe(first);
    expect(getCandidateAssessment(first)).toBeNull();
    expect(getCandidateAssessment(second)?.status).toBe("invited");
  });
});

describe("Candidate delivery", () => {
  it("never sends answer keys or rubrics to the candidate", () => {
    const token = inviteToAssessment(GEC, "app-se-1", HRBP);
    const view = getCandidateAssessment(token)!;
    expect(view.items).toHaveLength(5);
    expect(JSON.stringify(view)).not.toMatch(/correctOptionId|rubric|scoring|threshold/);
  });

  it("autosaves answers, rejects invalid options and keeps HR out of live answers", () => {
    const token = inviteToAssessment(GEC, "app-se-1", HRBP);
    expect(() => saveAnswer(token, "q01", { optionId: "o1" })).toThrow(/Start the assessment/);
    startAssessment(token);
    expect(() => saveAnswer(token, "q01", { optionId: "nope" })).toThrow(/Choose one of the options/);
    saveAnswer(token, "q01", { optionId: "o2" });
    expect(getCandidateAssessment(token)!.answers.q01?.optionId).toBe("o2");
    expect(hrAttemptView(GEC, "app-se-1")!.attempt.answers).toEqual({}); // not visible before submission
  });

  it("expires links and auto-submits when the time allowed runs out", () => {
    const token = inviteToAssessment(GEC, "app-se-2", HRBP);
    attemptRecord("app-se-2").expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(getCandidateAssessment(token)!.status).toBe("expired");
    expect(() => startAssessment(token)).toThrow(/expired/);

    const t3 = inviteToAssessment(GEC, "app-se-1", HRBP);
    startAssessment(t3);
    saveAnswer(t3, "q01", { optionId: version().items[0]!.scoring.correctOptionId! });
    attemptRecord("app-se-1").startedAt = new Date(Date.now() - 31 * 60_000).toISOString(); // 30-minute assessment
    expect(getCandidateAssessment(t3)!.status).toBe("submitted");
    expect(attemptRecord("app-se-1").events.some((e) => e.type === "time_expired")).toBe(true);
  });
});

describe("Scoring and routing", () => {
  it("scores objective items by key, sends written answers to a person, then routes by the approved threshold", () => {
    const token = inviteToAssessment(GEC, "app-se-1", HRBP);
    startAssessment(token);
    answerAll(token, true, "I would map outlets by value, agree targets with distributors and review weekly.");
    submitAssessment(token);

    let attempt = attemptFor(GEC, "app-se-1")!;
    expect(attempt.score).toMatchObject({ objectivePoints: 4, objectiveMax: 4, percent: null, outcome: "awaiting_written_scoring" });
    expect(getCandidate(GEC, "app-se-1")!.stage).toBe("assessment_completed");
    expect(() => scoreWrittenAnswer(GEC, "app-se-1", "q05", 7, "", HRBP)).toThrow(/rubric level/);

    scoreWrittenAnswer(GEC, "app-se-1", "q05", 3, "Clear plan, priorities named", HRBP);
    attempt = attemptFor(GEC, "app-se-1")!;
    expect(attempt.score).toMatchObject({
      percent: 88, // (4 + 3) / (4 + 4)
      threshold: 70,
      thresholdSnapshotVersion: 1,
      outcome: "passed",
      scoringRuleVersion: expect.stringContaining("objective-key-v1"),
    });
    // Sales Executive uses the AI-avatar interview, so a pass waits for that stage.
    expect(getCandidate(GEC, "app-se-1")!.stage).toBe("assessment_completed");
    expect(getCandidate(GEC, "app-se-1")!.stageHistory.at(-1)?.note).toMatch(/88% against the approved pass threshold of 70%/);
    expect(() => scoreWrittenAnswer(GEC, "app-se-1", "q05", 4, "", HRBP)).toThrow(/final/);
  });

  it("does not progress a candidate below the threshold, and says why", () => {
    const token = inviteToAssessment(GEC, "app-se-2", HRBP);
    startAssessment(token);
    answerAll(token, false, "");
    submitAssessment(token);
    const attempt = attemptFor(GEC, "app-se-2")!;
    expect(attempt.score).toMatchObject({ percent: 0, outcome: "not_passed" });
    const c = getCandidate(GEC, "app-se-2")!;
    expect(c.stage).toBe("not_progressed");
    expect(c.stageHistory.at(-1)).toMatchObject({ actor: "BCMS (approved threshold)", note: expect.stringContaining("threshold of 70%") });
  });
});

describe("Candidate assessment page", () => {
  it("welcomes the candidate, shows one question at a time and submits", async () => {
    const user = userEvent.setup();
    const token = inviteToAssessment(GEC, "app-se-1", HRBP);
    render(<CandidateAssessmentView token={token} />);
    expect(screen.getByText("Before you start")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start Assessment" }));

    expect(await screen.findByText(/Question 1 of 5/)).toBeTruthy();
    expect(screen.getByLabelText("Time remaining").textContent).toMatch(/^(29|30):/);
    const first = version().items[0]!;
    await user.click(screen.getByLabelText(first.options[1]!.text));
    expect(screen.getByText("Saved")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Flag to revisit" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Question 2 of 5/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /^Question 5/ }));
    await user.type(screen.getByLabelText("Your answer"), "Visit the top outlets first.");
    await user.click(screen.getByRole("button", { name: "Submit Assessment" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/3 unanswered questions/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Assessment submitted")).toBeTruthy();
    expect(attemptFor(GEC, "app-se-1")!.answers.q05?.text).toBe("Visit the top outlets first.");
  });

  it("tells the candidate when the link is not valid", () => {
    render(<CandidateAssessmentView token="0000" />);
    expect(screen.getByText("Assessment link not found")).toBeTruthy();
  });
});

describe("HR assessment tab", () => {
  it("sends the invitation from the profile and scores a written answer after submission", async () => {
    const user = userEvent.setup();
    renderWithAi(<CandidateProfileView candidateId="app-se-1" />, mockClient("user-priya"));
    await user.click(await screen.findByRole("button", { name: "Send Assessment Invitation" }));
    expect(await screen.findByText(/You cannot see or change answers until the candidate submits/)).toBeTruthy();

    const token = attemptFor(GEC, "app-se-1")!.token;
    startAssessment(token);
    answerAll(token, true, "Prioritise high-value outlets and review progress weekly.");
    submitAssessment(token);

    await waitFor(() => expect(screen.getByRole("region", { name: "Assessment result" })).toBeTruthy());
    await user.click(screen.getByLabelText("Score 4"));
    await user.click(screen.getByRole("button", { name: "Save score" }));
    await waitFor(() => expect(attemptFor(GEC, "app-se-1")!.score?.percent).toBe(100));
    expect(screen.getByText("Met the threshold")).toBeTruthy();
  });
});
