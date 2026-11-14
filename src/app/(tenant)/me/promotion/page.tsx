import type { Metadata } from "next";

import { OwnPromotionListView } from "@/features/talent";

export const metadata: Metadata = { title: "My Promotion" };

export default function Page() {
  return <OwnPromotionListView />;
}
