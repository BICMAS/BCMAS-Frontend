import type { Metadata } from "next";

import { TalentInsightsView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Talent Insights",
};

export default function Page() {
  return <TalentInsightsView />;
}
