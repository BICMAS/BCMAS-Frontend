import type { Metadata } from "next";

import { PromotionResultsView } from "@/features/talent";

export const metadata: Metadata = { title: "Promotion Readiness" };

type PageProps = { params: Promise<{ assessmentId: string }> };

export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return <PromotionResultsView assessmentId={assessmentId} />;
}
