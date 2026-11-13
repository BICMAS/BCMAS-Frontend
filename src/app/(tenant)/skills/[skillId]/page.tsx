import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSkill, SkillDetailView } from "@/features/skills";

export const metadata: Metadata = {
  title: "Skill Detail",
};

type PageProps = {
  params: Promise<{ skillId: string }>;
};

export default async function SkillDetailPage({ params }: PageProps) {
  const { skillId } = await params;
  const skill = await getSkill(skillId);
  if (!skill) notFound();
  return <SkillDetailView skill={skill} />;
}
