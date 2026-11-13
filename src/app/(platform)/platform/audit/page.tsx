import type { Metadata } from "next";

import { RoutePlaceholder } from "@/components/shared/route-placeholder";

export const metadata: Metadata = {
  title: "Platform Audit Logs",
};

export default function Page() {
  return <RoutePlaceholder title="Platform Audit Logs" />;
}
