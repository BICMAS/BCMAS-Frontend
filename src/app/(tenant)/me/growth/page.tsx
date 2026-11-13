import type { Metadata } from "next";

import { GrowthHubView } from "@/features/me";

export const metadata: Metadata = {
  title: "Growth Hub",
};

export default function GrowthHubPage() {
  return <GrowthHubView />;
}
