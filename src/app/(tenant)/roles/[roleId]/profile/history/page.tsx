import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRole, ProfileHistoryView } from "@/features/roles";

export const metadata: Metadata = {
  title: "Profile History",
};

type PageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function ProfileHistoryPage({ params }: PageProps) {
  const { roleId } = await params;
  const role = await getRole(roleId);
  if (!role) notFound();
  return <ProfileHistoryView role={role} />;
}
