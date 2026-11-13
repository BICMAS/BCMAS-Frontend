import type { Metadata } from "next";

import {
  EmployeeImportView,
  listEmployeeImports,
} from "@/features/employees";

export const metadata: Metadata = {
  title: "Bulk Employee Import",
};

export default async function EmployeeImportPage() {
  const imports = await listEmployeeImports();
  return <EmployeeImportView initialImports={imports} />;
}
