/**
 * AI-avatar competency interview (BCMS Talent Assessment guide §14).
 *
 * Rules the backend must keep:
 *  - Candidates who meet the assessment threshold are invited with a secure, expiring link.
 *  - Every candidate for a vacancy gets the same approved question set (the version in their
 *    threshold snapshot). Rubrics never reach the candidate.
 *  - Consent is obtained and recorded before the interview starts; a text alternative is always
 *    available; candidates can repeat a question (up to 2 times), report a technical problem or
 *    ask to reschedule. No video is captured (camera.ts logs on/off only); spoken answers are transcribed to text.
 *  - Only answer content is scored. The AI talent agent (talent.score_interview) suggests a score
 *    per answer with evidence and confidence; a person confirms every score. Progression follows
 *    the approved interview threshold, with the reason recorded.
 */
import type { InterviewScoring, InterviewScoringRequest } from "@ai/contracts";

import { getMockOrganisation } from "@/config/mock-users";
import { getAssessmentVersion } from "@/features/assessment-library/services/org-library";

import { cameraEmailNote, newCameraLog, requireCameraToStart } from "./camera";
import { attemptFor, SCORING_RULE_VERSION } from "./delivery";
import { proposeNotProgressed } from "./outcome-review";
import { getVacancy, recruitmentStore, RecruitmentError } from "./vacancies";
import type { Application, ApplicationStage, CameraPolicy, InterviewEvent, InterviewSession } from "../types";

export const INTERVIEW_INVITATION_DAYS = 7;
export const MAX_REPEATS = 2;
export const INTERVIEW_SCORING_RULE = "interview-rubric-ai-suggested-human-confirmed-v1";
const MAX_ANSWER = 6000;

const nowIso = () => new Date().toISOString();
const data = () => recruitmentStore.data();

export function interviewLink(token: string) {
  return `/interview/${token}`;
}

function newToken() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function event(session: InterviewSession, type: InterviewEvent["type"], note?: string) {
  session.events.push({ type, at: nowIso(), note });
}

function setStage(app: Application, stage: ApplicationStage, actor: string, note?: string) {
  const last = app.stageHistory[app.stageHistory.length - 1];
  if (app.stage === stage && (!note || last?.note === note)) return;
  app.stage = stage;
  app.stageHistory.push({ stage, at: nowIso(), actor, note });
}

function application(organisationId: string, id: string) {
  const app = data().applications.find((a) => a.id === id && a.organisationId === organisationId);
  if (!app) throw new RecruitmentError("Candidate not found in your organisation.");
  return app;
}

function questionSet(session: InterviewSession) {
  const v = getAssessmentVersion(session.organisationId, session.questionSetId, session.questionSetVersion);
  if (!v) throw new RecruitmentError("The interview questions are not available. Contact the recruitment team.");
  return v;
}

function email(session: InterviewSession, app: Application, kind: "interview_invitation" | "interview_submitted") {
  const vacancy = getVacancy(app.organisationId, app.vacancyId);
  const org = getMockOrganisation(app.organisationId);
  data().outbox.push({
    id: recruitmentStore.nextId("mail"),
    organisationId: app.organisationId,
    vacancyId: app.vacancyId,
    applicationId: app.id,
    to: app.email,
    subject:
      kind === "interview_invitation"
        ? `Your interview for ${vacancy?.title ?? "your application"} (${app.reference})`
        : `Interview received: ${vacancy?.title ?? ""} (${app.reference})`,
    body:
      kind === "interview_invitation"
        ? `Dear ${app.fullName},\n\nYou are invited to a short structured interview with our AI interviewer (about ${questionSet(session).durationMinutes} minutes). You can answer by speaking or typing. Please complete it by ${new Date(session.expiresAt).toLocaleDateString()}: ${interviewLink(session.token)}${cameraEmailNote(session.camera.policy)}\n\n${org.name} Recruitment`
        : `Dear ${app.fullName},\n\nThank you for completing the interview. We will email you about the next steps.\n\n${org.name} Recruitment`,
    kind,
    at: nowIso(),
  });
}

