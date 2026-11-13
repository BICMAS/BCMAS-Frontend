import type { Metadata } from "next";

import { GapAnalysisView } from "@/features/insights";

export const metadata: Metadata = {
  title: "Capability Gap Analysis",
};

export default function Page() {
  return <GapAnalysisView />;
}
