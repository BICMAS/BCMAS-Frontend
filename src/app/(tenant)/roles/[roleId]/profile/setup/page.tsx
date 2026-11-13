import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRole, ProfileSetupView } from "@/features/roles";

export const metadata: Metadata = {
  title: "Profile Builder — Setup",
};

type PageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function ProfileSetupPage({ params }: PageProps) {
  const { roleId } = await params;
  const role = await getRole(roleId);
  if (!role) notFound();
  return <ProfileSetupView role={role} />;
}
