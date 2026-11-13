import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRole, ProfileReviewView } from "@/features/roles";

export const metadata: Metadata = {
  title: "Profile Builder — Review",
};

type PageProps = {
  params: Promise<{ roleId: string }>;
};

export default async function ProfileReviewPage({ params }: PageProps) {
  const { roleId } = await params;
  const role = await getRole(roleId);
  if (!role) notFound();
  return <ProfileReviewView role={role} />;
}
