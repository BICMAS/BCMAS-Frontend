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
  description: string;
};
