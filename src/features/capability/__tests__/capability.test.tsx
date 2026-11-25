import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import type { MockUser } from "@/types/user";

import { CycleDashboardView } from "../components/cycles";
import { AssessmentResultsView } from "../components/results";
import { EvidenceReviewView } from "../components/review";
import { AssessmentReviewView, AssessmentStartView } from "../components/self-assessment";
import {
  activateCycle,
  addCapabilityEvidence,
  assignSecondReviewer,
  closeCycle,
  createCapabilityCycle,
  cycleStats,
  decide,
  decideSecondReview,
  disagree,
  getAssessment,
  getCapabilityCycle,
  levelLabel,
  listCapabilityCycles,
  myAssessment,
  myLatestResults,
  reassignReviewer,
  recordCalibration,
  releasedGaps,
  releaseResults,
  requestAdjustment,
  resetCapability,
  respondToAdjustment,
  saveSelfRating,
  scheduleProgramme,
  stageOf,
  submitSelfAssessment,
} from "../services/capability";
import { capabilityMatch, disagreeBy, evidenceWarnings, gapOf, isRecent, priorityOf } from "../services/scoring";
import type { AssessmentItem } from "../types";

// BCMS Employee Capability Assessment methodology.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
let current: MockUser | null = null;
vi.mock("@/features/talent/use-hydrated-user", () => ({ useHydratedUser: () => current }));

const JAMES = getMockUser("user-james");
const MICHAEL = getMockUser("user-michael");
const SARAH = getMockUser("user-sarah");
const PRIYA = getMockUser("user-priya");
const GEC = "org-gec";
const ELENA = "cycle-h2-emp-7710";
const JAMES_ID = "cycle-h2-emp-8721";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const evidence = (workDate = day(-30)) => ({ title: "Project", fileNames: ["a.pdf"], notes: "", workDate });

const item = (required: number, level: number | null, over: Partial<AssessmentItem> = {}): AssessmentItem => ({
  skillId: `s${required}${level}`,
  name: "Skill",
  category: "technical",
  required,
  essential: false,
  self: 5,
  evidence: [],
  verification: { decision: level === null ? "more_evidence" : "verified", level, feedback: "", by: "", byUserId: "", at: "" },
  disagreement: null,
  ...over,
});

function submitJames() {
  for (const i of myAssessment(JAMES)!.items) {
    saveSelfRating(JAMES, JAMES_ID, i.skillId, 4);
    addCapabilityEvidence(JAMES, JAMES_ID, i.skillId, evidence());
  }
  submitSelfAssessment(JAMES, JAMES_ID);
}

/** Verifies everything except the first skill, which is recorded one level below. */
function reviewJames() {
  getAssessment(MICHAEL, JAMES_ID)!.items.forEach((i, n) =>
    decide(MICHAEL, JAMES_ID, i.skillId, n === 0 ? { decision: "not_verified", level: i.required - 1, feedback: "Close." } : { decision: "verified", feedback: "Good." }),
  );
}

function releaseJames() {
  submitJames();
  reviewJames();
  recordCalibration(SARAH, "cycle-h2", "Compared three decisions with another manager.");
  releaseResults(SARAH, "cycle-h2");
}

beforeEach(() => {
  resetCapability();
  push.mockReset();
  current = JAMES;
});

