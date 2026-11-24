import type { Metadata } from "next";

import { RecruitmentInsightsView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Recruitment Insights",
};

export default function Page() {
  return <RecruitmentInsightsView />;
}
