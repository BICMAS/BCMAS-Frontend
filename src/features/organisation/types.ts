export type ProfileStatus =
  | "published"
  | "awaiting_review"
  | "draft"
  | "changes_requested";

export type DepartmentTag = "core" | null;

export type OrgMetric = {
  id: string;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
  icon: "sitemap" | "badge" | "check" | "clock" | "users";
};

export type ProfileDistributionBar = {
  department: string;
  shortLabel: string;
  approved: number;
  pending: number;
  draft: number;
  dominant: "approved" | "pending" | "draft";
  heightPercent: number;
};

export type StructureHealthMetric = {
  id: string;
  label: string;
  percent: number;
  tone: "lime" | "deep";
};

export type DepartmentRole = {
  id: string;
  title: string;
  subtitle: string;
  status: ProfileStatus;
  employeeCount: number;
  icon: "code" | "database" | "cloud" | "shield" | "users" | "briefcase";
};

export type Department = {
  id: string;
  name: string;
  tag: DepartmentTag;
  roleCount: number;
  teamSize: number;
  healthPercent: number;
  roles: DepartmentRole[];
};

export type OrgChartNode = {
  id: string;
  name: string;
  kind: "root" | "department" | "unit";
  subtitle?: string;
  employeeCount?: number;
  roleCount?: number;
  healthPercent?: number;
  children?: OrgChartNode[];
};

export type OrgUploadRecord = {
  id: string;
  fileName: string;
  status: "completed" | "archived" | "processing" | "failed";
  relativeTime: string;
};

export type OrgOverviewData = {
  metrics: OrgMetric[];
  distribution: ProfileDistributionBar[];
  structureHealth: StructureHealthMetric[];
  organisationName: string;
};
