import type { Metadata } from "next";
import { Suspense } from "react";

import { TeamDirectoryView } from "@/features/manager";

export const metadata: Metadata = {
  title: "Team Directory",
};

export default function Page() {
  // The directory reads ?focus= / ?gap= filters (from the dashboard), which needs a Suspense boundary.
  return (
    <Suspense>
      <TeamDirectoryView />
    </Suspense>
  );
}
