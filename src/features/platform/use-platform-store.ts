"use client";

import { useSyncExternalStore } from "react";

import { platformRevision, subscribePlatform } from "@/features/platform/services/mock-platform";

export function usePlatformRevision() {
  return useSyncExternalStore(subscribePlatform, platformRevision, () => 0);
}
