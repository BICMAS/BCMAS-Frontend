import type { Metadata } from "next";

import { DesignSystemShowcase } from "@/components/shared/design-system-showcase";

export const metadata: Metadata = {
  title: "Design System",
  description: "BICMAS / BCMS enterprise design system component showcase",
};

export default function DesignSystemPage() {
  return <DesignSystemShowcase />;
}
