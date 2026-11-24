import type { Metadata } from "next";

import { RecruitmentOverviewView } from "@/features/recruitment";

export const metadata: Metadata = {
  title: "Talent Assessment",
};

export default function Page() {
  return <RecruitmentOverviewView />;
}
