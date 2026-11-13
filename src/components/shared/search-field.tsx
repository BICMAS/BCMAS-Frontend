import type * as React from "react";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = Omit<React.ComponentProps<"input">, "type"> & {
  containerClassName?: string;
  showShortcut?: boolean;
};

/**
 * Global / in-page search with leading magnifier (AppShell Cmd+K pattern).
 */
export function SearchField({
  className,
  containerClassName,
  showShortcut = false,
  placeholder = "Search across BCMS...",
  ...props
}: SearchFieldProps) {
  return (
    <div className={cn("relative w-full", containerClassName)}>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-slate"
        aria-hidden
      />
      <Input
        type="search"
        placeholder={placeholder}
        className={cn("pl-10", showShortcut && "pr-20", className)}
        {...props}
      />
      {showShortcut ? (
        <div className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 gap-1">
          <kbd className="rounded border border-border-slate bg-white px-1.5 py-0.5 font-sans text-[10px] text-muted-slate uppercase">
            Cmd
          </kbd>
          <kbd className="rounded border border-border-slate bg-white px-1.5 py-0.5 font-sans text-[10px] text-muted-slate uppercase">
            K
          </kbd>
        </div>
      ) : null}
    </div>
  );
}
