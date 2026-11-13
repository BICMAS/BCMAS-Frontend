import type { Metadata } from "next";

import { AssessmentResultsView } from "@/features/me";

export const metadata: Metadata = {
  title: "Assessment Results",
};

export default function AssessmentResultsPage() {
  return <AssessmentResultsView />;
}
