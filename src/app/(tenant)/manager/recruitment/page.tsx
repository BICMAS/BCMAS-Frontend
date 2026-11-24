import type { Metadata } from "next";

import { HiringReviewListView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Hiring Manager Review",
};

export default function Page() {
  return <HiringReviewListView />;
}
