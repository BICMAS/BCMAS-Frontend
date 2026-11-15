import type { Metadata } from "next";

import { ProvisionTenantView } from "@/features/platform";

export const metadata: Metadata = {
  title: "Provision Tenant",
};

export default function Page() {
  return <ProvisionTenantView />;
}
