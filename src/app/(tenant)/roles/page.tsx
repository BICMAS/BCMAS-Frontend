import type { Metadata } from "next";

import { listRoles, RolesDirectoryView } from "@/features/roles";

export const metadata: Metadata = {
  title: "Roles Directory",
};

const ROLE_STATUSES = [
  "draft",
  "awaiting_review",
  "approved",
  "approved,published",
  "changes_requested",
  "published",
];

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status } = await searchParams;
  const initialStatus =
    typeof status === "string" && ROLE_STATUSES.includes(status)
      ? status
      : undefined;

  const roles = await listRoles();
  return <RolesDirectoryView initialRoles={roles} initialStatus={initialStatus} />;
}
