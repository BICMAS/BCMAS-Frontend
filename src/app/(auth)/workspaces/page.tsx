import type { Metadata } from "next";

import { WorkspaceSelectionView } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Select Workspace",
};

export default function Page() {
  return <WorkspaceSelectionView />;
}
