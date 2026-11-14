"use client";

import { useSyncExternalStore } from "react";

import { useSessionStore } from "@/stores/session-store";
import type { MockUser } from "@/types/user";

function subscribe(onStoreChange: () => void) {
  return useSessionStore.persist.onFinishHydration(onStoreChange);
}

function hydratedSnapshot() {
  return useSessionStore.persist.hasHydrated();
}

/** Wait until the mock session has rehydrated so portal checks do not use the default user. */
export function useHydratedUser(): MockUser | null {
  const hydrated = useSyncExternalStore(subscribe, hydratedSnapshot, () => false);
  const user = useSessionStore((state) => state.user);
  return hydrated ? user : null;
}
