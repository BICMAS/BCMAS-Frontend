import type { Metadata } from "next";

import { EvidenceReviewView } from "@/features/verification";

export const metadata: Metadata = {
  title: "Evidence Review",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <EvidenceReviewView evidenceId={id} />;
}
