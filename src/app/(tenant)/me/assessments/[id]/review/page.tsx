import type { Metadata } from "next";

import { AssessmentReviewView } from "@/features/me";

export const metadata: Metadata = {
  title: "Assessment Review",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AssessmentReviewPage({ params }: PageProps) {
  const { id } = await params;
  return <AssessmentReviewView assessmentId={id} />;
}
