import type { Metadata } from "next";

import { ReviewView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "Assessment Review & Approval",
};

type PageProps = {
  params: Promise<{ assessmentId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return <ReviewView assessmentId={assessmentId} />;
}
