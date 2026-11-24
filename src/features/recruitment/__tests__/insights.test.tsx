import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { getAssessmentVersion, resetOrgLibrary } from "@/features/assessment-library/services/org-library";

import { RecruitmentInsightsView } from "../components/recruitment-insights-view";
import { RecruitmentOverviewView } from "../components/recruitment-overview-view";
import { inviteToAssessment, saveAnswer, scoreWrittenAnswer, startAssessment, submitAssessment } from "../services/delivery";
import { decide } from "../services/hiring-review";
import { byVacancy, funnel, metrics, timeInStage } from "../services/insights";
import { confirmInterviewScores, giveConsent, inviteToInterview, saveInterviewAnswer, startInterview, submitInterview } from "../services/interview";
import { resetRecruitment } from "../services/vacancies";

// BCMS Talent Assessment guide, step 8: Recruitment Insights and the Talent Assessment overview.

const download = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/spreadsheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/spreadsheet")>()),
  downloadWorkbookSheets: download,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/talent/insights",
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
const MICHAEL = { userId: "user-michael", name: getMockUser("user-michael").name };

function takeAssessment(appId: string, correct: boolean, written: number) {
  const token = inviteToAssessment(GEC, appId, HRBP);
  startAssessment(token);
  for (const item of getAssessmentVersion(GEC, "oa-sales-custom", "1.0")!.items) {
    if (item.responseType === "case_response") saveAnswer(token, item.id, { text: "Plan by outlet value." });
    else {
      const key = item.scoring.correctOptionId!;
      saveAnswer(token, item.id, { optionId: correct ? key : item.options.find((o) => o.id !== key)!.id });
    }
  }
  submitAssessment(token);
  scoreWrittenAnswer(GEC, appId, "q05", written, "", HRBP);
}

/** Adaeze qualifies and is selected; Bola falls below the assessment threshold; Chinedu has only applied. */
function pipeline() {
  takeAssessment("app-se-1", true, 4);
  const token = inviteToInterview(GEC, "app-se-1", HRBP);
  giveConsent(token, "text", "");
  startInterview(token);
  saveInterviewAnswer(token, "q01", "A specific example.", "text");
  submitInterview(token);
  confirmInterviewScores(GEC, "app-se-1", { q01: { score: 4 }, q02: { score: 3 }, q03: { score: 3 }, q04: { score: 2 } }, HRBP);
  decide(GEC, "app-se-1", MICHAEL, "selected", "");
  takeAssessment("app-se-2", false, 1);
}

beforeEach(() => {
  download.mockClear();
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
  session.userId = "user-priya";
  pipeline();
});

describe("Insight calculations", () => {
  it("calculates every metric from candidate records with its numerator and denominator", () => {
    const m = Object.fromEntries(metrics(GEC).map((x) => [x.id, x]));
    expect(m.applications).toMatchObject({ value: "3", numerator: 3, denominator: null });
    expect(m.assessment_completion).toMatchObject({ value: "100%", numerator: 2, denominator: 2 });
    expect(m.assessment_pass).toMatchObject({ value: "50%", numerator: 1, denominator: 2 });
    expect(m.interview_completion).toMatchObject({ value: "100%", numerator: 1, denominator: 1 });
    expect(m.interview_pass).toMatchObject({ value: "100%", numerator: 1, denominator: 1 });
    expect(m.selections).toMatchObject({ value: "1" });
    expect(m.cv_match_rate).toMatchObject({ value: "—", denominator: 0 }); // no CVs analysed: no rate, not 0%
    expect(m.assessment_pass!.definition).toMatch(/÷ candidates whose assessment was fully scored/);
  });

  it("shows the funnel with conversion and drop-off, by vacancy, and time in stage with sample sizes", () => {
    const f = Object.fromEntries(funnel(GEC).map((s) => [s.id, s]));
    expect(f.applied).toMatchObject({ count: 3, conversion: "—" });
    expect(f.a_invited).toMatchObject({ count: 2 });
    expect(f.a_passed).toMatchObject({ count: 1, conversion: "50%", dropOff: 1 });
    expect(f.selected).toMatchObject({ count: 1 });
    expect(byVacancy(GEC)[0]).toMatchObject({ label: "Sales Executive · Lagos", applications: 3, assessmentPassRate: "50%", selected: 1 });
    const t = Object.fromEntries(timeInStage(GEC).map((x) => [x.id, x]));
    expect(t.assessment!.sample).toBe(2);
    expect(t.to_shortlist!.sample).toBe(1);
    expect(t.to_cv).toMatchObject({ sample: 0, averageDays: "—" });
  });

  it("applies filters consistently", () => {
    expect(metrics(GEC, { stage: "not_progressed" }).find((m) => m.id === "applications")!.numerator).toBe(1);
    expect(metrics(GEC, { vacancyId: "vac-kam" }).find((m) => m.id === "applications")!.numerator).toBe(0);
    expect(metrics(GEC, { from: "2999-01-01" }).find((m) => m.id === "applications")!.numerator).toBe(0);
  });
});

describe("Recruitment Insights screen", () => {
  it("shows metrics with definitions, drills into funnel stages and exports the report", async () => {
    const user = userEvent.setup();
    render(<RecruitmentInsightsView />);
    const table = screen.getByRole("table", { name: "Metrics" });
    await user.click(within(table).getByRole("button", { name: "Assessment pass rate" }));
    const definition = screen.getByRole("complementary", { name: "Metric definition" });
    expect(within(definition).getByText(/fully scored/)).toBeTruthy();
    expect(within(definition).getByText(/Small sample/)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Funnel" }));
    await user.click(screen.getByRole("button", { name: /Selected for physical interview/ }));
    expect(within(screen.getByRole("list", { name: "Candidates at Selected for physical interview" })).getByText("Adaeze Okonkwo")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Current stage"), "not_progressed");
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(within(screen.getByRole("table", { name: "Metrics" })).getByText("n = 1")).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Export Report" })[0]!);
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [, sheets] = download.mock.calls[0] as unknown as [string, Array<{ sheetName: string }>];
    expect(sheets.map((s) => s.sheetName)).toEqual(["Metrics", "Funnel", "By vacancy", "By department", "Time in stage"]);
  });

  it("is for HRBPs only", () => {
    session.userId = "user-james";
    render(<RecruitmentInsightsView />);
    expect(screen.getByText(/Vacancy management is for HRBPs/)).toBeTruthy();
  });
});

describe("Talent Assessment overview", () => {
  it("summarises the journey and links to what needs attention", () => {
    render(<RecruitmentOverviewView />);
    expect(screen.getByText("Selected for physical interview")).toBeTruthy();
    const attention = screen.getByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText("Vacancies waiting for Hiring Manager approval")).toBeTruthy(); // Key Account Manager
    expect(within(attention).getByText("New applications to analyse")).toBeTruthy(); // Chinedu
  });
});
