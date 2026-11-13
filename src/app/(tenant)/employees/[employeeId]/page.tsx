import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmployeeProfileView, getEmployee } from "@/features/employees";

export const metadata: Metadata = {
  title: "Employee Profile",
};

type PageProps = {
  params: Promise<{ employeeId: string }>;
};

export default async function EmployeeProfilePage({ params }: PageProps) {
  const { employeeId } = await params;
  const employee = await getEmployee(employeeId);
  if (!employee) notFound();
  return <EmployeeProfileView employee={employee} />;
}
