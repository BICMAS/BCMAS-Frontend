import type { Metadata } from "next";

import { CoachingHubView } from "@/features/ai";

export const metadata: Metadata = { title: "AI Coaching" };

export default function AiCoachingPage() {
  return <CoachingHubView />;
}
