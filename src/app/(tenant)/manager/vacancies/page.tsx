import type { Metadata } from "next";

import { VacancyApprovalsView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Vacancy Approvals",
};

export default function Page() {
  return <VacancyApprovalsView />;
}
