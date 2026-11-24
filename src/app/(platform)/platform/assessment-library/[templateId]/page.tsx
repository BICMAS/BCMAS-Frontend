import type { Metadata } from "next";

import { TemplateDetailsView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "Assessment Template Details",
};

type PageProps = {
  params: Promise<{ templateId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { templateId } = await params;
  return <TemplateDetailsView templateId={templateId} />;
}
