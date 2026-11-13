import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FilterBarProps = {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Standard list-page toolbar: search + filters + trailing actions.
 */
export function FilterBar({
  search,
  filters,
  actions,
  className,
}: FilterBarProps) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border-slate bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center">
        {search ? <div className="min-w-0 flex-1 md:max-w-sm">{search}</div> : null}
        {filters ? (
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
