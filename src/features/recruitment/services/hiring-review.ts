/**
 * Hiring Manager review and shortlisting (BCMS Talent Assessment guide §15, §17).
 *
 * Rules the backend must keep:
 *  - Only the vacancy's Hiring Manager (a Line Manager) sees its candidates here and decides.
 *  - The report shows the saved assessment version, scoring rule and threshold snapshot used.
 *    Raw answers and scores are read-only: the Hiring Manager cannot edit them.
 *  - Decisions (Select for Physical Interview, Hold, Not Progressed) are recorded with who and
 *    when. A below-threshold result is proposed and a person confirms it. Changing the threshold-based outcome is an override: it needs a reason and
 *    is audited. The employer remains responsible for the final hiring decision.
 */
import { getMockOrganisation } from "@/config/mock-users";
import { getAssessmentVersion } from "@/features/assessment-library/services/org-library";

import { attemptFor } from "./delivery";
import { interviewFor } from "./interview";
import { getVacancy, listVacancies, recruitmentStore, RecruitmentError } from "./vacancies";
import type { Application, ApplicationStage, HmDecision, HmDecisionType, Vacancy } from "../types";

const nowIso = () => new Date().toISOString();
const data = () => recruitmentStore.data();

export type ReviewGroup = "qualified" | "human_review" | "not_progressed" | "in_progress";

export function groupOf(stage: ApplicationStage): ReviewGroup {
  if (stage === "qualified") return "qualified";
  if (stage === "human_review") return "human_review";
  if (stage === "not_progressed") return "not_progressed";
  return "in_progress";
}

function requireHiringManager(organisationId: string, vacancyId: string, userId: string): Vacancy {
  const vacancy = getVacancy(organisationId, vacancyId);
  if (!vacancy || vacancy.hiringManager?.userId !== userId) {
    throw new RecruitmentError("Only the vacancy's Hiring Manager can review its candidates.");
  }
  return vacancy;
}

export function latestDecision(app: Application): HmDecision | null {
  return app.decisions[app.decisions.length - 1] ?? null;
}

/** Vacancies this Hiring Manager reviews, with candidate counts per group. */
export function hiringManagerVacancies(organisationId: string, userId: string) {
  return listVacancies(organisationId)
    .filter((v) => v.hiringManager?.userId === userId && v.approvals.length > 0)
    .map((v) => {
      const apps = data().applications.filter((a) => a.vacancyId === v.id);
      const count = (g: ReviewGroup) => apps.filter((a) => groupOf(a.stage) === g).length;
      return {
        vacancy: v,
        applicants: apps.length,
        qualified: count("qualified"),
        humanReview: count("human_review"),
        notProgressed: count("not_progressed"),
        awaitingDecision: apps.filter((a) => a.stage === "qualified" && !latestDecision(a)).length,
      };
    });
}

export type CompetencyEvidence = {
  competency: string;
  cv: "found" | "unclear" | "not_found" | null;
  assessmentPct: number | null;
  interviewPct: number | null;
  /** Average of the scored sources; null when nothing was scored for this competency. */
  overallPct: number | null;
};

export type CandidateSummary = {
  application: Application;
  cvCoveragePct: number | null;
  assessmentPct: number | null;
  interviewPct: number | null;
  group: ReviewGroup;
  decision: HmDecision | null;
};

function pct(points: number, max: number) {
  return max > 0 ? Math.round((100 * points) / max) : null;
}

function summarise(organisationId: string, app: Application): CandidateSummary {
  return {
    application: structuredClone(app),
    cvCoveragePct: app.cvAnalysis?.result.coverage_pct ?? null,
    assessmentPct: attemptFor(organisationId, app.id)?.score?.percent ?? null,
    interviewPct: interviewFor(organisationId, app.id)?.score?.percent ?? null,
    group: groupOf(app.stage),
    decision: latestDecision(app),
  };
}

/** The shortlisting list for one vacancy (Hiring Manager only). */
export function shortlist(organisationId: string, vacancyId: string, userId: string) {
  const vacancy = requireHiringManager(organisationId, vacancyId, userId);
  const snapshot = vacancy.approvals[vacancy.approvals.length - 1] ?? null;
  return {
    vacancy,
    snapshot,
    candidates: data()
      .applications.filter((a) => a.vacancyId === vacancyId && a.organisationId === organisationId)
      .map((a) => summarise(organisationId, a))
      .sort((a, b) => (b.assessmentPct ?? -1) + (b.interviewPct ?? -1) - ((a.assessmentPct ?? -1) + (a.interviewPct ?? -1))),
  };
}

