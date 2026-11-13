import type { Metadata } from "next";

import {
  listMappingExceptions,
  MappingExceptionsView,
} from "@/features/employees";

export const metadata: Metadata = {
  title: "Mapping Exceptions",
};

export default async function MappingExceptionsPage() {
  const { rows, metrics } = await listMappingExceptions();
  return (
    <MappingExceptionsView initialRows={rows} initialMetrics={metrics} />
  );
}
