import type { Metadata } from "next";

import { RoutePlaceholder } from "@/components/shared/route-placeholder";

export const metadata: Metadata = {
  title: "Security Settings",
};

export default function Page() {
  return <RoutePlaceholder title="Security Settings" />;
}
