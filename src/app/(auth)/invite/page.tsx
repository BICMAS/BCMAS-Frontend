import type { Metadata } from "next";

import { InviteAcceptanceView } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Accept Invitation",
};

export default function Page() {
  return <InviteAcceptanceView />;
}
