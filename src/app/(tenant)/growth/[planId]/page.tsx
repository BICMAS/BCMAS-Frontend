import type { Metadata } from "next";

import { GrowthPathwayView } from "@/features/ld";

export const metadata: Metadata = {
  title: "Individual Growth Pathway",
};

type PageProps = {
  params: Promise<{ planId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { planId } = await params;
  return <GrowthPathwayView planId={planId} />;
}
