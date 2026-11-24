import type { Metadata } from "next";

import { VacancyApprovalView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Vacancy Approval",
};

type PageProps = {
  params: Promise<{ vacancyId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { vacancyId } = await params;
  return <VacancyApprovalView vacancyId={vacancyId} />;
}
