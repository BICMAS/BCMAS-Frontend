import type { Metadata } from "next";

import { ScenarioLibraryView } from "@/features/ai-coach";

export const metadata: Metadata = {
  title: "Scenario Library",
};

export default function ScenarioLibraryPage() {
  return <ScenarioLibraryView />;
}
