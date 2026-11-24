/**
 * Role-based assessment delivery and scoring (BCMS Talent Assessment guide §13, §17).
 *
 * Rules the backend must keep (this sample-data version runs them in the browser):
 *  - Invitations go to the candidate's confirmed email with a secure, expiring link. Resending
 *    replaces the link; the old one stops working.
 *  - Every candidate for a vacancy gets the exact assessment version in the threshold snapshot
 *    they applied under. The candidate API returns questions only — never answer keys or rubrics.
 *  - Answers autosave; an interrupted candidate resumes where they stopped. One attempt.
 *  - Objective items are scored with the fixed answer key. Written answers are scored by a person
 *    against the approved rubric. The result records the assessment version, scoring-rule version
 *    and threshold snapshot, and progression follows the approved threshold with a stated reason.
 *  - HR never sees or changes a candidate's answers before they submit.
 */
import { getMockOrganisation } from "@/config/mock-users";
import { getAssessmentVersion } from "@/features/assessment-library/services/org-library";
import { candidateView } from "@/features/assessment-library/services/versioning";
import type { TemplateVersion } from "@/features/assessment-library/types";

import { getVacancy, recruitmentStore, RecruitmentError } from "./vacancies";
import type {
  Application,
  ApplicationStage,
  AssessmentAttempt,
  AttemptAnswer,
  AttemptEvent,
  AttemptScore,
  Vacancy,
} from "../types";

export const INVITATION_DAYS = 7;
export const SCORING_RULE_VERSION = "objective-key-v1 + written-rubric-human-v1";
const MAX_TEXT_ANSWER = 5000;

const nowIso = () => new Date().toISOString();

export function assessmentLink(token: string) {
  return `/assessment/${token}`;
}

function newToken() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function event(attempt: AssessmentAttempt, type: AttemptEvent["type"], note?: string) {
  attempt.events.push({ type, at: nowIso(), note });
}

/**
 * Moves the candidate and records why. When the stage stays the same but there is a new reason
 * (e.g. a final score after written marking), the reason is still recorded.
 */
function setStage(app: Application, stage: ApplicationStage, actor: string, note?: string) {
  const last = app.stageHistory[app.stageHistory.length - 1];
  if (app.stage === stage && (!note || last?.note === note)) return;
  app.stage = stage;
  app.stageHistory.push({ stage, at: nowIso(), actor, note });
}

function data() {
  return recruitmentStore.data();
}

function application(organisationId: string, id: string) {
  const app = data().applications.find((a) => a.id === id && a.organisationId === organisationId);
  if (!app) throw new RecruitmentError("Candidate not found in your organisation.");
  return app;
}

/** The latest attempt for a candidate (one attempt is allowed per application). */
export function attemptFor(organisationId: string, applicationId: string): AssessmentAttempt | null {
  const found = data().attempts.find((a) => a.applicationId === applicationId && a.organisationId === organisationId);
  return found ? structuredClone(found) : null;
}

function snapshotFor(vacancy: Vacancy, app: Application) {
  return vacancy.approvals.find((a) => a.version === app.thresholdVersion) ?? null;
}

