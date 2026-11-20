"use client";

/**
 * Two-person approval for workforce changes (mock, development only).
 *
 * Mapping changes, new employees and removals are submitted as *pending* changes and only take
 * effect once another administrator approves them. An approver must be an Organisation Admin
 * or HR/L&D Admin and can never be the person who submitted the change. Kept in session storage
 * so a change submitted by one persona can be approved after switching persona (Dev role).
 * Replace with backend approval APIs when available.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { MockUser } from "@/types/user";

export type ChangeKind = "mapping" | "new_employee" | "removal";

export type RemovalReason = "Resigned" | "Retired" | "Contract ended" | "Dismissed" | "Transferred out";

export type PendingChange = {
  id: string;
  kind: ChangeKind;
  /** Existing employee affected (mapping/removal). New employees have none until approved. */
  employeeId: string | null;
  employeeName: string;
  summary: string;
  submittedBy: { id: string; name: string };
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: { id: string; name: string };
  decidedAt?: string;
  payload: {
    roleId?: string;
    roleTitle?: string;
    employeeCode?: string;
    email?: string;
    departmentName?: string;
    startDate?: string;
    reason?: RemovalReason;
    lastWorkingDay?: string;
  };
};

const APPROVER_PORTALS = new Set(["organisation_admin", "hr_ld_admin"]);

/** Why `user` may not approve `change`, or null when they may. */
export function approvalBlocker(change: PendingChange, user: MockUser | null): string | null {
  if (!user) return "Sign in to review changes.";
  if (!APPROVER_PORTALS.has(user.portal)) return "Only Organisation Admins or HR/L&D Admins can approve.";
  if (change.submittedBy.id === user.id) return "You submitted this change. Another administrator must approve it.";
  return null;
}

type ApprovalState = {
  changes: PendingChange[];
  submit: (change: Omit<PendingChange, "id" | "status" | "submittedAt">) => PendingChange;
  decide: (id: string, user: MockUser, decision: "approved" | "rejected") => PendingChange;
};

export const useMappingApprovals = create<ApprovalState>()(
  persist(
    (set, get) => ({
      changes: [],
      submit: (input) => {
        const change: PendingChange = {
          ...input,
          id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          status: "pending",
          submittedAt: new Date().toISOString(),
        };
        set({ changes: [change, ...get().changes] });
        return change;
      },
      decide: (id, user, decision) => {
        const change = get().changes.find((c) => c.id === id);
        if (!change || change.status !== "pending") throw new Error("This change is no longer pending.");
        const blocker = approvalBlocker(change, user);
        if (blocker) throw new Error(blocker);
        const decided: PendingChange = {
          ...change,
          status: decision,
          decidedBy: { id: user.id, name: user.name },
          decidedAt: new Date().toISOString(),
        };
        set({ changes: get().changes.map((c) => (c.id === id ? decided : c)) });
        return decided;
      },
    }),
    { name: "bcms-mapping-approvals", storage: createJSONStorage(() => sessionStorage) },
  ),
);

/** Column layout of the bulk upload template (also validated on upload). */
export const EMPLOYEE_TEMPLATE_COLUMNS = [
  { key: "employee_id", header: "employee_id", example: "EMP-1001", required: true },
  { key: "full_name", header: "full_name", example: "Ada Lovelace", required: true },
  { key: "email", header: "email", example: "ada.lovelace@example.com", required: true },
  { key: "department", header: "department", example: "IT Infrastructure", required: true },
  { key: "job_role", header: "job_role", example: "Senior Solutions Architect", required: true },
  { key: "start_date", header: "start_date", example: "2025-01-06", required: false },
] as const;
