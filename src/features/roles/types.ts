import type { ProfileLifecycleStatus } from "@/lib/mock/types";

export type RoleSkillRequirement = {
  skillId: string;
  name: string;
  levelLabel: string;
  category: "technical" | "behavioural";
  /** Essential to safety or compliance: any gap is critical. */
  essential?: boolean;
};

export type RoleEmployeeSummary = {
  employeeId: string;
  name: string;
  avatarUrl: string;
  joinedYear: number;
  matchPercent: number;
};

export type RoleProfileVersion = {
  id: string;
  version: string;
  status: ProfileLifecycleStatus;
  changedBy: string;
  changedAt: string;
  summary: string;
};

export type RoleRecord = {
  id: string;
  title: string;
  departmentId: string;
  departmentName: string;
  employeeCount: number;
  status: ProfileLifecycleStatus;
  updatedAt: string;
  overview: string;
  technicalSkills: RoleSkillRequirement[];
  behaviouralSkills: string[];
  mappedEmployees: RoleEmployeeSummary[];
  profileVersions: RoleProfileVersion[];
  lastVerified?: string;
};
