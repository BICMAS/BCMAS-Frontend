import type { Metadata } from "next";

import { CoachSessionView } from "@/features/ai-coach";

export const metadata: Metadata = {
  title: "AI Coach",
};

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function CoachSessionPage({ params }: PageProps) {
  const { sessionId } = await params;
  return <CoachSessionView sessionId={sessionId} />;
}
