"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

import { useSessionStore } from "@/stores/session-store";

function subscribe(onStoreChange: () => void) {
  return useSessionStore.persist.onFinishHydration(onStoreChange);
}

function hydratedSnapshot() {
  return useSessionStore.persist.hasHydrated();
}

export function PlatformGate({ children }: { children: ReactNode }) {
  const hydrated = useSyncExternalStore(subscribe, hydratedSnapshot, () => false);
  const user = useSessionStore((state) => state.user);
  if (!hydrated) return null;
  if (user.portal !== "platform_super_admin") {
    return (
      <p className="text-sm text-slate-500">
        Platform administration is available to the Platform Super Admin.
      </p>
    );
  }
  return children;
}
