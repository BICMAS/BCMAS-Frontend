import type { Metadata } from "next";

import { PublicApplicationView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Apply",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

/** Public vacancy application: no BCMS login. */
export default async function Page({ params }: PageProps) {
  const { token } = await params;
  return <PublicApplicationView token={token} />;
}
