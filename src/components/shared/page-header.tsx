import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/**
 * Standard page title block: breadcrumbs, h1, description, action cluster.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn("mb-8 flex flex-col gap-4 lg:mb-10", className)}
    >
      {breadcrumbs}
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-slate-500 md:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
