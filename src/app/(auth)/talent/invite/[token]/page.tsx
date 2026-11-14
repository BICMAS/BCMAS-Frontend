import type { Metadata } from "next";
import { Suspense } from "react";

import { RecruitmentInviteView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Assessment Invite",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default function Page({ params }: PageProps) {
  return (
    <Suspense fallback={null}>
      <InviteContent params={params} />
    </Suspense>
  );
}

async function InviteContent({ params }: PageProps) {
  const { token } = await params;
  return <RecruitmentInviteView token={token} />;
}