describe("Gaps and match", () => {
  it("gives the methodology's worked example", () => {
    const items = [item(4, 4), item(4, 2), item(5, 3)];
    expect(items.map(gapOf)).toEqual([0, 2, 2]);
    expect(items.map(priorityOf)).toEqual(["met", "critical", "critical"]);
    expect(capabilityMatch(items)).toMatchObject({ percent: 70, met: 1, total: 3, counted: 3 });
  });

  it("caps each skill at 100%, leaves out unverified skills and ignores self-ratings", () => {
    expect(capabilityMatch([item(3, 5), item(4, 2), item(4, null)])).toMatchObject({ percent: 75, counted: 2, total: 3 });
    expect(capabilityMatch([item(4, null)]).percent).toBeNull();
  });

  it("makes a one-level gap moderate, or critical for an essential skill", () => {
    expect(priorityOf(item(4, 3))).toBe("moderate");
    expect(priorityOf(item(4, 3, { essential: true }))).toBe("critical");
    expect(priorityOf(item(4, null))).toBe("not_verified");
  });

  it("uses a 12-month evidence limit and 10 working days", () => {
    const now = new Date(2026, 10, 25, 9);
    const e = (workDate: string) => ({ ...evidence(workDate), id: "x", addedAt: "" });
    expect(isRecent(e("2025-11-25"), now)).toBe(true);
    expect(isRecent(e("2025-11-24"), now)).toBe(false);
    expect(evidenceWarnings(item(4, null))[0]).toContain("No evidence");
    const last = disagreeBy(new Date(2026, 10, 25, 9).toISOString()); // a Wednesday
    expect([last.getFullYear(), last.getMonth(), last.getDate()]).toEqual([2026, 11, 9]);
  });

  it("labels levels from the organisation's framework", () => {
    expect(levelLabel(1)).toBe("Level 1 – Awareness");
    expect(levelLabel(4)).toBe("Level 4 – Advanced");
    expect(levelLabel(null)).toBe("Not verified");
  });
});

describe("Cycles", () => {
  it("only Organisation Admins create cycles; duplicates are refused", () => {
    const input = { name: "2030 review", scope: "Entire organisation", year: 2030, cyclesPerYear: 1 as const, number: 1 };
    expect(() => createCapabilityCycle(PRIYA, input)).toThrow("Organisation Admin");
    createCapabilityCycle(SARAH, input);
    expect(() => createCapabilityCycle(SARAH, input)).toThrow("already exists");
    expect(scheduleProgramme(SARAH, "Entire organisation", 4, 2031)).toBe(4);
    expect(scheduleProgramme(SARAH, "Entire organisation", 4, 2031)).toBe(0);
    expect(() => scheduleProgramme(PRIYA, "Entire organisation", 4, 2032)).toThrow();
  });

  it("assesses only people with an approved mapping and role profile, with ordered dates", () => {
    const id = createCapabilityCycle(SARAH, { name: "Next", scope: "Entire organisation", year: 2030, cyclesPerYear: 1, number: 1 });
    expect(() => activateCycle(SARAH, id, { startsOn: day(5), endsOn: day(1), verifyBy: day(9) })).toThrow("in order");
    const dates = { startsOn: day(1), endsOn: day(20), verifyBy: day(30) };
    expect(() => activateCycle(SARAH, id, dates)).toThrow("Nobody"); // already in the active cycle
    releaseJames();
    expect(() => closeCycle(SARAH, "cycle-h2")).toThrow("not released"); // Elena is waiting
    getAssessment(MICHAEL, ELENA)!.items.forEach((i) => decide(MICHAEL, ELENA, i.skillId, { decision: "not_verified", level: 1, feedback: "x" }));
    releaseResults(SARAH, "cycle-h2");
    closeCycle(SARAH, "cycle-h2");
    const result = activateCycle(SARAH, id, dates);
    expect(result.assessed).toBe(2);
    expect(result.excluded).toContainEqual({ name: "Aisha Khan", reason: "Role profile is not approved" });
    expect(myAssessment(JAMES)!.cycleId).toBe(id);
    expect(myLatestResults(JAMES)!.cycleId).toBe("cycle-h2"); // history is kept
  });
});

