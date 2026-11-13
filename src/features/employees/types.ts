import type { MappingStatus } from "@/lib/mock/types";

export type EmployeeRecord = {
  id: string;
  employeeCode: string;
  name: string;
  avatarUrl: string;
  departmentId: string;
  departmentName: string;
  roleId: string | null;
  roleTitle: string | null;
  profileVersion: string | null;
  mappingStatus: MappingStatus;
  assessmentReady: boolean;
  email: string;
  joinedYear: number;
  location: string;
};

export type EmployeeDirectoryMetrics = {
  total: number;
  mappedPercent: number;
  unmapped: number;
  awaitingAssignment: number;
  assessmentReady: number;
};

export type EmployeeImportRecord = {
  id: string;
  fileName: string;
  status: "completed" | "archived" | "failed";
  relativeTime: string;
};

export type MappingSkillBar = {
  name: string;
  level: number;
  percent: number;
};

export type MappingGap = {
  skill: string;
  requiredLevel: number;
  verifiedLevel: number;
  suggestion: string;
};

export type MappingWorkspace = {
  employeeId: string;
  targetRoleId: string;
  matchPercent: number;
  skillsMet: number;
  skillsTotal: number;
  verifiedSkills: MappingSkillBar[];
  targetSkills: MappingSkillBar[];
  gaps: MappingGap[];
  saved: boolean;
  finalised: boolean;
};

export type BulkMappingStatus = "draft" | "unmapped" | "aligned";

export type BulkMappingRow = {
  id: string;
  employeeId: string;
  name: string;
  avatarUrl: string;
  departmentName: string;
  suggestedRoleId: string;
  suggestedRoleTitle: string;
  confidence: number;
  status: BulkMappingStatus;
};

export type MappingExceptionType =
  | "role_mismatch"
  | "outdated_version"
  | "custom_override";

export type MappingException = {
  id: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  departmentName: string;
  type: MappingExceptionType;
  assignedProfile: string;
  currentVersion?: string;
  resolutionLabel: string;
};

export type MappingExceptionMetrics = Record<MappingExceptionType, number>;

export type MappingRoleOption = {
  id: string;
  title: string;
};
