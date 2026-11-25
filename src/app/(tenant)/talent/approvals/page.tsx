import type { Metadata } from "next";

import { ApprovalsView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "Assessment Approvals",
};

export default function Page() {
  return <ApprovalsView />;
}
