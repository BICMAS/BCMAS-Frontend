import type { Metadata } from "next";

import { RoutePlaceholder } from "@/components/shared/route-placeholder";

export const metadata: Metadata = {
  title: "Support Management",
};

export default function Page() {
  return <RoutePlaceholder title="Support Management" />;
}
