import type { Metadata } from "next";

import { AiClientProvider } from "@/features/ai";
import { AiBuilderView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "AI Assessment Builder",
};

type PageProps = {
  params: Promise<{ assessmentId: string }>;
};

/** The builder calls the AI service (talent agent), so it needs the shared AI client. */
export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return (
    <AiClientProvider>
      <AiBuilderView assessmentId={assessmentId} />
    </AiClientProvider>
  );
}
