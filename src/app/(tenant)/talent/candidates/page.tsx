import type { Metadata } from "next";

import { CandidateListView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Candidate Management",
};

export default function Page() {
  return <CandidateListView />;
}
