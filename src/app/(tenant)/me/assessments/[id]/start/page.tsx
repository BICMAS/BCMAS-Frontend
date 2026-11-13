import type { Metadata } from "next";

import { AssessmentStartView } from "@/features/me";

export const metadata: Metadata = {
  title: "Assessment Start",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssessmentStartPage({ params }: PageProps) {
  const { id } = await params;
  return <AssessmentStartView assessmentId={id} />;
}
