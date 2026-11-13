import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusIndicatorVariants = cva(
  "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider",
  {
    variants: {
      tone: {
        success: "text-green-deep",
        warning: "text-warning-soft-foreground",
        error: "text-error-soft-foreground",
        info: "text-info-soft-foreground",
        neutral: "text-slate-500",
        operational: "text-slate-500",
      },
    },
    defaultVariants: {
      tone: "operational",
    },
  },
);

const dotVariants = cva("size-2 shrink-0 rounded-full", {
  variants: {
    tone: {
      success: "bg-green-deep",
      warning: "bg-warning",
      error: "bg-error",
      info: "bg-info",
      neutral: "bg-slate-400",
      operational: "bg-green-lime shadow-status-glow",
    },
    pulse: {
      true: "animate-status-pulse",
      false: "",
    },
  },
  defaultVariants: {
    tone: "operational",
    pulse: false,
  },
});

type StatusIndicatorProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusIndicatorVariants> & {
    label: string;
    pulse?: boolean;
  };

/**
 * Operational / severity status with lime pulse dot (sidebar footer, platform header).
 */
export function StatusIndicator({
  className,
  tone = "operational",
  label,
  pulse = tone === "operational",
  ...props
}: StatusIndicatorProps) {
  return (
    <span
      data-slot="status-indicator"
      className={cn(statusIndicatorVariants({ tone }), className)}
      {...props}
    >
      <span className={cn(dotVariants({ tone, pulse }))} aria-hidden />
      {label}
    </span>
  );
}