/* ── HR: invitation ───────────────────────────────────────────────────── */

export function interviewFor(organisationId: string, applicationId: string): InterviewSession | null {
  const found = data().interviews.find((i) => i.applicationId === applicationId && i.organisationId === organisationId);
  return found ? structuredClone(found) : null;
}

/** Whether a candidate can be invited, and if not, why. */
export function interviewEligibility(organisationId: string, applicationId: string): { ok: boolean; reason: string } {
  const app = application(organisationId, applicationId);
  const vacancy = getVacancy(organisationId, app.vacancyId);
  if (!vacancy?.stages.interview.enabled) return { ok: false, reason: "This vacancy does not use the AI-avatar interview." };
  if (data().interviews.some((i) => i.applicationId === app.id)) return { ok: false, reason: "Already invited. Use Resend Interview Invitation instead." };
  if (vacancy.stages.assessment.enabled) {
    const attempt = attemptFor(organisationId, app.id);
    if (attempt?.score?.outcome !== "passed") {
      return { ok: false, reason: "Only candidates who met the approved assessment threshold are invited to the interview." };
    }
  } else if (!["new_application", "cv_analysis"].includes(app.stage)) {
    return { ok: false, reason: "This candidate is past the interview invitation stage." };
  }
  if (app.stage === "human_review") return { ok: false, reason: "Complete the human review first." };
  return { ok: true, reason: "" };
}

export function inviteToInterview(organisationId: string, applicationId: string, actor: string) {
  const app = application(organisationId, applicationId);
  const eligibility = interviewEligibility(organisationId, applicationId);
  if (!eligibility.ok) throw new RecruitmentError(eligibility.reason);
  const vacancy = getVacancy(organisationId, app.vacancyId)!;
  const snapshot = vacancy.approvals.find((a) => a.version === app.thresholdVersion);
  const ref = snapshot?.interviewRef;
  if (!snapshot || !ref || snapshot.interview === null) {
    throw new RecruitmentError("There is no approved interview question set and threshold for this candidate's application.");
  }
  const session: InterviewSession = {
    id: recruitmentStore.nextId("int"),
    applicationId: app.id,
    organisationId,
    vacancyId: vacancy.id,
    token: newToken(),
    expiresAt: new Date(Date.now() + INTERVIEW_INVITATION_DAYS * 86_400_000).toISOString(),
    questionSetId: ref.assessmentId,
    questionSetVersion: ref.version,
    questionSetName: ref.name,
    thresholdSnapshotVersion: snapshot.version,
    status: "invited",
    invitedAt: nowIso(),
    consentAt: null,
    answerMode: null,
    startedAt: null,
    submittedAt: null,
    position: 0,
    answers: {},
    events: [],
    camera: newCameraLog(vacancy.camera),
    resentCount: 0,
    aiSuggestion: null,
    confirmedScores: {},
    score: null,
  };
  questionSet(session); // fails early if the set is missing
  event(session, "invited", `by ${actor}`);
  data().interviews.push(session);
  email(session, app, "interview_invitation");
  setStage(app, "avatar_invited", actor, `${ref.name} v${ref.version}; link valid ${INTERVIEW_INVITATION_DAYS} days`);
  recruitmentStore.save();
  return session.token;
}

/** New link and expiry (also the route for a reschedule after a technical problem). Answers are kept. */
export function resendInterview(organisationId: string, applicationId: string, actor: string) {
  const app = application(organisationId, applicationId);
  const session = data().interviews.find((i) => i.applicationId === app.id);
  if (!session) throw new RecruitmentError("This candidate has not been invited to the interview yet.");
  if (session.status === "submitted") throw new RecruitmentError("The candidate has already completed the interview.");
  session.token = newToken();
  session.expiresAt = new Date(Date.now() + INTERVIEW_INVITATION_DAYS * 86_400_000).toISOString();
  if (session.status === "expired") session.status = session.startedAt ? "in_progress" : "invited";
  session.resentCount += 1;
  event(session, "resent", `by ${actor}`);
  email(session, app, "interview_invitation");
  recruitmentStore.save();
  return session.token;
}

