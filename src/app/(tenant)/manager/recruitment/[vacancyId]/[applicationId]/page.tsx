import type { Metadata } from "next";

import { CandidateReportView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Candidate Report",
};

type PageProps = {
  params: Promise<{ applicationId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { applicationId } = await params;
  return <CandidateReportView applicationId={applicationId} />;
}
