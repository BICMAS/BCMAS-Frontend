import type { Metadata } from "next";

import { BcmsTemplateView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "BCMS Assessment Template",
};

type PageProps = {
  params: Promise<{ templateId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { templateId } = await params;
  return <BcmsTemplateView templateId={templateId} />;
}
