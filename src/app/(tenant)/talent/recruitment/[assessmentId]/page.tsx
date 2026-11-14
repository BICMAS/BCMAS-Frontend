import type { Metadata } from "next";

import { RecruitmentDetailView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Recruitment Assessment",
};

type PageProps = {
  params: Promise<{ assessmentId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return <RecruitmentDetailView assessmentId={assessmentId} />;
}
