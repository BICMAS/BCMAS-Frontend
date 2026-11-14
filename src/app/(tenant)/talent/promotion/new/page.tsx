import type { Metadata } from "next";

import { PromotionCreateView } from "@/features/talent";

export const metadata: Metadata = { title: "Create Promotion Assessment" };

export default function Page() {
  return <PromotionCreateView />;
}
