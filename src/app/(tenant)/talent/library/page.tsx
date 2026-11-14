import type { Metadata } from "next";

import { TalentLibraryView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Assessment Library",
};

export default function Page() {
  return <TalentLibraryView />;
}
