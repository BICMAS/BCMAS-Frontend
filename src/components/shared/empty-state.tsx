import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

/**
 * Empty content panel with optional action slot (AppShell empty roles pattern).
 */
export function EmptyState({
  title,
  description,
  icon: Icon = InboxIcon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-slate bg-white px-6 py-16 text-center shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="text-lg font-bold text-navy">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
