import type { Metadata } from "next";

import { PlansHubView } from "@/features/ai";

export const metadata: Metadata = { title: "AI Training Plans" };

export default function AiPlansPage() {
  return <PlansHubView />;
}
