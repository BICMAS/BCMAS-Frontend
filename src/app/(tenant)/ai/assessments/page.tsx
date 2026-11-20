import type { Metadata } from "next";

import { AssessmentsHubView } from "@/features/ai";

export const metadata: Metadata = { title: "AI Talent Assessment" };

export default function AiAssessmentsPage() {
  return <AssessmentsHubView />;
}
