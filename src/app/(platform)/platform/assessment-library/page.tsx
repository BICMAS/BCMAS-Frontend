import type { Metadata } from "next";

import { CentralLibraryView } from "@/features/assessment-library";

export const metadata: Metadata = {
  title: "Central Assessment Library",
};

export default function Page() {
  return <CentralLibraryView />;
}
