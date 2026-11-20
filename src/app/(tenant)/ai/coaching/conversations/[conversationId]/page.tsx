import type { Metadata } from "next";

import { ConversationView } from "@/features/ai";

export const metadata: Metadata = { title: "Coaching conversation" };

type PageProps = { params: Promise<{ conversationId: string }> };

export default async function CoachingConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  return <ConversationView conversationId={conversationId} />;
}