/* ── Candidate side (no login; the token is the credential) ─────────── */

function byToken(token: string) {
  const session = data().interviews.find((i) => i.token === token);
  if (!session) throw new RecruitmentError("This interview link is not valid. Please use the latest link we emailed you.");
  return session;
}

function refresh(session: InterviewSession) {
  if (session.status !== "submitted" && session.status !== "expired" && Date.now() > new Date(session.expiresAt).getTime()) {
    session.status = "expired";
    return true;
  }
  return false;
}

export type CandidateInterview = {
  status: InterviewSession["status"];
  organisationName: string;
  vacancyTitle: string;
  questionSetName: string;
  durationMinutes: number;
  expiresAt: string;
  consentGiven: boolean;
  answerMode: InterviewSession["answerMode"];
  /** Questions only: no rubrics. */
  questions: Array<{ id: string; text: string; competency: string }>;
  answers: Record<string, { text: string; repeats: number }>;
  position: number;
  /** The candidate's own camera state (no log). */
  camera: { policy: CameraPolicy; waived: boolean; agreed: boolean };
  supportEmail: string;
};

export function getCandidateInterview(token: string): CandidateInterview | null {
  const session = data().interviews.find((i) => i.token === token);
  if (!session) return null;
  if (refresh(session)) recruitmentStore.save();
  const set = getAssessmentVersion(session.organisationId, session.questionSetId, session.questionSetVersion);
  const org = getMockOrganisation(session.organisationId);
  return {
    status: session.status,
    organisationName: org.name,
    vacancyTitle: getVacancy(session.organisationId, session.vacancyId)?.title ?? "",
    questionSetName: session.questionSetName,
    durationMinutes: set?.durationMinutes ?? 15,
    expiresAt: session.expiresAt,
    consentGiven: session.consentAt !== null,
    answerMode: session.answerMode,
    questions: (set?.items ?? []).map((i) => ({ id: i.id, text: i.text, competency: i.competency })),
    answers: Object.fromEntries(Object.entries(session.answers).map(([id, a]) => [id, { text: a.text, repeats: a.repeats }])),
    position: session.position,
    camera: { policy: session.camera.policy, waived: session.camera.waived !== null, agreed: session.camera.agreedAt !== null },
    supportEmail: `recruitment@${org.shortName.toLowerCase()}.example`,
  };
}

function requireOpen(session: InterviewSession) {
  if (refresh(session)) recruitmentStore.save();
  if (session.status === "expired") throw new RecruitmentError("This interview link has expired. Contact the recruitment team for a new link.");
  if (session.status === "submitted") throw new RecruitmentError("You have already completed this interview.");
}

/** Records consent and the chosen answer mode (equipment check result). */
export function giveConsent(token: string, mode: "voice" | "text", equipmentNote: string) {
  const session = byToken(token);
  requireOpen(session);
  session.consentAt = session.consentAt ?? nowIso();
  session.answerMode = mode;
  event(session, "consented");
  event(session, "equipment_checked", `${mode === "voice" ? "Spoken answers" : "Typed answers"}. ${equipmentNote}`.trim());
  recruitmentStore.save();
}

export function declineConsent(token: string, message: string) {
  const session = byToken(token);
  requireOpen(session);
  event(session, "consent_declined", message.trim().slice(0, 500) || "Candidate asked for an alternative");
  recruitmentStore.save();
}

export function startInterview(token: string) {
  const session = byToken(token);
  requireOpen(session);
  if (!session.consentAt) throw new RecruitmentError("Please read and agree to how the interview works first.");
  if (session.status === "invited") {
    requireCameraToStart(session.camera);
    session.status = "in_progress";
    session.startedAt = nowIso();
    event(session, "started");
  } else {
    event(session, "resumed", `at question ${session.position + 1}`);
  }
  recruitmentStore.save();
}

function requireInProgress(session: InterviewSession) {
  requireOpen(session);
  if (session.status !== "in_progress") throw new RecruitmentError("Start the interview first.");
}

