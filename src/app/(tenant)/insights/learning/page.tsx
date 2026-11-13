import type { Metadata } from "next";

import { LearningReportView } from "@/features/insights";

export const metadata: Metadata = {
  title: "Learning Report",
};

export default function Page() {
  return <LearningReportView />;
}
