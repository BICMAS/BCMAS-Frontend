import type { Metadata } from "next";

import { listRoles, RolesDirectoryView } from "@/features/roles";

export const metadata: Metadata = {
  title: "Roles Directory",
};

export default async function RolesPage() {
  const roles = await listRoles();
  return <RolesDirectoryView initialRoles={roles} />;
}
