import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Label + control + hint/error stack matching BCMS form patterns.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <div data-slot="field" className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-error-soft-foreground">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
