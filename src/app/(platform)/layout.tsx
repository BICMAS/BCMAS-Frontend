import type { ReactNode } from "react";

import { PlatformShell } from "@/components/layout/platform-shell";

/**
 * Platform Super Admin — BICMAS COMMAND shell (HTML 56+).
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <PlatformShell>{children}</PlatformShell>;
}
