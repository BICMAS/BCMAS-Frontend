import type { Metadata } from "next";

import { RecruitmentListView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Recruitment Assessments",
};

export default function Page() {
  return <RecruitmentListView />;
}
