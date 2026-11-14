import type { Metadata } from "next";

import { PromotionListView } from "@/features/talent";

export const metadata: Metadata = { title: "Promotion Assessments" };

export default function Page() {
  return <PromotionListView />;
}
