import type { Metadata } from "next";

import { MySkillsView } from "@/features/me";

export const metadata: Metadata = {
  title: "My Skills",
};

export default function MySkillsPage() {
  return <MySkillsView />;
}
