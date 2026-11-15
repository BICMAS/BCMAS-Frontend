import type { Metadata } from "next";

import { TenantDirectoryView } from "@/features/platform";

export const metadata: Metadata = {
  title: "Tenant Directory",
};

export default function Page() {
  return <TenantDirectoryView />;
}
