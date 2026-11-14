import type { Metadata } from "next";

import { PromotionStartView } from "@/features/talent";

export const metadata: Metadata = { title: "Promotion Assessment" };

type PageProps = { params: Promise<{ assessmentId: string }> };

export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return <PromotionStartView assessmentId={assessmentId} />;
}
