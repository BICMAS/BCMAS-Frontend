/**
 * Recruitment Insights (BCMS Talent Assessment guide §16).
 *
 * Every metric is calculated from candidate-stage records, carries its definition, numerator,
 * denominator and sample size, and is the same in the dashboard and the export. Example from the
 * guide: stage pass rate = candidates who passed the stage ÷ candidates who completed that stage.
 * Filters apply consistently to every figure. Only HRBPs may view or export.
 */
import { attemptFor } from "./delivery";
import { latestDecision } from "./hiring-review";
import { interviewFor } from "./interview";
import { listVacancies, recruitmentStore } from "./vacancies";
import type { Application, ApplicationStage, AssessmentAttempt, InterviewSession, Vacancy } from "../types";

export type InsightFilters = {
  /** ISO dates (YYYY-MM-DD), inclusive, applied to the application date. */
  from?: string;
  to?: string;
  vacancyId?: string;
  department?: string;
  location?: string;
  /** Vacancy owner (the recruiter). */
  recruiter?: string;
  stage?: ApplicationStage;
};

type Row = {
  app: Application;
  vacancy: Vacancy;
  attempt: AssessmentAttempt | null;
  interview: InterviewSession | null;
};

function rows(organisationId: string, f: InsightFilters): Row[] {
  const vacancies = new Map(listVacancies(organisationId).map((v) => [v.id, v]));
  return recruitmentStore
    .data()
    .applications.filter((a) => a.organisationId === organisationId)
    .flatMap((app) => {
      const vacancy = vacancies.get(app.vacancyId);
      if (!vacancy) return [];
      const day = app.submittedAt.slice(0, 10);
      if (f.from && day < f.from) return [];
      if (f.to && day > f.to) return [];
      if (f.vacancyId && vacancy.id !== f.vacancyId) return [];
      if (f.department && vacancy.department !== f.department) return [];
      if (f.location && vacancy.location !== f.location) return [];
      if (f.recruiter && vacancy.owner !== f.recruiter) return [];
      if (f.stage && app.stage !== f.stage) return [];
      return [{ app, vacancy, attempt: attemptFor(organisationId, app.id), interview: interviewFor(organisationId, app.id) }];
    });
}

export function filterOptions(organisationId: string) {
  const vacancies = listVacancies(organisationId).filter((v) => v.approvals.length > 0);
  const unique = (values: string[]) => [...new Set(values)].sort();
  return {
    vacancies: vacancies.map((v) => ({ id: v.id, title: v.title })),
    departments: unique(vacancies.map((v) => v.department)),
    locations: unique(vacancies.map((v) => v.location)),
    recruiters: unique(vacancies.map((v) => v.owner)),
  };
}

/* ── metrics ───────────────────────────────────────────────────────────── */

export type Metric = {
  id: string;
  label: string;
  /** Formatted value, e.g. "63%" or "12". "—" when the denominator is 0. */
  value: string;
  numerator: number;
  denominator: number | null;
  definition: string;
};

const rate = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);
const CV_MATCH = 60;

const assessmentFinal = (r: Row) => !!r.attempt?.score && r.attempt.score.outcome !== "awaiting_written_scoring";
const selected = (r: Row) => latestDecision(r.app)?.decision === "selected";

