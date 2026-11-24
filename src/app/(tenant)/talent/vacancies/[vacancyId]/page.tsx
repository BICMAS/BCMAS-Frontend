import type { Metadata } from "next";
import { Suspense } from "react";

import { VacancyView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Vacancy",
};

type PageProps = {
  params: Promise<{ vacancyId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { vacancyId } = await params;
  return (
    <Suspense fallback={null}>
      <VacancyView vacancyId={vacancyId} />
    </Suspense>
  );
}
