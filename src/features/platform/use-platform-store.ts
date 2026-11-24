"use client";

import { useSyncExternalStore } from "react";

import {
  platformRevision,
  subscribePlatform,
  tenantForOrganisation,
} from "@/features/platform/services/mock-platform";

export function usePlatformRevision() {
  return useSyncExternalStore(subscribePlatform, platformRevision, () => 0);
}

/**
 * Features the Platform Super Admin enabled for an organisation's tenant, or null when there is no
 * tenant record (or before hydration) — null means "show everything".
 */
export function useTenantEntitlements(organisationId: string): string[] | null {
  // -1 on the server: tenant data lives in browser storage, so menus are filtered after hydration.
  const revision = useSyncExternalStore(subscribePlatform, platformRevision, () => -1);
  if (revision === -1) return null;
  return tenantForOrganisation(organisationId)?.entitlements ?? null;
}
