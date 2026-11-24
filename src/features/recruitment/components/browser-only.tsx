"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

const subscribe = () => () => {};

/**
 * Waits for the browser before showing its children. The sample data lives in the browser, so the
 * server cannot render the same page; remove this once the pages load from the backend.
 */
export function BrowserOnly({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return ready ? children : <LoadingSkeleton rows={4} className="w-full max-w-2xl" />;
}
