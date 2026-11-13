import type { Metadata } from "next";

import { RoutePlaceholder } from "@/components/shared/route-placeholder";

export const metadata: Metadata = {
  title: "Assumed Access",
};

export default function Page() {
  return <RoutePlaceholder title="Assumed Access" />;
}
