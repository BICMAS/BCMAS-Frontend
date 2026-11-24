/**
 * Talent Assessment content model (BCMS Talent Assessment guide, sections 2–4).
 *
 * Built on sample data so the backend team can mirror it. Rules the backend must keep:
 *  - A master template is owned by BICMAS; only BICMAS administrators edit or publish it.
 *  - Each template has versions. A published version is immutable: editing creates a new
 *    draft version, and publishing it supersedes (never overwrites) the previous one.
 *  - Answer keys and rubrics (`ItemScoring`) are admin-only and must never reach candidates.
 */

export const ASSESSMENT_TYPES = [
  "situational_judgement",
  "job_knowledge",
  "technical_competency",
  "problem_solving",
  "case_study",
  "work_simulation",
] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_TYPE_LABEL: Record<AssessmentType, string> = {
  situational_judgement: "Situational Judgement",
  job_knowledge: "Job Knowledge",
  technical_competency: "Technical Competency",
  problem_solving: "Problem Solving",
  case_study: "Role-Based Case Study",
  work_simulation: "Practical Work Simulation",
};

export const DIFFICULTIES = ["foundational", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  foundational: "Foundational",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const RESPONSE_TYPES = ["single_choice", "sjt", "case_response"] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];

export const RESPONSE_TYPE_LABEL: Record<ResponseType, string> = {
  single_choice: "Multiple choice",
  sjt: "Situational judgement",
  case_response: "Written response",
};

export const PROFICIENCY_LEVELS = ["Foundation", "Developing", "Proficient", "Advanced", "Expert"] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

export type ItemOption = { id: string; text: string };

export type RubricLevel = { score: number; descriptor: string };

/** Admin-only scoring. Objective items use a fixed key; written responses use a rubric. */
export type ItemScoring = {
  points: number;
  correctOptionId?: string;
  rubric?: RubricLevel[];
};

/**
 * Where an item came from, kept for audit (guide §6: save AI model/version and generation date,
 * and show the source used for every generated item). Absent for items written by people.
 */
export type ItemOrigin =
  | {
      kind: "ai";
      model: string;
      promptVersion: string;
      generatedAt: string;
      /** The AI service draft the item came from. */
      draftId: string;
      /** Competency definition / criteria the item was generated from. */
      source: string;
    }
  | { kind: "template"; source: string };

export type TemplateItem = {
  id: string;
  /** Short label shown in lists, e.g. "Prioritisation". */
  title: string;
  text: string;
  responseType: ResponseType;
  options: ItemOption[];
  competency: string;
  difficulty: Difficulty;
  scoring: ItemScoring;
  /** Target proficiency level (1–5) when the item was built for one. */
  level?: number;
  origin?: ItemOrigin;
};

export type VersionStatus = "draft" | "in_review" | "published" | "superseded" | "retired";

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  published: "Published",
  superseded: "Superseded",
  retired: "Retired",
};

/** An approver's decision on one item while the version is in review (guide §7). */
export type ItemReview = {
  decision: "approved" | "returned" | "rejected";
  /** Required when returning or rejecting. */
  comment?: string;
  reviewer: string;
  at: string;
};

export type VersionEvent = {
  id: string;
  action:
    | "Created"
    | "Edited"
    | "Item added"
    | "Item edited"
    | "Item removed"
    | "Submitted for review"
    | "Item approved"
    | "Item returned"
    | "Item rejected"
    | "Returned for changes"
    | "Approved and published"
    | "Superseded"
    | "Retired";
  actor: string;
  at: string; // ISO date-time
  note?: string;
};

/** Content that can differ between versions. */
export type TemplateContent = {
  name: string;
  purpose: string;
  assessmentType: AssessmentType;
  roleFamily: string;
  targetProficiency: ProficiencyLevel;
  competencies: string[];
  durationMinutes: number;
  items: TemplateItem[];
};

export type TemplateVersion = TemplateContent & {
  /** "1.2" style; drafts of a new major/minor are numbered before publication. */
  version: string;
  status: VersionStatus;
  createdBy: string;
  createdAt: string;
  submittedBy?: string;
  reviewedBy?: string;
  publishedAt?: string;
  history: VersionEvent[];
  /** Item-by-item review decisions, keyed by item id. Editing an item clears its decision. */
  itemReviews?: Record<string, ItemReview>;
};

export type QualityNotes = {
  reviewNotes: string;
  pilotFeedback: string;
  limitations: string;
};

export type MasterTemplate = {
  id: string;
  /** Newest last. At most one draft/in-review version and one published version at a time. */
  versions: TemplateVersion[];
  quality: QualityNotes;
};

/** Library-level status derived from the template's versions. */
export type TemplateStatus = "published" | "draft" | "retired";

/* ── Organisation Assessment Library (guide §5) ─────────────────────────── */

/** Organisation wording for the shared version statuses ("published" = approved and usable). */
export const ORG_VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  published: "Approved / Active",
  superseded: "Superseded",
  retired: "Retired",
};

/** Where an organisation assessment came from. */
export type AssessmentSource = {
  templateId: string;
  templateName: string;
  /** The exact master version that was copied. */
  version: string;
};

/**
 * An organisation-owned assessment: a copy of a BICMAS master or created by the organisation.
 * It has its own ID, versions and approval status; changing it never touches the master.
 */
export type OrgAssessment = {
  id: string;
  organisationId: string;
  source: AssessmentSource | null;
  /** The organisation role this assessment is built for (optional). */
  linkedRole: string | null;
  versions: TemplateVersion[];
};

export type OrgLifecycle = "draft" | "in_review" | "approved" | "retired";
