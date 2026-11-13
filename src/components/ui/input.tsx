import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

/**
 * BCMS form input — slate-50 fill, border-slate, navy focus ring.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-border-slate bg-slate-50 px-4 py-3 text-sm text-navy transition-all outline-none",
        "placeholder:text-muted-slate",
        "focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-navy",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "file:mr-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
