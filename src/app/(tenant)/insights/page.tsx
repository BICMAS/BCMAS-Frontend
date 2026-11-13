import type { Metadata } from "next";

import { RoutePlaceholder } from "@/components/shared/route-placeholder";

export const metadata: Metadata = {
  title: "Executive Insights",
};

export default function Page() {
  return <RoutePlaceholder title="Executive Insights" />;
}
