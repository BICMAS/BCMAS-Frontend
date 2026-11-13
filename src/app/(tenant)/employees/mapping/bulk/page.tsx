import type { Metadata } from "next";

import {
  BulkMappingView,
  listBulkMappingRows,
  listMappingRoles,
} from "@/features/employees";

export const metadata: Metadata = {
  title: "Bulk Mapping",
};

export default async function BulkMappingPage() {
  const [rows, roles] = await Promise.all([
    listBulkMappingRows(),
    listMappingRoles(),
  ]);
  return <BulkMappingView initialRows={rows} roles={roles} />;
}
