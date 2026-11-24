import type { Metadata } from "next";

import { ShortlistView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Shortlisting",
};

type PageProps = {
  params: Promise<{ vacancyId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { vacancyId } = await params;
  return <ShortlistView vacancyId={vacancyId} />;
}
