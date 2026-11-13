import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

/**
 * Notifications are shared across tenant personas and use AppShell chrome.
 */
export default function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
