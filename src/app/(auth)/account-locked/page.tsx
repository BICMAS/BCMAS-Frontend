import type { Metadata } from "next";

import { AccountLockedView } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Account Locked",
};

export default function Page() {
  return <AccountLockedView />;
}