describe("Self-assessment", () => {
  it("uses the employee's own role profile", () => {
    const mine = myAssessment(JAMES)!;
    expect(mine.items.map((i) => i.name)).toContain("Kubernetes & Docker");
    expect(mine.items.find((i) => i.name === "Microservices Design")!.required).toBe(5);
    expect(mine.items.find((i) => i.name === "Strategic Thinking")!.required).toBe(3);
    expect(myAssessment(MICHAEL)).toBeNull();
  });

  it("needs every skill rated, and can be submitted once", () => {
    expect(() => submitSelfAssessment(JAMES, JAMES_ID)).toThrow("Rate every skill");
    submitJames();
    expect(() => submitSelfAssessment(JAMES, JAMES_ID)).toThrow("already submitted");
    expect(() => saveSelfRating(JAMES, JAMES_ID, "skill-cloud", 1)).toThrow("already submitted");
    expect(() => saveSelfRating(MICHAEL, JAMES_ID, "skill-cloud", 1)).toThrow("not yours");
  });

  it("checks evidence", () => {
    const add = (e: ReturnType<typeof evidence>) => addCapabilityEvidence(JAMES, JAMES_ID, "skill-cloud", e);
    expect(() => add({ ...evidence(), fileNames: [] })).toThrow("file");
    expect(() => add({ ...evidence(), workDate: "" })).toThrow("when");
    expect(() => add(evidence(day(3)))).toThrow("future");
  });
});

describe("Verification", () => {
  it("only the assigned reviewer decides, after submission, with feedback", () => {
    const ok = { decision: "verified" as const, feedback: "Good." };
    expect(() => decide(MICHAEL, JAMES_ID, "skill-cloud", ok)).toThrow("not submitted");
    expect(() => decide(SARAH, ELENA, "skill-cloud", ok)).toThrow("assigned reviewer");
    expect(() => decide(MICHAEL, ELENA, "skill-cloud", { ...ok, feedback: " " })).toThrow("Feedback");
  });

  it("sets the level from the decision", () => {
    decide(MICHAEL, ELENA, "skill-cloud", { decision: "verified", feedback: "Good." });
    expect(() => decide(MICHAEL, ELENA, "skill-micro", { decision: "verified", feedback: "x" })).toThrow("12 months"); // old evidence
    expect(() => decide(MICHAEL, ELENA, "skill-micro", { decision: "not_verified", feedback: "x" })).toThrow("level");
    expect(() => decide(MICHAEL, ELENA, "skill-micro", { decision: "not_verified", level: 5, feedback: "x" })).toThrow("below the required");
    decide(MICHAEL, ELENA, "skill-micro", { decision: "not_verified", level: 3, feedback: "x" });
    const a = getAssessment(MICHAEL, ELENA)!;
    expect(a.items.slice(0, 2).map((i) => i.verification!.level)).toEqual([5, 3]);
  });

  it("returns a skill for evidence and brings it back", () => {
    submitJames();
    decide(MICHAEL, JAMES_ID, "skill-cloud", { decision: "more_evidence", feedback: "Show a second project." });
    const mine = myAssessment(JAMES)!;
    expect(stageOf(mine)).toBe("more_evidence");
    expect(mine.items[0]!.verification!.feedback).toBe("Show a second project."); // the request is visible
    addCapabilityEvidence(JAMES, JAMES_ID, "skill-cloud", evidence());
    expect(getAssessment(MICHAEL, JAMES_ID)!.items[0]!.verification).toBeNull();
  });

  it("can be handed to another reviewer with a reason", () => {
    expect(() => reassignReviewer(MICHAEL, ELENA, SARAH.id, "")).toThrow("reason");
    expect(() => reassignReviewer(MICHAEL, ELENA, PRIYA.id, "Conflict")).toThrow("eligible");
    reassignReviewer(MICHAEL, ELENA, SARAH.id, "Conflict of interest");
    expect(() => decide(MICHAEL, ELENA, "skill-cloud", { decision: "verified", feedback: "x" })).toThrow();
    decide(SARAH, ELENA, "skill-cloud", { decision: "verified", feedback: "x" });
  });
});

