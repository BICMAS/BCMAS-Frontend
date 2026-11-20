import type { Metadata } from "next";

import { TakeAssessmentView } from "@/features/ai";

export const metadata: Metadata = { title: "Assessment" };

type PageProps = { params: Promise<{ assessmentId: string }> };

export default async function TakeAssessmentPage({ params }: PageProps) {
  const { assessmentId } = await params;
  return <TakeAssessmentView assessmentId={assessmentId} />;
}
