import type { Metadata } from "next";

import { VerificationResultsView } from "@/features/verification";

export const metadata: Metadata = {
  title: "Verification Results",
};

export default function Page() {
  return <VerificationResultsView />;
}