function email(attempt: AssessmentAttempt, app: Application, kind: "assessment_invitation" | "assessment_submitted") {
  const vacancy = getVacancy(app.organisationId, app.vacancyId);
  const org = getMockOrganisation(app.organisationId);
  const link = assessmentLink(attempt.token);
  const expires = new Date(attempt.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  data().outbox.push({
    id: recruitmentStore.nextId("mail"),
    organisationId: app.organisationId,
    vacancyId: app.vacancyId,
    applicationId: app.id,
    to: app.email,
    subject:
      kind === "assessment_invitation"
        ? `Your assessment for ${vacancy?.title ?? "your application"} (${app.reference})`
        : `Assessment received: ${vacancy?.title ?? ""} (${app.reference})`,
    body:
      kind === "assessment_invitation"
        ? `Dear ${app.fullName},\n\nPlease complete the ${attempt.assessmentName} assessment (about ${attempt.durationMinutes} minutes) by ${expires}: ${link}\n\nThe link is personal to you and works once.\n\n${org.name} Recruitment`
        : `Dear ${app.fullName},\n\nThank you. We have received your assessment and will email you about the next steps.\n\n${org.name} Recruitment`,
    kind,
    at: nowIso(),
  });
}

/* ── HR: invitations ──────────────────────────────────────────────────── */

export function inviteToAssessment(organisationId: string, applicationId: string, actor: string) {
  const app = application(organisationId, applicationId);
  const vacancy = getVacancy(organisationId, app.vacancyId);
  if (!vacancy) throw new RecruitmentError("The vacancy for this candidate no longer exists.");
  if (!vacancy.stages.assessment.enabled) throw new RecruitmentError("This vacancy does not use a role-based assessment.");
  if (data().attempts.some((a) => a.applicationId === app.id)) {
    throw new RecruitmentError("This candidate has already been invited. Use Resend Invitation instead.");
  }
  if (!["new_application", "cv_analysis"].includes(app.stage)) {
    throw new RecruitmentError(
      app.stage === "human_review"
        ? "Complete the human review before inviting this candidate."
        : "This candidate is past the invitation stage.",
    );
  }
  const snapshot = snapshotFor(vacancy, app);
  const ref = snapshot?.assessmentRef;
  if (!snapshot || !ref || snapshot.assessment === null) {
    throw new RecruitmentError("There is no approved assessment and threshold for this candidate's application.");
  }
  if (!getAssessmentVersion(organisationId, ref.assessmentId, ref.version)) {
    throw new RecruitmentError(`${ref.name} v${ref.version} is not available.`);
  }
  const attempt: AssessmentAttempt = {
    id: recruitmentStore.nextId("att"),
    applicationId: app.id,
    organisationId,
    vacancyId: vacancy.id,
    token: newToken(),
    expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000).toISOString(),
    assessmentId: ref.assessmentId,
    assessmentVersion: ref.version,
    assessmentName: ref.name,
    durationMinutes: ref.durationMinutes,
    thresholdSnapshotVersion: snapshot.version,
    status: "invited",
    invitedAt: nowIso(),
    startedAt: null,
    submittedAt: null,
    position: 0,
    answers: {},
    flagged: [],
    events: [],
    writtenScores: {},
    score: null,
    resentCount: 0,
  };
  event(attempt, "invited", `by ${actor}`);
  data().attempts.push(attempt);
  email(attempt, app, "assessment_invitation");
  setStage(app, "assessment_invited", actor, `${ref.name} v${ref.version}; link valid ${INVITATION_DAYS} days`);
  recruitmentStore.save();
  return attempt.token;
}

/** New link and expiry; answers already saved are kept. The old link stops working. */
export function resendInvitation(organisationId: string, applicationId: string, actor: string) {
  const app = application(organisationId, applicationId);
  const attempt = data().attempts.find((a) => a.applicationId === app.id);
  if (!attempt) throw new RecruitmentError("This candidate has not been invited yet.");
  if (attempt.status === "submitted") throw new RecruitmentError("The candidate has already submitted the assessment.");
  attempt.token = newToken();
  attempt.expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000).toISOString();
  if (attempt.status === "expired") attempt.status = attempt.startedAt ? "in_progress" : "invited";
  attempt.resentCount += 1;
  event(attempt, "resent", `by ${actor}`);
  email(attempt, app, "assessment_invitation");
  recruitmentStore.save();
  return attempt.token;
}

/* ── Candidate side (no login; the token is the credential) ─────────── */

function byToken(token: string) {
  const attempt = data().attempts.find((a) => a.token === token);
  if (!attempt) throw new RecruitmentError("This assessment link is not valid. Please use the latest link we emailed you.");
  return attempt;
}

