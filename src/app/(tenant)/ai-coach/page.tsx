import type { Metadata } from "next";

import { CoachOverviewView } from "@/features/ai-coach";

export const metadata: Metadata = {
  title: "AI Coaching Overview",
};

export default function AICoachingPage() {
  return <CoachOverviewView />;
}
