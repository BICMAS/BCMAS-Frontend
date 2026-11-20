import type { ProfileLifecycleStatus, SkillCategory } from "@/lib/mock/types";

export type SkillLevel = {
  id: string;
  level: number;
  label: string;
  description: string;
};

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  levelsDefined: number;
  levelsTotal: number;
  roleUsage: number;
  /** Proficiency levels required for this skill across the roles that use it (e.g. 3 to 5). */
  requiredLevels: { min: number; max: number } | null;
  /** Employees whose roles require this skill. */
  employeesRequiring: number;
  status: Extract<
    ProfileLifecycleStatus,
    "published" | "draft" | "awaiting_review"
  >;
  levels: SkillLevel[];
  usedByRoleIds: string[];
};

export type FrameworkLevel = {
  id: string;
  rank: number;
  label: string;
  /** Short plain-language summary, e.g. "Understands the basics". */
  headline: string;
  description: string;
  /** Category tag shown with the level, e.g. "Foundation". */
  tag: string;
};
