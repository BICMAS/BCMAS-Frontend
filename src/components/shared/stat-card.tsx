import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "success" | "warning" | "error" | "neutral";
  icon?: LucideIcon;
  iconWellClassName?: string;
  className?: string;
};

const deltaToneClass: Record<
  NonNullable<StatCardProps["deltaTone"]>,
  string
> = {
  success: "text-green-deep",
  warning: "text-warning-soft-foreground",
  error: "text-error-soft-foreground",
  neutral: "text-slate-500",
};

/**
 * KPI metric card from AppShell / dashboards.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTone = "success",
  icon: Icon,
  iconWellClassName = "bg-blue-50 text-blue-600",
  className,
}: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-eyebrow">{label}</span>
          {Icon ? (
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                iconWellClassName,
              )}
            >
              <Icon className="size-4" aria-hidden />
            </div>
          ) : null}
        </div>
        <div className="flex items-end gap-3">
          <p className="text-3xl font-bold text-navy">{value}</p>
          {delta ? (
            <span
              className={cn(
                "pb-1 text-xs font-bold",
                deltaToneClass[deltaTone],
              )}
            >
              {delta}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
