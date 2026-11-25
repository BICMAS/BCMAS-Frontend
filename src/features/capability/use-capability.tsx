"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import type { MockUser } from "@/types/user";

import { CapabilityError, capabilityRevision, subscribeCapability } from "./services/capability";

/** The signed-in person once browser data is ready, re-rendering when the capability data changes. */
export function useCapabilityUser(): MockUser | null {
  // -1 on the server: the sample data lives in the browser.
  const revision = useSyncExternalStore(subscribeCapability, capabilityRevision, () => -1);
  const user = useHydratedUser();
  return revision === -1 ? null : user;
}

/** Renders once the person is known. */
export function WithCapabilityUser({ children }: { children: (user: MockUser) => ReactNode }) {
  const user = useCapabilityUser();
  return user ? <>{children(user)}</> : <LoadingSkeleton rows={4} />;
}

/** Runs an action, showing its message when the rules refuse it. */
export function runCapability(action: () => void, success?: string) {
  try {
    action();
    if (success) toast.success(success);
    return true;
  } catch (e) {
    toast.error(e instanceof CapabilityError ? e.message : "Something went wrong. Please try again.");
    return false;
  }
}

export function formatDay(value: string) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function downloadText(filename: string, lines: string[]) {
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
