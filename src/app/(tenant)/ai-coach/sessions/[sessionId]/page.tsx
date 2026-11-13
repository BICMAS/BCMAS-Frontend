import type { Metadata } from "next";

import { SessionReviewView } from "@/features/ai-coach";

export const metadata: Metadata = {
  title: "Session Review",
};

type PageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function SessionReviewPage({ params }: PageProps) {
  const { sessionId } = await params;
  return <SessionReviewView sessionId={sessionId} />;
}
