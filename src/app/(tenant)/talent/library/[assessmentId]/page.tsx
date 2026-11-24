import type { Metadata } from "next";

import { OrgAssessmentDetailsView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "Organisation Assessment",
};

type PageProps = {
  params: Promise<{ assessmentId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return <OrgAssessmentDetailsView assessmentId={assessmentId} />;
}
