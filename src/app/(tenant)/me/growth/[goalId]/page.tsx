import type { Metadata } from "next";

import { GrowthJourneyView } from "@/features/me";

export const metadata: Metadata = {
  title: "Growth Journey",
};

type PageProps = {
  params: Promise<{ goalId: string }>;
};

export default async function GrowthJourneyPage({ params }: PageProps) {
  const { goalId } = await params;
  return <GrowthJourneyView goalId={goalId} />;
}
