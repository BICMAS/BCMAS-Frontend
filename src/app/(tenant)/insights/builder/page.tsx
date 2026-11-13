import type { Metadata } from "next";

import { RoutePlaceholder } from "@/components/shared/route-placeholder";

export const metadata: Metadata = {
  title: "Custom Report Builder",
};

export default function Page() {
  return <RoutePlaceholder title="Custom Report Builder" />;
}
