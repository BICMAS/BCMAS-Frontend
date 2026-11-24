"use client";

import { useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";

import { libraryRevision, subscribeLibrary } from "../services/central-library";
import { VERSION_STATUS_LABEL, type TemplateStatus, type VersionStatus } from "../types";

/** Re-renders when the library changes. */
export function useLibraryRevision() {
  return useSyncExternalStore(subscribeLibrary, libraryRevision, () => 0);
}

export const ROLE_FAMILIES = ["Sales", "Customer Service", "Operations", "Finance", "Technology", "Human Resources"];

export const selectClass =
  "h-9 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy outline-none";

export const fieldSelectClass =
  "mt-1 h-10 w-full rounded-lg border border-border-slate bg-white px-3 text-sm text-navy outline-none";

const VERSION_VARIANT: Record<VersionStatus, "success" | "warning" | "info" | "secondary" | "error"> = {
  published: "success",
  draft: "warning",
  in_review: "info",
  superseded: "secondary",
  retired: "error",
};

export function VersionBadge({
  status,
  version,
  label,
}: {
  status: VersionStatus;
  version?: string;
  /** Overrides the status wording, e.g. "Approved / Active" for organisation copies. */
  label?: string;
}) {
  return (
    <Badge variant={VERSION_VARIANT[status]}>
      {version ? `v${version} · ` : ""}
      {label ?? VERSION_STATUS_LABEL[status]}
    </Badge>
  );
}

export function TemplateStatusBadge({ status }: { status: TemplateStatus }) {
  if (status === "published") return <Badge variant="success">Published</Badge>;
  if (status === "draft") return <Badge variant="warning">Draft</Badge>;
  return <Badge variant="error">Retired</Badge>;
}

export function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