/** Applies link expiry and the time limit. Returns true when something changed. */
function refresh(attempt: AssessmentAttempt): boolean {
  if (attempt.status === "submitted") return false;
  if (attempt.status === "in_progress" && attempt.startedAt) {
    const deadline = new Date(attempt.startedAt).getTime() + attempt.durationMinutes * 60_000;
    if (Date.now() >= deadline) {
      event(attempt, "time_expired");
      finishSubmission(attempt, "Time allowed ended; answers saved so far were submitted.");
      return true;
    }
  }
  if (Date.now() > new Date(attempt.expiresAt).getTime() && attempt.status !== "expired") {
    attempt.status = "expired";
    return true;
  }
  return false;
}

export type CandidateAssessment = {
  status: AssessmentAttempt["status"];
  organisationName: string;
  vacancyTitle: string;
  assessmentName: string;
  durationMinutes: number;
  expiresAt: string;
  /** Questions without answer keys or rubrics. */
  items: ReturnType<typeof candidateView>["items"];
  answers: Record<string, AttemptAnswer>;
  flagged: string[];
  position: number;
  remainingSeconds: number | null;
  supportEmail: string;
};

/** Everything the candidate's browser may see. Nothing here reveals how answers are scored. */
export function getCandidateAssessment(token: string): CandidateAssessment | null {
  const attempt = data().attempts.find((a) => a.token === token);
  if (!attempt) return null;
  if (refresh(attempt)) recruitmentStore.save();
  const version = getAssessmentVersion(attempt.organisationId, attempt.assessmentId, attempt.assessmentVersion);
  const vacancy = getVacancy(attempt.organisationId, attempt.vacancyId);
  const org = getMockOrganisation(attempt.organisationId);
  const remaining =
    attempt.status === "in_progress" && attempt.startedAt
      ? Math.max(0, Math.round((new Date(attempt.startedAt).getTime() + attempt.durationMinutes * 60_000 - Date.now()) / 1000))
      : null;
  return {
    status: attempt.status,
    organisationName: org.name,
    vacancyTitle: vacancy?.title ?? "",
    assessmentName: attempt.assessmentName,
    durationMinutes: attempt.durationMinutes,
    expiresAt: attempt.expiresAt,
    items: version ? candidateView(version).items : [],
    answers: structuredClone(attempt.answers),
    flagged: [...attempt.flagged],
    position: attempt.position,
    remainingSeconds: remaining,
    supportEmail: `recruitment@${org.shortName.toLowerCase()}.example`,
  };
}

function requireInProgress(attempt: AssessmentAttempt) {
  if (refresh(attempt)) recruitmentStore.save();
  if (attempt.status === "expired") throw new RecruitmentError("This assessment link has expired. Contact the recruitment team for a new link.");
  if (attempt.status === "submitted") throw new RecruitmentError("You have already submitted this assessment.");
  if (attempt.status !== "in_progress") throw new RecruitmentError("Start the assessment first.");
}

export function startAssessment(token: string) {
  const attempt = byToken(token);
  if (refresh(attempt)) recruitmentStore.save();
  if (attempt.status === "expired") throw new RecruitmentError("This assessment link has expired. Contact the recruitment team for a new link.");
  if (attempt.status === "submitted") throw new RecruitmentError("You have already submitted this assessment.");
  if (attempt.status === "invited") {
    attempt.status = "in_progress";
    attempt.startedAt = nowIso();
    event(attempt, "started");
  } else {
    event(attempt, "resumed", `at question ${attempt.position + 1}`);
  }
  recruitmentStore.save();
}

function itemsOf(attempt: AssessmentAttempt) {
  const version = getAssessmentVersion(attempt.organisationId, attempt.assessmentId, attempt.assessmentVersion);
  if (!version) throw new RecruitmentError("This assessment is not available. Contact the recruitment team.");
  return version;
}

