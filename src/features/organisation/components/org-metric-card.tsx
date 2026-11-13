import {
  BadgeCheckIcon,
  ClockIcon,
  IdCardIcon,
  NetworkIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import type { OrgMetric } from "@/features/organisation/types";
import { cn } from "@/lib/utils";

const iconMap: Record<OrgMetric["icon"], LucideIcon> = {
  sitemap: NetworkIcon,
  badge: IdCardIcon,
  check: BadgeCheckIcon,
  clock: ClockIcon,
  users: UsersIcon,
};

type OrgMetricCardProps = {
  metric: OrgMetric;
  className?: string;
};

/**
 * Compact KPI tile matching Organisation Overview HTML stats row.
 */
export function OrgMetricCard({ metric, className }: OrgMetricCardProps) {
  const Icon = iconMap[metric.icon];

  return (
    <div
      className={cn(
        "rounded-xl border border-border-slate bg-white p-6 shadow-sm",
        className,
      )}
    >
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
    </div>
  );
}
