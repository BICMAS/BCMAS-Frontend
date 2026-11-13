import type { Metadata } from "next";

import { ProgressTimelineView } from "@/features/me";

export const metadata: Metadata = {
  title: "Progress Timeline",
};

export default function ProgressTimelinePage() {
  return <ProgressTimelineView />;
}
