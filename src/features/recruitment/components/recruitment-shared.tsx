"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { orgLibraryRevision, subscribeOrgLibrary } from "@/features/assessment-library/services/org-library";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { useSessionStore } from "@/stores/session-store";

import { RecruitmentError, recruitmentRevision, subscribeRecruitment } from "../services/vacancies";
import { VACANCY_STATUS_LABEL, type VacancyStatus } from "../types";

function subscribeAll(listener: () => void) {
  const a = subscribeRecruitment(listener);
  const b = subscribeOrgLibrary(listener);
  return () => {
    a();
    b();
  };
}

/** Re-renders when vacancies, applications or the organisation library change. */
export function useRecruitmentRevision() {
  return useSyncExternalStore(subscribeAll, () => recruitmentRevision() * 100_000 + orgLibraryRevision(), () => 0);
}

type Ctx = { organisationId: string; actor: string; userId: string };

function Gate({ portal, message, children }: { portal: string; message: string; children: (ctx: Ctx) => ReactNode }) {
  const user = useHydratedUser();
  const organisationId = useSessionStore((state) => state.organisationId);
  if (!user) return null;
  if (user.portal !== portal) return <p className="text-sm text-slate-500">{message}</p>;
  return <>{children({ organisationId, actor: user.name, userId: user.id })}</>;
}

/** HRBP-only recruitment screens. */
export function HrbpGate({ children }: { children: (ctx: Ctx) => ReactNode }) {
  return (
    <Gate portal="hr_ld_admin" message="Vacancy management is for HRBPs.">
      {children}
    </Gate>
  );
}

/** Hiring Manager screens (the Line Manager portal). */
export function HiringManagerGate({ children }: { children: (ctx: Ctx) => ReactNode }) {
  return (
    <Gate portal="line_manager" message="Vacancy approvals and hiring review are for Hiring Managers.">
      {children}
    </Gate>
  );
}

const VARIANT: Record<VacancyStatus, "secondary" | "warning" | "info" | "success" | "error"> = {
  draft: "warning",
  pending_approval: "info",
  approved: "info",
  published: "success",
  paused: "secondary",
  closed: "error",
};

export function VacancyStatusBadge({ status }: { status: VacancyStatus }) {
  return <Badge variant={VARIANT[status]}>{VACANCY_STATUS_LABEL[status]}</Badge>;
}

/** Runs a recruitment command and reports the result; returns true on success. */
export function runAction(fn: () => void, success: string) {
  try {
    fn();
    toast.success(success);
    return true;
  } catch (error) {
    toast.error(error instanceof RecruitmentError ? error.message : "Something went wrong. Please try again.");
    return false;
  }
}

export function formatDate(iso: string) {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
