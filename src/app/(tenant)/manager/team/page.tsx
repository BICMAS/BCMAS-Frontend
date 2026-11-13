import type { Metadata } from "next";

import { TeamDirectoryView } from "@/features/manager";

export const metadata: Metadata = {
  title: "Team Directory",
};

export default function Page() {
  return <TeamDirectoryView />;
}
