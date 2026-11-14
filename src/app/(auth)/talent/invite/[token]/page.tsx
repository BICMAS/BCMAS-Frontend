import type { Metadata } from "next";

import { RecruitmentInviteView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Assessment Invite",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function Page({ params }: PageProps) {
  const { token } = await params;
  return <RecruitmentInviteView token={token} />;
}