export function saveInterviewAnswer(token: string, questionId: string, text: string, mode: "voice" | "text") {
  const session = byToken(token);
  requireInProgress(session);
  if (!questionSet(session).items.some((i) => i.id === questionId)) throw new RecruitmentError("That question is not part of this interview.");
  const previous = session.answers[questionId];
  session.answers[questionId] = { text: text.slice(0, MAX_ANSWER), mode, repeats: previous?.repeats ?? 0, savedAt: nowIso() };
  recruitmentStore.save();
}

/** Repeat a question (asked aloud again). Up to MAX_REPEATS per question, logged. */
export function repeatQuestion(token: string, questionId: string) {
  const session = byToken(token);
  requireInProgress(session);
  const answer = session.answers[questionId] ?? { text: "", mode: session.answerMode ?? "text", repeats: 0, savedAt: nowIso() };
  if (answer.repeats >= MAX_REPEATS) throw new RecruitmentError(`Each question can be repeated ${MAX_REPEATS} times.`);
  session.answers[questionId] = { ...answer, repeats: answer.repeats + 1 };
  event(session, "question_repeated", questionId.toUpperCase());
  recruitmentStore.save();
}

export function setInterviewPosition(token: string, position: number) {
  const session = byToken(token);
  if (session.status !== "in_progress") return;
  session.position = Math.max(0, Math.min(position, questionSet(session).items.length - 1));
  recruitmentStore.save();
}

/** Technical problem; optionally asks to reschedule (HR resends a fresh link). Answers are kept. */
export function reportTechnicalIssue(token: string, message: string, reschedule: boolean) {
  const session = byToken(token);
  if (!message.trim()) throw new RecruitmentError("Describe the problem so we can help.");
  event(session, reschedule ? "reschedule_requested" : "technical_issue", message.trim().slice(0, 500));
  recruitmentStore.save();
}

export function submitInterview(token: string) {
  const session = byToken(token);
  requireInProgress(session);
  session.status = "submitted";
  session.submittedAt = nowIso();
  event(session, "submitted");
  const app = data().applications.find((a) => a.id === session.applicationId)!;
  email(session, app, "interview_submitted");
  setStage(app, "avatar_completed", "Candidate", "Interview completed; awaiting scoring");
  recruitmentStore.save();
}

/* ── HR: scoring (AI suggests, a person confirms) ────────────────────── */

/** HR sees answers only after the candidate has completed the interview. */
export function hrInterviewView(organisationId: string, applicationId: string) {
  const session = interviewFor(organisationId, applicationId);
  if (!session) return null;
  const internal = data().interviews.find((i) => i.id === session.id)!;
  if (refresh(internal)) recruitmentStore.save();
  session.status = internal.status;
  if (session.status !== "submitted") session.answers = {};
  const set = session.status === "submitted" ? getAssessmentVersion(organisationId, session.questionSetId, session.questionSetVersion) : null;
  return { session, set };
}

/** Builds the request for the AI talent agent from the approved set and the submitted answers. */
export function interviewScoringRequest(organisationId: string, applicationId: string): InterviewScoringRequest {
  const session = data().interviews.find((i) => i.applicationId === applicationId && i.organisationId === organisationId);
  if (!session || session.status !== "submitted") throw new RecruitmentError("The interview has not been completed yet.");
  const vacancy = getVacancy(organisationId, session.vacancyId);
  const set = questionSet(session);
  return {
    role_title: vacancy?.roleTitle ?? vacancy?.title ?? "",
    questions: set.items.map((i) => ({
      question_id: i.id,
      competency: i.competency,
      question: i.text,
      rubric: (i.scoring.rubric ?? []).map((l) => ({ score: l.score, descriptor: l.descriptor })),
    })),
    answers: Object.entries(session.answers).map(([question_id, a]) => ({ question_id, text: a.text })),
  };
}

