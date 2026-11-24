import type { Metadata } from "next";

import { CandidateAssessmentView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Assessment",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

/** Candidate assessment: no BCMS login. The emailed, expiring link is the credential. */
export default async function Page({ params }: PageProps) {
  const { token } = await params;
  return <CandidateAssessmentView token={token} />;
}
