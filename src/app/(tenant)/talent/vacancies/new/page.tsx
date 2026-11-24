import type { Metadata } from "next";

import { NewVacancyView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Create Vacancy",
};

export default function Page() {
  return <NewVacancyView />;
}
