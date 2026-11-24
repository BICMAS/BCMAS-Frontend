import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { AiActionsProvider } from "@/features/ai";
import { CandidateProfileView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Candidate",
};

type PageProps = {
  params: Promise<{ candidateId: string }>;
};

/** AI is used only for CV analysis and score suggestions; the profile works without it. */
export default function Page({ params }: PageProps) {
  return (
    <Suspense fallback={<LoadingSkeleton rows={4} />}>
      <Candidate params={params} />
    </Suspense>
  );
}

async function Candidate({ params }: PageProps) {
  const { candidateId } = await params;
  return (
    <AiActionsProvider>
      <CandidateProfileView candidateId={candidateId} />
    </AiActionsProvider>
  );
}
