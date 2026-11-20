import type { Metadata } from "next";

import { AiCentreView } from "@/features/ai";

export const metadata: Metadata = { title: "AI Capability Centre" };

export default function AiCentrePage() {
  return <AiCentreView />;
}
