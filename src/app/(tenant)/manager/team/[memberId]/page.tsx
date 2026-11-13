import type { Metadata } from "next";

import { MemberDetailView } from "@/features/manager";

export const metadata: Metadata = {
  title: "Member Detail",
};

type PageProps = {
  params: Promise<{ memberId: string }>;
};

export default async function Page({ params }: PageProps) {
  const { memberId } = await params;
  return <MemberDetailView memberId={memberId} />;
}
