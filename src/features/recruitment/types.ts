/**
 * Recruitment model (BCMS Talent Assessment guide §8–10): vacancies, thresholds approved by the
 * Hiring Manager, public applications and the candidate email log. Sample-data implementation
 * for the backend team to mirror.
 */

export type VacancyStatus = "draft" | "pending_approval" | "approved" | "published" | "paused" | "closed";

export const VACANCY_STATUS_LABEL: Record<VacancyStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved – ready to publish",
  published: "Published",
  paused: "Paused",
  closed: "Closed",
};

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Temporary", "Internship"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** The exact approved organisation assessment version a vacancy uses (never "latest"). */
export type AssessmentRef = {
  assessmentId: string;
  version: string;
  name: string;
  itemCount: number;
  durationMinutes: number;
};

/** Recruitment stages. CV analysis is always on and is a human-reviewed screening signal. */
export type StageConfig = {
  assessment: { enabled: boolean; threshold: number | null };
  /** The approved interview question set (written questions + rubrics), pinned to an exact version. */
  interview: { enabled: boolean; threshold: number | null; questionSet: AssessmentRef | null };
};

/** Whether candidates keep their camera on during the assessment and interview. */
export type CameraPolicy = "off" | "optional" | "required";

export const CAMERA_POLICY_LABEL: Record<CameraPolicy, string> = {
  off: "Off",
  optional: "Optional",
  required: "Required",
};

export type CameraEvent = {
  type: "agreed" | "on" | "off" | "alternative_requested" | "waived";
  at: string;
  note?: string;
};

/** Camera on/off log for one session. Holds no image, video or audio, and is never scored. */
export type CameraLog = {
  /** The vacancy's policy when the candidate was invited. */
  policy: CameraPolicy;
  agreedAt: string | null;
  /** HR allowed this candidate to continue without a camera. */
  waived: { by: string; at: string; reason: string } | null;
  on: boolean;
  events: CameraEvent[];
};

/** What the Hiring Manager approved. Kept for every candidate attempt and decision (guide §9). */
export type ThresholdSnapshot = {
  version: number;
  assessment: number | null;
  interview: number | null;
  assessmentRef: AssessmentRef | null;
  interviewRef: AssessmentRef | null;
  approvedBy: string;
  approvedAt: string;
};

export type VacancyEvent = {
  id: string;
  action:
    | "Created"
    | "Edited"
    | "Sent for approval"
    | "Approved"
    | "Returned for changes"
    | "Published"
    | "Paused"
    | "Resumed"
    | "Closed";
  actor: string;
  at: string;
  note?: string;
};

export type Vacancy = {
  id: string;
  organisationId: string;
  title: string;
  department: string;
  location: string;
  employmentType: EmploymentType;
  openings: number;
  summary: string;
  /** ISO date (YYYY-MM-DD). Applications close at the end of this day. */
  closingDate: string;
  roleId: string | null;
  roleTitle: string | null;
  assessment: AssessmentRef | null;
  stages: StageConfig;
  camera: CameraPolicy;
  consentText: string;
  hiringManager: { userId: string; name: string } | null;
  owner: string;
  status: VacancyStatus;
  /** Approved thresholds, newest last. A vacancy can only be published with an approval in place. */
  approvals: ThresholdSnapshot[];
  /** Unique public application token, created on publish. */
  publicToken: string | null;
  history: VacancyEvent[];
  createdAt: string;
};

export type CvFile = { fileName: string; sizeBytes: number; mimeType: string };

export type ApplicationStage =
  | "new_application"
  | "cv_analysis"
  | "assessment_invited"
  | "assessment_completed"
  | "avatar_invited"
  | "avatar_completed"
  | "qualified"
  | "not_progressed"
  | "human_review";

export const STAGE_LABEL: Record<ApplicationStage, string> = {
  new_application: "New Application",
  cv_analysis: "CV Analysis",
  assessment_invited: "Assessment Invited",
  assessment_completed: "Assessment Completed",
  avatar_invited: "Avatar Invited",
  avatar_completed: "Avatar Completed",
  qualified: "Qualified",
  not_progressed: "Not Progressed",
  human_review: "Human Review",
};

export type StageChange = { stage: ApplicationStage; at: string; actor: string; note?: string };

export type HrNote = { id: string; text: string; author: string; at: string };

/** A saved CV analysis (from the AI talent agent, talent.analyze_cv). A screening signal only. */
export type SavedCvAnalysis = {
  result: import("@ai/contracts").CvAnalysis;
  analysedAt: string;
  analysedBy: string;
  /** Role profile the CV was compared with. */
  roleTitle: string;
};

export type Application = {
  id: string;
  /** Shown to the candidate, e.g. GEC-SE-2611-0042. */
  reference: string;
  vacancyId: string;
  organisationId: string;
  fullName: string;
  /** The candidate-entered, confirmed email. Never an email extracted from the CV. */
  email: string;
  phone: string | null;
  cv: CvFile;
  consentText: string;
  consentAt: string;
  submittedAt: string;
  stage: ApplicationStage;
  /** Threshold snapshot version in force when the candidate applied. */
  thresholdVersion: number;
  /** Same email already applied to this vacancy: flagged for HR, never merged automatically. */
  possibleDuplicateOf: string | null;
  /** Text extracted from the CV for analysis (null when it could not be read). */
  cvText: string | null;
  cvAnalysis: SavedCvAnalysis | null;
  /** HR flagged a problem reading the CV (wrong text, scanned image, etc.). */
  extractionIssue: { note: string; by: string; at: string } | null;
  notes: HrNote[];
  /** A below-pass-mark result waiting for a person to confirm it. */
  proposedOutcome: {
    stage: "assessment" | "interview";
    reason: string;
    at: string;
    referral: { by: string; at: string; reason: string } | null;
  } | null;
  /** Hiring Manager decisions, oldest first. */
  decisions: HmDecision[];
  stageHistory: StageChange[];
};

