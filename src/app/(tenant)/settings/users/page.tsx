import type { Metadata } from "next";

import { UserManagementView } from "@/features/accounts";

export const metadata: Metadata = {
  title: "User Management",
};

export default function Page() {
  return <UserManagementView />;
}
