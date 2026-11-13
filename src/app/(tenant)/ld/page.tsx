import type { Metadata } from "next";

import { LdDashboardView } from "@/features/ld";

export const metadata: Metadata = {
  title: "L&D Dashboard",
};

export default function Page() {
  return <LdDashboardView />;
}
