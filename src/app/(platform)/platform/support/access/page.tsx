import type { Metadata } from "next";
import { Suspense } from "react";

import { AssumedAccessView } from "@/features/platform";

export const metadata: Metadata = {
  title: "Assumed Access",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AssumedAccessView />
    </Suspense>
  );
}
