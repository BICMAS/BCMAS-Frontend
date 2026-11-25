import type { Metadata } from "next";

import { AssessmentResultsView } from "@/features/me";

export const metadata: Metadata = {
  title: "Assessment Results",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssessmentResultsPage({ params }: PageProps) {
  const { id } = await params;
  return <AssessmentResultsView assessmentId={id} />;
}