/** Skill-by-skill evidence from the CV, assessment and interview, on the role's competencies. */
export function competencyEvidence(organisationId: string, app: Application): CompetencyEvidence[] {
  const byName = new Map<string, { cv: CompetencyEvidence["cv"]; a: [number, number]; i: [number, number] }>();
  const row = (name: string) => {
    if (!byName.has(name)) byName.set(name, { cv: null, a: [0, 0], i: [0, 0] });
    return byName.get(name)!;
  };
  for (const s of app.cvAnalysis?.result.skills ?? []) row(s.skill_name).cv = s.status;
  const attempt = attemptFor(organisationId, app.id);
  if (attempt?.score && attempt.score.outcome !== "awaiting_written_scoring") {
    const version = getAssessmentVersion(organisationId, attempt.assessmentId, attempt.assessmentVersion);
    for (const item of version?.items ?? []) {
      const r = row(item.competency);
      if (item.responseType === "case_response") {
        const max = Math.max(...(item.scoring.rubric ?? [{ score: item.scoring.points }]).map((l) => l.score));
        r.a = [r.a[0] + (attempt.writtenScores[item.id]?.score ?? 0), r.a[1] + max];
      } else {
        const right = attempt.answers[item.id]?.optionId === item.scoring.correctOptionId;
        r.a = [r.a[0] + (right ? item.scoring.points : 0), r.a[1] + item.scoring.points];
      }
    }
  }
  const interview = interviewFor(organisationId, app.id);
  if (interview?.score) {
    const set = getAssessmentVersion(organisationId, interview.questionSetId, interview.questionSetVersion);
    for (const item of set?.items ?? []) {
      const r = row(item.competency);
      const c = interview.confirmedScores[item.id];
      if (c) r.i = [r.i[0] + c.score, r.i[1] + c.maxScore];
    }
  }
  return [...byName.entries()].map(([competency, r]) => {
    const assessmentPct = pct(r.a[0], r.a[1]);
    const interviewPct = pct(r.i[0], r.i[1]);
    const scored = [assessmentPct, interviewPct].filter((x): x is number => x !== null);
    return {
      competency,
      cv: r.cv,
      assessmentPct,
      interviewPct,
      overallPct: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
    };
  });
}

/** Full report for one candidate (Hiring Manager only, read-only). */
export function candidateReport(organisationId: string, applicationId: string, userId: string) {
  const app = data().applications.find((a) => a.id === applicationId && a.organisationId === organisationId);
  if (!app) throw new RecruitmentError("Candidate not found in your organisation.");
  const vacancy = requireHiringManager(organisationId, app.vacancyId, userId);
  const evidence = competencyEvidence(organisationId, app);
  return {
    summary: summarise(organisationId, app),
    vacancy,
    snapshot: vacancy.approvals.find((s) => s.version === app.thresholdVersion) ?? null,
    attempt: attemptFor(organisationId, app.id),
    interview: interviewFor(organisationId, app.id),
    evidence,
    strengths: evidence.filter((e) => e.overallPct !== null && e.overallPct >= 75).map((e) => e.competency),
    gaps: evidence.filter((e) => (e.overallPct !== null && e.overallPct < 50) || (e.overallPct === null && e.cv === "not_found")).map((e) => e.competency),
  };
}

/* ── decisions ─────────────────────────────────────────────────────────── */

function candidateFor(organisationId: string, applicationId: string, userId: string) {
  const app = data().applications.find((a) => a.id === applicationId && a.organisationId === organisationId);
  if (!app) throw new RecruitmentError("Candidate not found in your organisation.");
  requireHiringManager(organisationId, app.vacancyId, userId);
  return app;
}

