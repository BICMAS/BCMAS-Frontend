"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangleIcon, PlugZapIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { AiApiError, describeAiError } from "../../api/errors";

/** Error panel with the service's safe message and a retry when it makes sense. */
export function AiErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const { title, message, retryable } = describeAiError(error);
  const notConnected = error instanceof AiApiError && error.code === "backend_dependency_unconfirmed";
  const Icon = notConnected ? PlugZapIcon : AlertTriangleIcon;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-xl border border-border-slate bg-white px-6 py-10 text-center shadow-card",
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-error-soft text-error-soft-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="font-bold text-navy">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>
      {error instanceof AiApiError && error.requestId ? (
        <p className="mt-2 text-[11px] text-slate-400">Reference: {error.requestId}</p>
      ) : null}
      {onRetry && retryable ? (
        <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Standard data region: loading → error → empty → content. */
export function AiDataRegion<T>({
  loading,
  error,
  data,
  onRetry,
  isEmpty,
  empty,
  rows = 3,
  children,
}: {
  loading: boolean;
  error: unknown;
  data: T | undefined;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: { title: string; description?: string; icon?: LucideIcon; action?: ReactNode };
  rows?: number;
  children: (data: T) => ReactNode;
}) {
  if (loading && data === undefined) return <LoadingSkeleton rows={rows} />;
  if (error) return <AiErrorState error={error} onRetry={onRetry} />;
  if (data === undefined) return null;
  if (empty && isEmpty?.(data)) {
    return (
      <EmptyState
        title={empty.title}
        description={empty.description}
        icon={empty.icon ?? SparklesIcon}
        action={empty.action}
      />
    );
  }
  return <>{children(data)}</>;
}

/** Inline error for actions (forms, buttons). */
export function AiInlineError({ error }: { error: unknown }) {
  if (!error) return null;
  const { title, message } = describeAiError(error);
  return (
    <p role="alert" className="rounded-lg bg-error-soft px-3 py-2 text-sm text-error-soft-foreground">
      <span className="font-semibold">{title}.</span> {message}
    </p>
  );
}

/** AI provenance note shown with generated content. */
export function AiDisclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
      <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-blue-600" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const STATUS_TONE: Record<string, "success" | "warning" | "error" | "info" | "secondary"> = {
  succeeded: "success",
  completed: "success",
  approved: "success",
  accepted: "success",
  committed: "success",
  evaluated: "success",
  modified: "success",
  edited: "success",
  achieved: "success",
  on_track: "success",
  available: "success",
  running: "info",
  routing: "info",
  active: "info",
  evaluating: "info",
  open: "info",
  pending: "warning",
  awaiting_input: "warning",
  awaiting_approval: "warning",
  awaiting: "warning",
  at_risk: "warning",
  degraded: "warning",
  partially_succeeded: "warning",
  completed_with_warnings: "warning",
  needs_clarification: "warning",
  failed: "error",
  rejected: "error",
  overdue: "error",
  unavailable: "error",
  expired: "secondary",
  cancelled: "secondary",
  skipped: "secondary",
  not_started: "secondary",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant={STATUS_TONE[status] ?? "secondary"}>{label ?? status.replace(/_/g, " ")}</Badge>;
}

/** Banner shown when the isolated mock adapter is active (local development only). */
export function MockModeBanner({ mode }: { mode: "live" | "mock" }) {
  if (mode !== "mock") return null;
  return (
    <p className="rounded-lg border border-dashed border-warning bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
      Local development data: the AI mock adapter is active (NEXT_PUBLIC_AI_MODE=mock). No AI service is called.
    </p>
  );
}
