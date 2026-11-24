import type { Metadata } from "next";

import { VacancyListView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Vacancy Management",
};

export default function Page() {
  return <VacancyListView />;
}
