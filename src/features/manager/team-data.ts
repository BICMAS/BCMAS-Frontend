/**
 * Line Manager portal mock data (development only, like `features/workforce/mock-workforce`).
 * Drives the Manager Action Centre, directory filters, development-plan progress and the
 * gap drill-downs. Replace with backend data when the manager APIs are available.
 */
import { teamMembers, type TeamMember } from "@/features/workforce/mock-workforce";

/** Directory filters reachable from the dashboard (`/manager/team?focus=…` or `?gap=…`). */
export type DirectoryFocus = "assessment" | "learning";

export const directoryFocusLabels: Record<DirectoryFocus, string> = {
  assessment: "Employees awaiting assessment",
  learning: "Employees with overdue learning",
};

export function isDirectoryFocus(value: string | null): value is DirectoryFocus {
  return value === "assessment" || value === "learning";
}

/** Overdue learning activities per direct report. */
export const overdueLearning: Record<string, number> = { james: 3, robert: 2 };

export function membersForFocus(focus: DirectoryFocus): TeamMember[] {
  if (focus === "assessment") return teamMembers.filter((m) => m.pendingAssessments > 0);
  return teamMembers.filter((m) => (overdueLearning[m.id] ?? 0) > 0);
}

export type ManagerAction = { id: string; action: string; detail: string; href: string };

/** Manager Action Centre: pending actions, each linking to where the manager completes it. */
export const managerActions: ManagerAction[] = [
  {
    id: "assessments",
    action: "Complete assessments",
    detail: "4 employees awaiting assessment",
    href: "/manager/team?focus=assessment",
  },
  {
    id: "verify",
    action: "Verify capabilities",
    detail: "8 submissions awaiting review",
    href: "/verification/team",
  },
  {
    id: "plans",
    action: "Review development plans",
    detail: "3 plans requiring attention",
    href: "/ai/plans",
  },
  {
    id: "learning",
    action: "Follow up on learning",
    detail: "5 overdue learning activities",
    href: "/manager/team?focus=learning",
  },
];

export type PracticeStatus = "Completed" | "In Progress" | "Not Started";
export type PlanVerification = "Awaiting Verification" | "Verified" | "Not Submitted";

/** What a manager needs to see on a direct report's development plan (replaces evidence upload). */
export type PlanProgress = {
  learning: { status: "Completed" | "In Progress" | "Not Started"; completed: number; total: number };
  practices: PracticeStatus[]; // aligned with GrowthPlan.practices
  evidence: { title: string; fileName: string; submittedOn: string } | null;
  verification: PlanVerification;
  action: { label: string; detail: string; href?: string; nudge?: boolean } | null;
};

export const planProgress: Record<string, PlanProgress> = {
  "plan-james-ai": {
    learning: { status: "In Progress", completed: 4, total: 6 },
    practices: ["Completed", "In Progress"],
    evidence: {
      title: "AI Safety Committee risk register contribution",
      fileName: "AI_Risk_Register_Q4.pdf",
      submittedOn: "8 Nov 2024",
    },
    verification: "Awaiting Verification",
    action: {
      label: "Verify evidence",
      detail: "James submitted evidence that is waiting for your verification.",
      href: "/verification/team",
    },
  },
  "plan-robert-infra": {
    learning: { status: "Not Started", completed: 0, total: 1 },
    practices: ["Not Started"],
    evidence: null,
    verification: "Not Submitted",
    action: {
      label: "Follow up with employee",
      detail: "No progress or evidence recorded yet. Check in with Robert on his plan.",
      nudge: true,
    },
  },
};