export function saveInterviewSuggestion(organisationId: string, applicationId: string, scoring: InterviewScoring, actor: string) {
  const session = data().interviews.find((i) => i.applicationId === applicationId && i.organisationId === organisationId);
  if (!session || session.status !== "submitted") throw new RecruitmentError("The interview has not been completed yet.");
  if (session.score) throw new RecruitmentError("The interview scores are already confirmed.");
  session.aiSuggestion = {
    scores: Object.fromEntries(
      scoring.scores.map((s) => [
        s.question_id,
        { score: s.score, maxScore: s.max_score, confidence: s.confidence, evidence: s.evidence, rationale: s.rationale },
      ]),
    ),
    summary: scoring.summary,
    model: scoring.provenance.model,
    promptVersion: scoring.provenance.prompt_version,
    generatedAt: scoring.provenance.generated_at,
    requestedBy: actor,
  };
  recruitmentStore.save();
}

/** A person confirms (or changes) every score; the result is then applied to the approved threshold. */
export function confirmInterviewScores(
  organisationId: string,
  applicationId: string,
  scores: Record<string, { score: number; comment?: string }>,
  actor: string,
) {
  const app = application(organisationId, applicationId);
  const session = data().interviews.find((i) => i.applicationId === app.id);
  if (!session || session.status !== "submitted") throw new RecruitmentError("The interview has not been completed yet.");
  if (session.score) throw new RecruitmentError("This result is final. Changes are made by the Hiring Manager as an override with a reason.");
  const set = questionSet(session);
  const confirmed: InterviewSession["confirmedScores"] = {};
  let points = 0;
  let max = 0;
  for (const item of set.items) {
    const levels = (item.scoring.rubric ?? []).map((l) => l.score);
    const itemMax = Math.max(...levels);
    max += itemMax;
    const given = scores[item.id];
    if (!given) throw new RecruitmentError(`Confirm a score for ${item.id.toUpperCase()}.`);
    if (given.score !== 0 && !levels.includes(given.score)) throw new RecruitmentError(`${item.id.toUpperCase()}: choose a rubric level (0–${itemMax}).`);
    confirmed[item.id] = { score: given.score, maxScore: itemMax, scorer: actor, at: nowIso(), comment: given.comment?.trim() || undefined };
    points += given.score;
  }
  const vacancy = getVacancy(organisationId, session.vacancyId)!;
  const threshold = vacancy.approvals.find((a) => a.version === session.thresholdSnapshotVersion)?.interview ?? 0;
  const percent = max ? Math.round((100 * points) / max) : 0;
  const passed = percent >= threshold;
  const changed = Object.entries(confirmed).filter(([id, c]) => session.aiSuggestion?.scores[id] && session.aiSuggestion.scores[id]!.score !== c.score).length;
  const reason = `Interview scored ${percent}% against the approved interview threshold of ${threshold}% (threshold snapshot v${session.thresholdSnapshotVersion}, ${session.questionSetName} v${session.questionSetVersion}); scores confirmed by ${actor}${changed ? `, ${changed} changed from the AI suggestion` : ""}.`;
  session.confirmedScores = confirmed;
  session.score = {
    objectivePoints: 0,
    objectiveMax: 0,
    writtenPoints: points,
    writtenMax: max,
    percent,
    threshold,
    thresholdSnapshotVersion: session.thresholdSnapshotVersion,
    scoringRuleVersion: `${INTERVIEW_SCORING_RULE} (${SCORING_RULE_VERSION.split(" ")[0]})`,
    outcome: passed ? "passed" : "not_passed",
    reason,
    scoredAt: nowIso(),
  };
  if (passed) setStage(app, "qualified", "BCMS (approved threshold)", reason);
  else proposeNotProgressed(app, "interview", reason, "BCMS (approved threshold)");
  recruitmentStore.save();
}

export function interviewSummary(session: InterviewSession | null): string {
  if (!session) return "—";
  if (session.status === "invited") return session.consentAt ? "Consented" : "Invited";
  if (session.status === "in_progress") return "In progress";
  if (session.status === "expired") return "Link expired";
  if (!session.score) return "Awaiting scoring";
  return `${session.score.percent}% • ${session.score.outcome === "passed" ? "Pass" : "Below threshold"}`;
}
