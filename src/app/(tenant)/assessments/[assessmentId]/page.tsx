import type { Metadata } from "next";

import { CycleDashboardView } from "@/features/ld";

export const metadata: Metadata = {
  title: "Assessment Cycle",
};

type PageProps = {
  params: Promise<{ assessmentId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { assessmentId } = await params;
  return <CycleDashboardView cycleId={assessmentId} />;
}
