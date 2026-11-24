import type { Metadata } from "next";

import { CandidateInterviewView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Interview",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

/** AI-avatar interview for candidates: no BCMS login; the emailed, expiring link is the credential. */
export default async function Page({ params }: PageProps) {
  const { token } = await params;
  return <CandidateInterviewView token={token} />;
}
