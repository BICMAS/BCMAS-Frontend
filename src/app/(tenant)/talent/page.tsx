import type { Metadata } from "next";

import { TalentOverviewView } from "@/features/talent";

export const metadata: Metadata = {
  title: "Talent Assessment",
};

export default function Page() {
  return <TalentOverviewView />;
}