export type OutboxEmail = {
  id: string;
  organisationId: string;
  vacancyId: string;
  applicationId: string | null;
  to: string;
  subject: string;
  body: string;
  kind:
    | "application_confirmation"
    | "assessment_invitation"
    | "assessment_submitted"
    | "interview_invitation"
    | "interview_submitted"
    | "shortlist_outcome";
  at: string;
};

/* ── Role-based assessment delivery (guide §13) ─────────────────────────── */

export type AttemptStatus = "invited" | "in_progress" | "submitted" | "expired";

export type AttemptAnswer = { optionId?: string; text?: string; savedAt: string };

export type AttemptEvent = {
  type: "invited" | "resent" | "opened" | "started" | "resumed" | "autosaved" | "support_requested" | "extra_time" | "time_expired" | "submitted";
  at: string;
  note?: string;
};

/** A person's rubric score for one written answer (written answers are never auto-scored). */
export type WrittenScore = { score: number; maxScore: number; scorer: string; at: string; comment?: string };

export type AttemptOutcome = "passed" | "not_passed" | "awaiting_written_scoring";

/**
 * The result of an attempt. Reproducible: it names the exact assessment version, the scoring rule
 * version and the approved threshold snapshot it was judged against.
 */
export type AttemptScore = {
  objectivePoints: number;
  objectiveMax: number;
  writtenPoints: number;
  writtenMax: number;
  /** Null until every written answer has been scored by a person. */
  percent: number | null;
  threshold: number;
  thresholdSnapshotVersion: number;
  scoringRuleVersion: string;
  outcome: AttemptOutcome;
  reason: string;
  scoredAt: string;
};

export type AssessmentAttempt = {
  id: string;
  applicationId: string;
  organisationId: string;
  vacancyId: string;
  /** Secret part of the candidate link. Replaced when an invitation is resent. */
  token: string;
  expiresAt: string;
  assessmentId: string;
  assessmentVersion: string;
  assessmentName: string;
  durationMinutes: number;
  /** Adjustments added to the time allowed. */
  extraTime: Array<{ minutes: number; reason: string; by: string; at: string }>;
  thresholdSnapshotVersion: number;
  status: AttemptStatus;
  invitedAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  /** Last question the candidate was on, to resume after an interruption. */
  position: number;
  answers: Record<string, AttemptAnswer>;
  flagged: string[];
  events: AttemptEvent[];
  camera: CameraLog;
  writtenScores: Record<string, WrittenScore>;
  score: AttemptScore | null;
  resentCount: number;
};

/* ── AI-avatar competency interview (guide §14) ─────────────────────────── */

export type InterviewStatus = "invited" | "in_progress" | "submitted" | "expired";

export type InterviewAnswerRecord = {
  text: string;
  /** How the candidate answered: spoken (transcribed in their browser) or typed. Never scored. */
  mode: "voice" | "text";
  repeats: number;
  savedAt: string;
};

export type InterviewEvent = {
  type:
    | "invited"
    | "resent"
    | "consented"
    | "consent_declined"
    | "equipment_checked"
    | "started"
    | "resumed"
    | "question_repeated"
    | "technical_issue"
    | "reschedule_requested"
    | "submitted";
  at: string;
  note?: string;
};

/** AI talent agent suggestion (talent.score_interview) for one answer; a person confirms it. */
export type InterviewSuggestion = {
  score: number;
  maxScore: number;
  confidence: "low" | "medium" | "high";
  evidence: string[];
  rationale: string;
};

export type InterviewSession = {
  id: string;
  applicationId: string;
  organisationId: string;
  vacancyId: string;
  token: string;
  expiresAt: string;
  questionSetId: string;
  questionSetVersion: string;
  questionSetName: string;
  thresholdSnapshotVersion: number;
  status: InterviewStatus;
  invitedAt: string;
  consentAt: string | null;
  answerMode: "voice" | "text" | null;
  startedAt: string | null;
  submittedAt: string | null;
  position: number;
  answers: Record<string, InterviewAnswerRecord>;
  events: InterviewEvent[];
  camera: CameraLog;
  resentCount: number;
  aiSuggestion: {
    scores: Record<string, InterviewSuggestion>;
    summary: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
    requestedBy: string;
  } | null;
  /** Scores confirmed by a person (the only scores that count). */
  confirmedScores: Record<string, WrittenScore>;
  score: AttemptScore | null;
};

/* ── Hiring Manager review and shortlisting (guide §15) ─────────────────── */

export type HmDecisionType = "selected" | "hold" | "not_progressed" | "override";

export const HM_DECISION_LABEL: Record<HmDecisionType, string> = {
  selected: "Selected for physical interview",
  hold: "On hold",
  not_progressed: "Not progressed",
  override: "Override",
};

/** Every Hiring Manager decision is kept (audit trail); the latest one is the current decision. */
export type HmDecision = {
  id: string;
  decision: HmDecisionType;
  note: string;
  by: string;
  at: string;
  /** Present when the decision changed the automatic, threshold-based outcome. */
  override?: { from: ApplicationStage; to: ApplicationStage; reason: string };
};
