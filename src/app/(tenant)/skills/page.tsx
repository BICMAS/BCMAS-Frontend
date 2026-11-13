import type { Metadata } from "next";

import { listSkills, SkillsLibraryView } from "@/features/skills";

export const metadata: Metadata = {
  title: "Skills Library",
};

export default async function SkillsPage() {
  const skills = await listSkills();
  return <SkillsLibraryView initialSkills={skills} />;
}
