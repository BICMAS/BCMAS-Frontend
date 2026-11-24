import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { BrowserOnly, PublicApplicationView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Apply",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

/** Public vacancy application: no BCMS login. */
export default function Page({ params }: PageProps) {
  // The token is only known per request, so it is read inside Suspense and the rest can prerender.
  return (
    <Suspense fallback={<LoadingSkeleton rows={4} className="w-full max-w-2xl" />}>
      <Application params={params} />
    </Suspense>
  );
}

async function Application({ params }: PageProps) {
  const { token } = await params;
  return (
    <BrowserOnly>
      <PublicApplicationView token={token} />
    </BrowserOnly>
  );
}
