import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRole, RoleDetailView } from "@/features/roles";

export const metadata: Metadata = {
  title: "Role Detail",
};

type PageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function RoleDetailPage({ params }: PageProps) {
  const { roleId } = await params;
  const role = await getRole(roleId);
  if (!role) notFound();
  return <RoleDetailView role={role} />;
}
