"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Default label uses BCMS field-label style (uppercase xs bold).
 * Pass `className` to override for inline / body labels.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-field-label flex items-center gap-2 select-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
