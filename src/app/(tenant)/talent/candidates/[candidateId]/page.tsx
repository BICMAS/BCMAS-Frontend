import type { Metadata } from "next";

import { AiClientProvider } from "@/features/ai";
import { CandidateProfileView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Candidate",
};

type PageProps = {
  params: Promise<{ candidateId: string }>;
};

/** CV analysis calls the AI talent agent, so the profile needs the shared AI client. */
export default async function Page({ params }: PageProps) {
  const { candidateId } = await params;
  return (
    <AiClientProvider>
      <CandidateProfileView candidateId={candidateId} />
    </AiClientProvider>
  );
}