export function metrics(organisationId: string, f: InsightFilters = {}): Metric[] {
  const all = rows(organisationId, f);
  const analysed = all.filter((r) => r.app.cvAnalysis);
  const matched = analysed.filter((r) => r.app.cvAnalysis!.result.coverage_pct >= CV_MATCH);
  const aInvited = all.filter((r) => r.attempt);
  const aCompleted = aInvited.filter((r) => r.attempt!.status === "submitted");
  const aScored = aCompleted.filter(assessmentFinal);
  const aPassed = aScored.filter((r) => r.attempt!.score!.outcome === "passed");
  const iInvited = all.filter((r) => r.interview);
  const iCompleted = iInvited.filter((r) => r.interview!.status === "submitted");
  const iScored = iCompleted.filter((r) => r.interview!.score);
  const iPassed = iScored.filter((r) => r.interview!.score!.outcome === "passed");
  const qualified = all.filter((r) => r.app.stage === "qualified");
  const chosen = all.filter(selected);
  const overrides = all.filter((r) => r.app.decisions.some((d) => d.decision === "override"));

  const m = (id: string, label: string, numerator: number, denominator: number | null, definition: string): Metric => ({
    id,
    label,
    value: denominator === null ? String(numerator) : rate(numerator, denominator),
    numerator,
    denominator,
    definition,
  });
  return [
    m("applications", "Applications", all.length, null, "Applications received in the selected period and filters."),
    m("cv_match_rate", "CV match rate", matched.length, analysed.length, `CVs with evidence for at least ${CV_MATCH}% of required skills ÷ CVs analysed. A screening signal, not a pass mark.`),
    m("assessment_completion", "Assessment completion rate", aCompleted.length, aInvited.length, "Candidates who submitted the role-based assessment ÷ candidates invited to it."),
    m("assessment_pass", "Assessment pass rate", aPassed.length, aScored.length, "Candidates at or above the approved assessment threshold ÷ candidates whose assessment was fully scored."),
    m("interview_completion", "AI-avatar interview completion rate", iCompleted.length, iInvited.length, "Candidates who completed the interview ÷ candidates invited to it."),
    m("interview_pass", "AI-avatar interview pass rate", iPassed.length, iScored.length, "Candidates at or above the approved interview threshold ÷ candidates whose interview scores were confirmed."),
    m("qualified", "Qualified", qualified.length, null, "Candidates currently Qualified (met every approved threshold, or qualified by a recorded override)."),
    m("selections", "Physical interview selections", chosen.length, null, "Candidates whose latest Hiring Manager decision is Select for Physical Interview."),
    m("overrides", "Overrides", overrides.length, null, "Candidates whose automatic outcome was changed by a Hiring Manager override (with a recorded reason)."),
  ];
}

/* ── funnel ────────────────────────────────────────────────────────────── */

export type FunnelStep = { id: string; label: string; count: number; conversion: string; dropOff: number };

const STEPS: Array<[string, string, (r: Row) => boolean]> = [
  ["applied", "Applied", () => true],
  ["cv", "CV analysed", (r) => !!r.app.cvAnalysis],
  ["a_invited", "Assessment invited", (r) => !!r.attempt],
  ["a_completed", "Assessment completed", (r) => r.attempt?.status === "submitted"],
  ["a_passed", "Assessment passed", (r) => r.attempt?.score?.outcome === "passed"],
  ["i_invited", "Interview invited", (r) => !!r.interview],
  ["i_completed", "Interview completed", (r) => r.interview?.status === "submitted"],
  ["qualified", "Qualified", (r) => r.app.stage === "qualified" || selected(r)],
  ["selected", "Selected for physical interview", selected],
];

function funnelOf(list: Row[]): FunnelStep[] {
  let previous: number | null = null;
  return STEPS.map(([id, label, test]) => {
    const count = list.filter(test).length;
    const step = {
      id,
      label,
      count,
      conversion: previous === null ? "—" : rate(count, previous),
      dropOff: previous === null ? 0 : Math.max(0, previous - count),
    };
    previous = count;
    return step;
  });
}

export function funnel(organisationId: string, f: InsightFilters = {}) {
  return funnelOf(rows(organisationId, f));
}

/** The candidates counted at one funnel step (for drilling into the numbers). */
export function funnelCandidates(organisationId: string, f: InsightFilters, stepId: string) {
  const step = STEPS.find(([id]) => id === stepId);
  if (!step) return [];
  return rows(organisationId, f)
    .filter(step[2])
    .map((r) => ({ id: r.app.id, name: r.app.fullName, vacancy: r.vacancy.title, stage: r.app.stage }));
}

