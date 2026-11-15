import type { Metadata } from "next";

import { SupportManagementView } from "@/features/platform";

export const metadata: Metadata = {
  title: "Support Management",
};

export default function Page() {
  return <SupportManagementView />;
}
