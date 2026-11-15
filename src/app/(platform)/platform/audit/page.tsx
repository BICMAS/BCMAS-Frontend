import type { Metadata } from "next";
import { Suspense } from "react";

import { PlatformAuditView } from "@/features/platform";

export const metadata: Metadata = {
  title: "Platform Audit Logs",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PlatformAuditView />
    </Suspense>
  );
}