export type GroupRow = {
  key: string;
  label: string;
  applications: number;
  assessmentCompleted: number;
  assessmentPassRate: string;
  interviewCompleted: number;
  qualified: number;
  selected: number;
};

function groupBy(list: Row[], key: (r: Row) => string, label: (r: Row) => string): GroupRow[] {
  const groups = new Map<string, Row[]>();
  for (const r of list) groups.set(key(r), [...(groups.get(key(r)) ?? []), r]);
  return [...groups.entries()].map(([k, g]) => {
    const scored = g.filter(assessmentFinal);
    return {
      key: k,
      label: label(g[0]!),
      applications: g.length,
      assessmentCompleted: g.filter((r) => r.attempt?.status === "submitted").length,
      assessmentPassRate: rate(scored.filter((r) => r.attempt!.score!.outcome === "passed").length, scored.length),
      interviewCompleted: g.filter((r) => r.interview?.status === "submitted").length,
      qualified: g.filter((r) => r.app.stage === "qualified" || selected(r)).length,
      selected: g.filter(selected).length,
    };
  });
}

export function byVacancy(organisationId: string, f: InsightFilters = {}) {
  return groupBy(rows(organisationId, f), (r) => r.vacancy.id, (r) => `${r.vacancy.title} · ${r.vacancy.location}`);
}

export function byDepartment(organisationId: string, f: InsightFilters = {}) {
  return groupBy(rows(organisationId, f), (r) => r.vacancy.department, (r) => r.vacancy.department);
}

/* ── time in stage ─────────────────────────────────────────────────────── */

export type StageTime = { id: string; label: string; averageDays: string; medianDays: string; sample: number; definition: string };

function days(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const d = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  return d >= 0 ? d : null;
}

function summariseDays(values: number[]) {
  if (values.length === 0) return { averageDays: "—", medianDays: "—" };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const fmt = (v: number) => (v < 1 ? `${Math.round(v * 24)} h` : `${v.toFixed(1)} d`);
  return { averageDays: fmt(values.reduce((a, b) => a + b, 0) / values.length), medianDays: fmt(median) };
}

export function timeInStage(organisationId: string, f: InsightFilters = {}): StageTime[] {
  const list = rows(organisationId, f);
  const firstSelection = (r: Row) => r.app.decisions.find((d) => d.decision === "selected")?.at;
  const measures: Array<[string, string, (r: Row) => number | null, string]> = [
    ["to_cv", "Application → CV analysed", (r) => days(r.app.submittedAt, r.app.cvAnalysis?.analysedAt), "From application to the first saved CV analysis."],
    ["assessment", "Assessment invited → completed", (r) => days(r.attempt?.invitedAt, r.attempt?.submittedAt), "From the assessment invitation to submission."],
    ["to_interview", "Assessment completed → interview invited", (r) => days(r.attempt?.submittedAt, r.interview?.invitedAt), "From assessment submission to the interview invitation."],
    ["interview", "Interview invited → completed", (r) => days(r.interview?.invitedAt, r.interview?.submittedAt), "From the interview invitation to completion."],
    ["to_shortlist", "Time to shortlist", (r) => days(r.app.submittedAt, firstSelection(r)), "From application to selection for a physical interview."],
  ];
  return measures.map(([id, label, measure, definition]) => {
    const values = list.map(measure).filter((v): v is number => v !== null);
    return { id, label, ...summariseDays(values), sample: values.length, definition };
  });
}

/** Where candidates stopped: candidates whose last stage before Not Progressed was each stage. */
export function dropOffByStage(organisationId: string, f: InsightFilters = {}) {
  const counts = new Map<ApplicationStage, number>();
  for (const r of rows(organisationId, f)) {
    if (r.app.stage !== "not_progressed") continue;
    const before = [...r.app.stageHistory].reverse().find((h) => h.stage !== "not_progressed")?.stage ?? "new_application";
    counts.set(before, (counts.get(before) ?? 0) + 1);
  }
  return [...counts.entries()].map(([stage, count]) => ({ stage, count }));
}
