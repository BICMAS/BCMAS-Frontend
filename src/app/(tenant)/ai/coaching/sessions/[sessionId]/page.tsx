import type { Metadata } from "next";

import { RoleplayView } from "@/features/ai";

export const metadata: Metadata = { title: "Role-play practice" };

type PageProps = { params: Promise<{ sessionId: string }> };

export default async function RoleplaySessionPage({ params }: PageProps) {
  const { sessionId } = await params;
  return <RoleplayView sessionId={sessionId} />;
}
