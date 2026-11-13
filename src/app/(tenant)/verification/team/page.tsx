import type { Metadata } from "next";

import { TeamVerificationView } from "@/features/verification";

export const metadata: Metadata = {
  title: "Team Verification",
};

export default function Page() {
  return <TeamVerificationView />;
}