/** Autosave of one answer. Choice answers must be one of the item's options. */
export function saveAnswer(token: string, itemId: string, answer: { optionId?: string; text?: string }) {
  const attempt = byToken(token);
  requireInProgress(attempt);
  const item = itemsOf(attempt).items.find((i) => i.id === itemId);
  if (!item) throw new RecruitmentError("That question is not part of this assessment.");
  if (item.responseType === "case_response") {
    attempt.answers[itemId] = { text: (answer.text ?? "").slice(0, MAX_TEXT_ANSWER), savedAt: nowIso() };
  } else {
    if (!item.options.some((o) => o.id === answer.optionId)) throw new RecruitmentError("Choose one of the options.");
    attempt.answers[itemId] = { optionId: answer.optionId, savedAt: nowIso() };
  }
  recruitmentStore.save();
}

export function setPosition(token: string, position: number) {
  const attempt = byToken(token);
  if (attempt.status !== "in_progress") return;
  attempt.position = Math.max(0, Math.min(position, itemsOf(attempt).items.length - 1));
  recruitmentStore.save();
}

export function toggleFlag(token: string, itemId: string) {
  const attempt = byToken(token);
  requireInProgress(attempt);
  attempt.flagged = attempt.flagged.includes(itemId) ? attempt.flagged.filter((id) => id !== itemId) : [...attempt.flagged, itemId];
  recruitmentStore.save();
}

export function requestSupport(token: string, message: string) {
  const attempt = byToken(token);
  if (!message.trim()) throw new RecruitmentError("Describe the problem so we can help.");
  event(attempt, "support_requested", message.trim().slice(0, 500));
  recruitmentStore.save();
}

export function submitAssessment(token: string) {
  const attempt = byToken(token);
  requireInProgress(attempt);
  finishSubmission(attempt, "Submitted by the candidate.");
  recruitmentStore.save();
}

function finishSubmission(attempt: AssessmentAttempt, note: string) {
  attempt.status = "submitted";
  attempt.submittedAt = nowIso();
  event(attempt, "submitted", note);
  const app = data().applications.find((a) => a.id === attempt.applicationId)!;
  email(attempt, app, "assessment_submitted");
  applyScore(attempt);
}

/* ── Scoring ──────────────────────────────────────────────────────────── */

export function scoreAttempt(attempt: AssessmentAttempt, version: TemplateVersion, threshold: number): Omit<AttemptScore, "scoredAt"> {
  let objectivePoints = 0;
  let objectiveMax = 0;
  let writtenPoints = 0;
  let writtenMax = 0;
  let unscored = 0;
  for (const item of version.items) {
    if (item.responseType === "case_response") {
      const max = Math.max(...(item.scoring.rubric ?? [{ score: item.scoring.points }]).map((l) => l.score));
      writtenMax += max;
      const scored = attempt.writtenScores[item.id];
      if (scored) writtenPoints += scored.score;
      else if (attempt.answers[item.id]?.text?.trim()) unscored += 1;
      // A blank written answer scores 0 without needing a person.
    } else {
      objectiveMax += item.scoring.points;
      if (attempt.answers[item.id]?.optionId === item.scoring.correctOptionId) objectivePoints += item.scoring.points;
    }
  }
  const total = objectiveMax + writtenMax;
  const base = { objectivePoints, objectiveMax, writtenPoints, writtenMax, threshold, thresholdSnapshotVersion: attempt.thresholdSnapshotVersion, scoringRuleVersion: SCORING_RULE_VERSION };
  if (unscored > 0) {
    return { ...base, percent: null, outcome: "awaiting_written_scoring", reason: `${unscored} written answer${unscored === 1 ? "" : "s"} to be scored by a person against the approved rubric.` };
  }
  const percent = total ? Math.round((100 * (objectivePoints + writtenPoints)) / total) : 0;
  const passed = percent >= threshold;
  return {
    ...base,
    percent,
    outcome: passed ? "passed" : "not_passed",
    reason: `Scored ${percent}% against the approved pass threshold of ${threshold}% (threshold snapshot v${attempt.thresholdSnapshotVersion}, ${attempt.assessmentName} v${attempt.assessmentVersion}).`,
  };
}

