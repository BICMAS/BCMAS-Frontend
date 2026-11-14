import type { Metadata } from "next";

import { RecruitmentCreateView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Create Assessment",
};

export default function Page() {
  return <RecruitmentCreateView />;
}
