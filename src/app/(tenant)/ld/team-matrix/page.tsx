import type { Metadata } from "next";

import { TeamMatrixView } from "@/features/ld";

export const metadata: Metadata = {
  title: "Team Development Matrix",
};

export default function Page() {
  return <TeamMatrixView />;
}