/** Scores the attempt and routes the candidate according to the approved threshold. */
function applyScore(attempt: AssessmentAttempt) {
  const app = data().applications.find((a) => a.id === attempt.applicationId)!;
  const vacancy = getVacancy(attempt.organisationId, attempt.vacancyId)!;
  const snapshot = vacancy.approvals.find((a) => a.version === attempt.thresholdSnapshotVersion);
  const version = itemsOf(attempt);
  const result = scoreAttempt(attempt, version, snapshot?.assessment ?? 0);
  attempt.score = { ...result, scoredAt: nowIso() };
  const system = "BCMS (approved threshold)";
  if (result.outcome === "awaiting_written_scoring") {
    setStage(app, "assessment_completed", system, result.reason);
  } else if (result.outcome === "passed") {
    if (vacancy.stages.interview.enabled) setStage(app, "assessment_completed", system, `${result.reason} Ready for the AI-avatar interview.`);
    else setStage(app, "qualified", system, result.reason);
  } else {
    setStage(app, "not_progressed", system, result.reason);
  }
}

/* ── HR: results and written-answer scoring ──────────────────────────── */

export type HrAttemptView = {
  attempt: AssessmentAttempt;
  /** Questions with keys and rubrics, available to HR only once the candidate has submitted. */
  version: TemplateVersion | null;
};

/** HR sees answers only after submission (guide §13: HR does not see or alter live answers). */
export function hrAttemptView(organisationId: string, applicationId: string): HrAttemptView | null {
  const attempt = data().attempts.find((a) => a.applicationId === applicationId && a.organisationId === organisationId);
  if (!attempt) return null;
  if (refresh(attempt)) recruitmentStore.save();
  const copy = structuredClone(attempt);
  if (copy.status !== "submitted") {
    copy.answers = {};
    copy.flagged = [];
  }
  return {
    attempt: copy,
    version: copy.status === "submitted" ? getAssessmentVersion(organisationId, copy.assessmentId, copy.assessmentVersion) : null,
  };
}

export function scoreWrittenAnswer(
  organisationId: string,
  applicationId: string,
  itemId: string,
  score: number,
  comment: string,
  actor: string,
) {
  application(organisationId, applicationId);
  const attempt = data().attempts.find((a) => a.applicationId === applicationId && a.organisationId === organisationId);
  if (!attempt || attempt.status !== "submitted") throw new RecruitmentError("Written answers can be scored after the candidate submits.");
  const item = itemsOf(attempt).items.find((i) => i.id === itemId && i.responseType === "case_response");
  if (!item) throw new RecruitmentError("That is not a written question in this assessment.");
  const levels = (item.scoring.rubric ?? []).map((l) => l.score);
  const max = Math.max(...levels);
  if (!levels.includes(score) && score !== 0) throw new RecruitmentError(`Choose a rubric level (0–${max}).`);
  if (attempt.score && attempt.score.outcome !== "awaiting_written_scoring") {
    throw new RecruitmentError("This result is final. Changes are made by the Hiring Manager as an override with a reason.");
  }
  attempt.writtenScores[itemId] = { score, maxScore: max, scorer: actor, at: nowIso(), comment: comment.trim() || undefined };
  applyScore(attempt);
  recruitmentStore.save();
}

/** Short label for lists. */
export function assessmentSummary(attempt: AssessmentAttempt | null): string {
  if (!attempt) return "—";
  if (attempt.status === "invited") return "Invited";
  if (attempt.status === "in_progress") return "In progress";
  if (attempt.status === "expired") return "Link expired";
  const s = attempt.score;
  if (!s || s.outcome === "awaiting_written_scoring") return "Awaiting written scoring";
  return `${s.percent}% • ${s.outcome === "passed" ? "Pass" : "Below threshold"}`;
}
