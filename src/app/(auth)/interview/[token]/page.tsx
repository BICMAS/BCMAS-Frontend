import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { BrowserOnly, CandidateInterviewView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Interview",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

/** AI-avatar interview for candidates: no BCMS login; the emailed, expiring link is the credential. */
export default function Page({ params }: PageProps) {
  // The token is only known per request, so it is read inside Suspense and the rest can prerender.
  return (
    <Suspense fallback={<LoadingSkeleton rows={4} className="w-full max-w-2xl" />}>
      <Interview params={params} />
    </Suspense>
  );
}

async function Interview({ params }: PageProps) {
  const { token } = await params;
  return (
    <BrowserOnly>
      <CandidateInterviewView token={token} />
    </BrowserOnly>
  );
}
