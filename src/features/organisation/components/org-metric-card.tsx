import {
  BadgeCheckIcon,
  ClockIcon,
  FilePenLineIcon,
  IdCardIcon,
  NetworkIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { OrgMetric } from "@/features/organisation/types";
import { cn } from "@/lib/utils";

const iconMap: Record<OrgMetric["icon"], LucideIcon> = {
  sitemap: NetworkIcon,
  badge: IdCardIcon,
  check: BadgeCheckIcon,
  clock: ClockIcon,
  users: UsersIcon,
  draft: FilePenLineIcon,
};

type OrgMetricCardProps = {
  metric: OrgMetric;
  className?: string;
  /** Renders the card as a button (takes precedence over `metric.href`). */
  onClick?: () => void;
  /** Highlights the card, e.g. when its filter is applied. */
  active?: boolean;
};

/**
 * Compact KPI tile matching Organisation Overview HTML stats row.
 */
export function OrgMetricCard({
  metric,
  className,
  onClick,
  active,
}: OrgMetricCardProps) {
  const Icon = iconMap[metric.icon];

  const cardClassName = cn(
    "block w-full rounded-xl border border-border-slate bg-white p-6 text-left shadow-sm",
    (metric.href || onClick) &&
      "cursor-pointer transition hover:border-navy/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
    active && "border-navy ring-1 ring-navy",
    className,
  );

  const content = (
    <>
      <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
        {metric.label}
      </p>
      <div
        className={cn(
          "flex items-center justify-between",
          metric.tone === "success" && "text-green-deep",
          metric.tone === "warning" && "text-amber-600",
        )}
      >
        <h3 className="text-2xl font-bold">{metric.value}</h3>
        <Icon
          className={cn(
            "size-5",
            metric.tone === "success" && "text-green-lime/30",
            metric.tone === "warning" && "text-amber-200",
            !metric.tone && "text-navy/20",
          )}
          aria-hidden
        />
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cardClassName}
        onClick={onClick}
        aria-pressed={active}
        aria-label={`${metric.label}: ${metric.value}. Filter the list`}
      >
        {content}
      </button>
    );
  }

  if (!metric.href) {
    return <div className={cardClassName}>{content}</div>;
  }

  return (
    <Link
      href={metric.href}
      className={cardClassName}
      aria-label={`${metric.label}: ${metric.value}. View details`}
    >
      {content}
    </Link>
  );
}
