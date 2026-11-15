import type { Metadata } from "next";

import { PlatformDashboardView } from "@/features/platform";

export const metadata: Metadata = {
  title: "Platform Dashboard",
};

export default function PlatformDashboardPage() {
  return <PlatformDashboardView />;
}