describe("Release and second review", () => {
  it("hides decisions until calibration and release", () => {
    submitJames();
    reviewJames();
    expect(myAssessment(JAMES)!.items.every((i) => i.verification === null)).toBe(true);
    expect(myAssessment(JAMES)!.events.some((e) => e.action === "Decision recorded")).toBe(false);
    expect(() => releaseResults(SARAH, "cycle-h2")).toThrow("calibration");
    expect(() => recordCalibration(PRIYA, "cycle-h2", "Compared several decisions.")).toThrow();
    recordCalibration(SARAH, "cycle-h2", "Compared three decisions with another manager.");
    expect(releaseResults(SARAH, "cycle-h2")).toBe(1);
    expect(myAssessment(JAMES)!.items[0]!.verification!.level).toBe(4);
    expect(() => decide(MICHAEL, JAMES_ID, "skill-cloud", { decision: "verified", feedback: "x" })).toThrow("second review");
  });

  it("releases with a skill not verified, which is left out of the match", () => {
    submitJames();
    reviewJames();
    decide(MICHAEL, JAMES_ID, "skill-micro", { decision: "more_evidence", feedback: "More." });
    recordCalibration(SARAH, "cycle-h2", "Compared three decisions with another manager.");
    releaseResults(SARAH, "cycle-h2");
    expect(capabilityMatch(myAssessment(JAMES)!.items)).toMatchObject({ counted: 7, total: 8 });
    addCapabilityEvidence(JAMES, JAMES_ID, "skill-micro", evidence());
    decide(MICHAEL, JAMES_ID, "skill-micro", { decision: "verified", feedback: "Now clear." });
    expect(capabilityMatch(myAssessment(JAMES)!.items).counted).toBe(8);
  });

  it("lets the employee disagree once, with a different second reviewer", () => {
    releaseJames();
    expect(() => disagree(JAMES, JAMES_ID, "skill-cloud", "short")).toThrow("15");
    disagree(JAMES, JAMES_ID, "skill-cloud", "The second project was not considered.");
    expect(() => disagree(JAMES, JAMES_ID, "skill-cloud", "The second project was not considered.")).toThrow("already");
    expect(() => assignSecondReviewer(SARAH, JAMES_ID, "skill-cloud", MICHAEL.id)).toThrow("different");
    assignSecondReviewer(SARAH, JAMES_ID, "skill-cloud", SARAH.id);
    expect(() => decideSecondReview(MICHAEL, JAMES_ID, "skill-cloud", { decision: "verified", feedback: "x" })).toThrow();
    decideSecondReview(SARAH, JAMES_ID, "skill-cloud", { decision: "verified", feedback: "Agreed." });
    const i = myAssessment(JAMES)!.items[0]!;
    expect(i.verification!.level).toBe(5);
    expect(i.disagreement!.outcome!.changed).toBe(true);
  });

  it("refuses a disagreement after 10 working days", () => {
    expect(() => disagree(JAMES, "cycle-h1-emp-8721", "skill-micro", "This was a long time ago.")).toThrow("passed");
  });
});

describe("Access, adjustments and monitoring", () => {
  it("keeps results to the owner, reviewer, HR and admin", () => {
    expect(getAssessment(JAMES, ELENA)).toBeNull();
    expect(getAssessment({ ...SARAH, organisationId: "org-ths" }, ELENA)).toBeNull();
    for (const u of [MICHAEL, SARAH, PRIYA]) expect(getAssessment(u, ELENA)).not.toBeNull();
  });

  it("answers adjustment requests once", () => {
    requestAdjustment(JAMES, JAMES_ID, "Extra week please");
    respondToAdjustment(MICHAEL, JAMES_ID, 0, "Yes, one week.");
    expect(() => respondToAdjustment(SARAH, JAMES_ID, 0, "No")).toThrow("already");
  });

  it("computes cycle statistics and training gaps from decisions", () => {
    expect(cycleStats(PRIYA, "cycle-h2").overall).toMatchObject({ total: 2, selfAssessed: 1, verified: 0, remaining: 1 });
    releaseJames();
    const s = cycleStats(PRIYA, "cycle-h2");
    expect(s.overall).toMatchObject({ verified: 1, selfAssessed: 1, remaining: 0, skillsMetPct: 88, gapsClosed: 2 });
    expect(s.byReviewer.map((r) => r.name)).toEqual(["Michael Kyle"]);
    expect(releasedGaps(PRIYA).map((g) => g.item.name)).toEqual(["Cloud Infrastructure Design"]);
  });
});

