import type { Metadata } from "next";

import {
  EmployeeDirectoryView,
  getEmployeeDirectoryMetrics,
  listEmployees,
} from "@/features/employees";

export const metadata: Metadata = {
  title: "Employee Directory",
};

export default async function EmployeesPage() {
  const [employees, metrics] = await Promise.all([
    listEmployees(),
    getEmployeeDirectoryMetrics(),
  ]);
  return (
    <EmployeeDirectoryView initialEmployees={employees} metrics={metrics} />
  );
}
