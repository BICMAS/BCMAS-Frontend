import type { Metadata } from "next";

import { ManagerPromotionView } from "@/features/manager";

export const metadata: Metadata = { title: "Promotion Review" };

export default function Page() {
  return <ManagerPromotionView />;
}
