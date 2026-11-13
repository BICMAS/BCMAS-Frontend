import type { Metadata } from "next";

import { VerificationOverviewView } from "@/features/verification";

export const metadata: Metadata = {
  title: "Verification Overview",
};

export default function Page() {
  return <VerificationOverviewView />;
}
