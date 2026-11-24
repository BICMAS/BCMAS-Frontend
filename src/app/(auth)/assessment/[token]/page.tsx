import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { CandidateAssessmentView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Assessment",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

/** Candidate assessment: no BCMS login. The emailed, expiring link is the credential. */
export default function Page({ params }: PageProps) {
  // The token is only known per request, so it is read inside Suspense and the rest can prerender.
  return (
    <Suspense fallback={<LoadingSkeleton rows={4} className="w-full max-w-2xl" />}>
      <Assessment params={params} />
    </Suspense>
  );
}

async function Assessment({ params }: PageProps) {
  const { token } = await params;
  return <CandidateAssessmentView token={token} />;
}
