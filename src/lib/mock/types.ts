export type ProfileLifecycleStatus =
  | "draft"
  | "awaiting_review"
  | "approved"
  | "changes_requested"
  | "published";

export type SkillCategory = "technical" | "behavioural" | "knowledge";

export type MappingStatus = "aligned" | "unmapped" | "exception" | "pending";

export const PROFILE_STATUS_LABELS: Record<ProfileLifecycleStatus, string> = {
  draft: "Draft",
  awaiting_review: "Awaiting Review",
  approved: "Approved",
  changes_requested: "Changes Requested",
  published: "Published",
};

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  technical: "Technical",
  behavioural: "Behavioural",
  knowledge: "Knowledge",
};
