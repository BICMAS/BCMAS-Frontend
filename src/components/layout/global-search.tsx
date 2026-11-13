"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import { SearchField } from "@/components/shared/search-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { searchGlobalIndex } from "@/lib/mock/global-search";
import { cn } from "@/lib/utils";

type GlobalSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function GlobalSearchBody({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => searchGlobalIndex(query), [query]);
  const safeActiveIndex =
    results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  return (
    <>
      <div className="border-b border-border-slate p-3">
        <SearchField
          autoFocus
          placeholder="Search roles, skills, employees…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && results[safeActiveIndex]) {
              e.preventDefault();
              onNavigate(results[safeActiveIndex].href);
            }
          }}
          className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500">
            No matches for “{query}”.
          </p>
        ) : (
          results.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                index === safeActiveIndex
                  ? "bg-slate-100"
                  : "hover:bg-slate-50",
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onNavigate(item.href)}
            >
              <SearchIcon
                className="mt-0.5 size-4 shrink-0 text-slate-400"
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-navy">
                  {item.title}
                </span>
                <span className="block text-xs text-slate-500">
                  {item.category} · {item.description}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search BCMS</DialogTitle>
          <DialogDescription>
            Jump to organisation, roles, skills, or employees.
          </DialogDescription>
        </DialogHeader>
        {/* Remount on open so query/activeIndex reset without effect setState */}
        {open ? <GlobalSearchBody key="open" onNavigate={go} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Registers Cmd/Ctrl+K to open global search. Render once in the shell.
 */
export function useGlobalSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
