import type { Metadata } from "next";

import { IndividualAssessmentView } from "@/features/ld";

export const metadata: Metadata = {
  title: "Individual Assessment",
};

type PageProps = {
  params: Promise<{ assessmentId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return <IndividualAssessmentView assessmentId={assessmentId} />;
}
