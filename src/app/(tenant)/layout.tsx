import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

/**
 * Tenant portals share the BCMS AppShell (HTML 02–04).
 */
export default function TenantLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
