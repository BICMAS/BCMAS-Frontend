import type { Metadata } from "next";

import { EmployeeHomeView } from "@/features/me";

export const metadata: Metadata = {
  title: "Employee Home",
};

export default function EmployeeHomePage() {
  return <EmployeeHomeView />;
}
