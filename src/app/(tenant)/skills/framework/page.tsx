import type { Metadata } from "next";

import { FrameworkSettingsView, getFramework } from "@/features/skills";

export const metadata: Metadata = {
  title: "Framework Settings",
};

export default async function FrameworkSettingsPage() {
  const levels = await getFramework();
  return <FrameworkSettingsView initialLevels={levels} />;
}
