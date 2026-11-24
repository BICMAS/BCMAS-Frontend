import type { Metadata } from "next";

import { OrgLibraryView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "Organisation Assessment Library",
};

export default function Page() {
  return <OrgLibraryView />;
}
