"use client";

import { InfoIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  PROFILE_STATUS_LABELS,
  type ProfileLifecycleStatus,
} from "@/lib/mock/types";

const variantMap: Record<
  ProfileLifecycleStatus,
  "success" | "info" | "secondary" | "warning" | "accent"
> = {
  published: "success",
  approved: "success",
  awaiting_review: "info",
  draft: "secondary",
  changes_requested: "warning",
};

/** What each skills profile status means (shown on hover / focus). */
export const PROFILE_STATUS_MEANINGS: Record<ProfileLifecycleStatus, string> = {
  draft: "Role profile is being created",
  awaiting_review: "Submitted for review and validation",
  changes_requested: "Reviewer has requested amendments",
  approved: "Skills profile has been approved",
  published: "Approved profile is active and available for use",
};

const ORDER: ProfileLifecycleStatus[] = [
  "draft",
  "awaiting_review",
  "changes_requested",
  "approved",
  "published",
];

type RoleStatusBadgeProps = {
  status: ProfileLifecycleStatus;
  /** Reveal the status meaning on hover / keyboard focus. */
  withMeaning?: boolean;
};

export function RoleStatusBadge({ status, withMeaning = false }: RoleStatusBadgeProps) {
  const badge = (
    <Badge variant={variantMap[status]} className="rounded uppercase">
      {PROFILE_STATUS_LABELS[status]}
    </Badge>
  );
  if (!withMeaning) return badge;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="inline-flex cursor-help rounded focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
            aria-label={`${PROFILE_STATUS_LABELS[status]}: ${PROFILE_STATUS_MEANINGS[status]}`}
          />
        }
      >
        {badge}
      </TooltipTrigger>
      <TooltipContent>{PROFILE_STATUS_MEANINGS[status]}</TooltipContent>
    </Tooltip>
  );
}

/** "What do the statuses mean?": every status and its meaning, on hover / focus. */
export function ProfileStatusLegend() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-navy focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          />
        }
      >
        <InfoIcon className="size-3.5" aria-hidden />
        Status meanings
      </TooltipTrigger>
      <TooltipContent side="bottom" className="block max-w-sm py-2">
        <dl className="space-y-1">
          {ORDER.map((status) => (
            <div key={status} className="flex gap-2">
              <dt className="w-36 shrink-0 font-bold">{PROFILE_STATUS_LABELS[status]}</dt>
              <dd>{PROFILE_STATUS_MEANINGS[status]}</dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}
