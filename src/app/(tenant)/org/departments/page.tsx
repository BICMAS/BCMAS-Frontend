import type { Metadata } from "next";

import {
  DepartmentsWorkspace,
  getDepartments,
} from "@/features/organisation";

export const metadata: Metadata = {
  title: "Departments",
};

type PageProps = {
  searchParams: Promise<{ action?: string }>;
};

export default async function DepartmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const departments = await getDepartments();

  return (
    <DepartmentsWorkspace
      initialDepartments={departments}
      openCreateOnMount={params.action === "new"}
    />
  );
}
