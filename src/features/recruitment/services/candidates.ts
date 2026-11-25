/**
 * Candidate pipeline (BCMS Talent Assessment guide §11–12), on the same records as vacancies.
 *
 * Rules for the backend:
 *  - Candidates and CVs are private to the organisation and its recruitment users.
 *  - CV analysis comes from the AI talent agent (talent.analyze_cv). It is a screening signal:
 *    it is stored separately from assessment scores and never rejects a candidate by itself.
 *  - Every stage change, note and flag is recorded with who and when.
 */
import type { CvAnalysis } from "@ai/contracts";

import { approvedRoleProfiles, getVacancy, recruitmentStore, RecruitmentError } from "./vacancies";
import { roleCompetencies } from "@/features/assessment-library/services/ai-builder";

import type { Application, ApplicationStage, Vacancy } from "../types";

export type CandidateRow = Application & { vacancyTitle: string };

function find(organisationId: string, id: string) {
  const app = recruitmentStore.data().applications.find((a) => a.id === id && a.organisationId === organisationId);
  if (!app) throw new RecruitmentError("Candidate not found in your organisation.");
  return app;
}

function vacancyTitles(organisationId: string) {
  return new Map(
    recruitmentStore
      .data()
      .vacancies.filter((v) => v.organisationId === organisationId)
      .map((v) => [v.id, v.title]),
  );
}

export function listCandidates(organisationId: string): CandidateRow[] {
  const titles = vacancyTitles(organisationId);
  return recruitmentStore
    .data()
    .applications.filter((a) => a.organisationId === organisationId)
    .map((a) => ({ ...structuredClone(a), vacancyTitle: titles.get(a.vacancyId) ?? "—" }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function getCandidate(organisationId: string, id: string): CandidateRow | null {
  return listCandidates(organisationId).find((c) => c.id === id) ?? null;
}

const AFTER_ASSESSMENT: ApplicationStage[] = ["assessment_completed", "avatar_invited", "avatar_completed", "qualified"];

export function candidateCounts(organisationId: string) {
  const list = listCandidates(organisationId);
  return {
    applicants: list.length,
    cvAnalysed: list.filter((c) => c.cvAnalysis).length,
    assessmentCompleted: list.filter((c) => AFTER_ASSESSMENT.includes(c.stage)).length,
    qualified: list.filter((c) => c.stage === "qualified").length,
  };
}

/** Short CV signal for lists: never a pass/fail. */
export function cvSignal(c: Application): { label: string; tone: "success" | "warning" | "secondary" | "info" } {
  if (c.extractionIssue) return { label: "Extraction issue", tone: "warning" };
  if (!c.cvAnalysis) return { label: c.cvText ? "Not analysed yet" : "CV text unavailable", tone: "secondary" };
  const r = c.cvAnalysis.result;
  if (r.coverage_pct >= 60) return { label: "Relevant evidence", tone: "success" };
  if (r.evidence_found + r.unclear > 0) return { label: "Some evidence", tone: "info" };
  return { label: "Review needed", tone: "warning" };
}

/** Role requirements the CV is compared with, from the vacancy's approved role profile. */
export function cvRequirements(vacancy: Vacancy) {
  const role = approvedRoleProfiles().find((r) => r.id === vacancy.roleId);
  if (!role) return null;
  return {
    roleTitle: role.title,
    requirements: roleCompetencies(role).map((c) => ({
      skill_name: c.name,
      category: c.category,
      target_level: c.level === "—" ? null : c.level,
    })),
  };
}

function moveTo(app: Application, stage: ApplicationStage, actor: string, note?: string) {
  if (app.stage === stage) return;
  app.stage = stage;
  app.stageHistory.push({ stage, at: new Date().toISOString(), actor, note });
}

export function saveCvAnalysis(organisationId: string, id: string, result: CvAnalysis, actor: string) {
  const app = find(organisationId, id);
  const vacancy = getVacancy(organisationId, app.vacancyId);
  app.cvAnalysis = { result, analysedAt: new Date().toISOString(), analysedBy: actor, roleTitle: vacancy?.roleTitle ?? result.role_title };
  if (app.stage === "new_application") moveTo(app, "cv_analysis", actor, "CV analysed; awaiting HR review");
  recruitmentStore.save();
}

export function addNote(organisationId: string, id: string, text: string, actor: string) {
  if (!text.trim()) throw new RecruitmentError("Write a note first.");
  const app = find(organisationId, id);
  app.notes.push({ id: recruitmentStore.nextId("note"), text: text.trim(), author: actor, at: new Date().toISOString() });
  recruitmentStore.save();
}

export function markForHumanReview(organisationId: string, id: string, reason: string, actor: string) {
  if (!reason.trim()) throw new RecruitmentError("Say why this candidate needs a human review.");
  const app = find(organisationId, id);
  if (app.stage === "human_review") throw new RecruitmentError("This candidate is already marked for human review.");
  moveTo(app, "human_review", actor, reason.trim());
  recruitmentStore.save();
}

/** Ends a human review by returning the candidate to the stage they were at before. */
export function completeHumanReview(organisationId: string, id: string, note: string, actor: string) {
  const app = find(organisationId, id);
  if (app.stage !== "human_review") throw new RecruitmentError("This candidate is not in human review.");
  if (app.proposedOutcome) throw new RecruitmentError("Confirm the outcome, or refer it to the Hiring Manager.");
  const previous = [...app.stageHistory].reverse().find((h) => h.stage !== "human_review")?.stage ?? "new_application";
  moveTo(app, previous, actor, note.trim() || "Human review completed");
  recruitmentStore.save();
}

export function flagExtractionIssue(organisationId: string, id: string, note: string, actor: string) {
  if (!note.trim()) throw new RecruitmentError("Describe the problem with the CV text.");
  const app = find(organisationId, id);
  app.extractionIssue = { note: note.trim(), by: actor, at: new Date().toISOString() };
  recruitmentStore.save();
}

/** HR supplies corrected CV text (e.g. for a scanned PDF); clears the flag and the old analysis. */
export function replaceCvText(organisationId: string, id: string, text: string, actor: string) {
  if (text.trim().length < 50) throw new RecruitmentError("Paste at least a few lines of the CV (50 characters or more).");
  const app = find(organisationId, id);
  const issue = app.extractionIssue;
  app.cvText = text.trim().slice(0, 60_000);
  app.extractionIssue = null;
  app.cvAnalysis = null;
  app.notes.push({
    id: recruitmentStore.nextId("note"),
    text: `${issue ? `Extraction issue resolved ("${issue.note}"). ` : ""}CV text corrected by HR; re-run the CV analysis.`,
    author: actor,
    at: new Date().toISOString(),
  });
  recruitmentStore.save();
}
