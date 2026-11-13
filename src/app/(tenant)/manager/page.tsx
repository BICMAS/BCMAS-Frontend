import type { Metadata } from "next";

import { TeamDashboardView } from "@/features/manager";

export const metadata: Metadata = {
  title: "Team Dashboard",
};

export default function Page() {
  return <TeamDashboardView />;
}
