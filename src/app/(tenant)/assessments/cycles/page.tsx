import type { Metadata } from "next";

import { AssessmentCyclesView } from "@/features/ld";

export const metadata: Metadata = {
  title: "Assessment Cycles",
};

export default function Page() {
  return <AssessmentCyclesView />;
}