describe("Screens", () => {
  it("employee: rates, reviews and submits; no scenario question", async () => {
    const { unmount } = render(<AssessmentStartView assessmentId="current" />);
    expect(screen.getByText(/Results are not used alone to decide pay/)).toBeTruthy();
    expect(screen.getByText("1 · Awareness")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: /4 · Advanced/ }));
    unmount();
    for (const i of myAssessment(JAMES)!.items) saveSelfRating(JAMES, JAMES_ID, i.skillId, 3);
    render(<AssessmentReviewView assessmentId="current" />);
    expect(screen.queryByText(/Practical Scenario/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Submit Assessment" }));
    expect(push).toHaveBeenCalledWith("/me/assessments/current/results");
    expect(myAssessment(JAMES)!.submittedAt).not.toBeNull();
  });

  it("employee: sees progress, then results with a second-review request", async () => {
    submitJames();
    reviewJames();
    render(<AssessmentResultsView assessmentId="current" />);
    expect(screen.getByText(/You will see your results when they are released/)).toBeTruthy();
    expect(screen.queryByText("Capability match")).toBeNull();
    act(() => {
      recordCalibration(SARAH, "cycle-h2", "Compared three decisions with another manager.");
      releaseResults(SARAH, "cycle-h2");
    });
    const expected = capabilityMatch(myAssessment(JAMES)!.items).percent;
    expect(screen.getByText(`${expected}%`)).toBeTruthy();
    const cloud = screen.getByRole("region", { name: "Cloud Infrastructure Design" });
    expect(within(cloud).getByText("Moderate gap")).toBeTruthy();
    await userEvent.click(within(cloud).getByRole("button", { name: "I disagree with this result" }));
    await userEvent.type(within(cloud).getByRole("textbox"), "My second project was missed.");
    await userEvent.click(within(cloud).getByRole("button", { name: "Ask for a second review" }));
    expect(within(cloud).getByText(/Second review requested/)).toBeTruthy();
  });

  it("manager: chooses a level when not verified, and cannot verify on old evidence", async () => {
    current = MICHAEL;
    render(<EvidenceReviewView evidenceId={ELENA} />);
    const micro = screen.getByRole("region", { name: "Microservices Design" });
    expect((within(micro).getByRole("radio", { name: /Verified – Requirements Met/ }) as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(within(micro).getByRole("radio", { name: /Not Verified/ }));
    const submit = within(micro).getByRole("button", { name: "Submit Verification" }) as HTMLButtonElement;
    await userEvent.type(within(micro).getByLabelText(/Feedback for Employee/), "Needs recent work.");
    expect(submit.disabled).toBe(true);
    await userEvent.selectOptions(within(micro).getByLabelText("Level the evidence supports"), "3");
    await userEvent.click(submit);
    expect(within(micro).getByText("Critical gap")).toBeTruthy();
  });

  it("admin: calibrates and releases; HRBP sees the dashboard without controls", async () => {
    submitJames();
    reviewJames();
    current = SARAH;
    const { unmount } = render(<CycleDashboardView cycleId="cycle-h2" />);
    expect((screen.getByRole("button", { name: "Release results" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByRole("textbox"), "Compared three decisions.");
    await userEvent.click(screen.getByRole("button", { name: "Record calibration" }));
    await userEvent.click(screen.getByRole("button", { name: "Release results" }));
    expect(myLatestResults(JAMES)!.cycleId).toBe("cycle-h2");
    expect(getCapabilityCycle(GEC, "cycle-h2")!.calibration!.by).toBe(SARAH.name);
    unmount();
    current = PRIYA;
    render(<CycleDashboardView cycleId="cycle-h2" />);
    expect(screen.getByRole("table", { name: "By department" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Release results" })).toBeNull();
    expect(listCapabilityCycles(GEC).length).toBe(2);
  });
});