function outcomeEmail(app: Application, decision: "selected" | "not_progressed") {
  const vacancy = getVacancy(app.organisationId, app.vacancyId);
  const org = getMockOrganisation(app.organisationId);
  data().outbox.push({
    id: recruitmentStore.nextId("mail"),
    organisationId: app.organisationId,
    vacancyId: app.vacancyId,
    applicationId: app.id,
    to: app.email,
    subject:
      decision === "selected"
        ? `Next step: interview for ${vacancy?.title ?? "your application"} (${app.reference})`
        : `Your application for ${vacancy?.title ?? ""} (${app.reference})`,
    body:
      decision === "selected"
        ? `Dear ${app.fullName},\n\nWe would like to invite you to an in-person interview. Our recruitment team will contact you to arrange a time.\n\n${org.name} Recruitment`
        : `Dear ${app.fullName},\n\nThank you for your time and interest. We will not be taking your application further on this occasion.\n\n${org.name} Recruitment`,
    kind: "shortlist_outcome",
    at: nowIso(),
  });
}

/**
 * Select for Physical Interview, Hold or Not Progressed. Selecting a candidate who did not meet
 * the approved thresholds is not allowed here: use an override with a reason first.
 */
export function decide(
  organisationId: string,
  applicationId: string,
  user: { userId: string; name: string },
  decision: Exclude<HmDecisionType, "override">,
  note: string,
) {
  const app = candidateFor(organisationId, applicationId, user.userId);
  const group = groupOf(app.stage);
  if (group === "in_progress") throw new RecruitmentError("This candidate has not finished the recruitment stages yet.");
  if (decision === "selected" && app.stage !== "qualified") {
    throw new RecruitmentError("Only qualified candidates can be selected. To select this candidate, override the outcome with a reason.");
  }
  if (decision === "not_progressed" && !note.trim()) throw new RecruitmentError("Give a reason for not progressing this candidate.");
  if (decision === "hold" && !note.trim()) throw new RecruitmentError("Add a note saying why the candidate is on hold.");
  const record: HmDecision = { id: recruitmentStore.nextId("dec"), decision, note: note.trim(), by: user.name, at: nowIso() };
  app.decisions.push(record);
  if (decision === "not_progressed" && app.stage !== "not_progressed") {
    app.stage = "not_progressed";
    app.proposedOutcome = null;
    app.stageHistory.push({ stage: "not_progressed", at: record.at, actor: user.name, note: `Hiring Manager decision: ${record.note}` });
  }
  if (decision === "selected" || decision === "not_progressed") outcomeEmail(app, decision);
  recruitmentStore.save();
}

/** Changes the automatic outcome (e.g. Not Progressed → Qualified). A reason is mandatory and audited. */
export function overrideOutcome(
  organisationId: string,
  applicationId: string,
  user: { userId: string; name: string },
  to: "qualified" | "not_progressed",
  reason: string,
) {
  const app = candidateFor(organisationId, applicationId, user.userId);
  if (reason.trim().length < 15) throw new RecruitmentError("An override needs a clear reason (at least 15 characters).");
  if (app.stage === to) throw new RecruitmentError("The candidate already has this outcome.");
  if (groupOf(app.stage) === "in_progress") throw new RecruitmentError("Overrides apply to completed outcomes only.");
  const from = app.stage;
  const record: HmDecision = {
    id: recruitmentStore.nextId("dec"),
    decision: "override",
    note: reason.trim(),
    by: user.name,
    at: nowIso(),
    override: { from, to, reason: reason.trim() },
  };
  app.decisions.push(record);
  app.stage = to;
  app.proposedOutcome = null;
  app.stageHistory.push({ stage: to, at: record.at, actor: user.name, note: `Override by Hiring Manager: ${record.note}` });
  recruitmentStore.save();
}

/** Candidates side by side on the same role-linked criteria (2–4, same vacancy). */
export function compareCandidates(organisationId: string, applicationIds: string[], userId: string) {
  if (applicationIds.length < 2 || applicationIds.length > 4) throw new RecruitmentError("Choose 2 to 4 candidates to compare.");
  const reports = applicationIds.map((id) => candidateReport(organisationId, id, userId));
  if (new Set(reports.map((r) => r.vacancy.id)).size > 1) throw new RecruitmentError("Compare candidates for the same vacancy.");
  const competencies = [...new Set(reports.flatMap((r) => r.evidence.map((e) => e.competency)))];
  return { reports, competencies };
}
