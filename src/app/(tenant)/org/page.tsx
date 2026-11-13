import type { Metadata } from "next";

import { OrgOverviewView } from "@/features/organisation";

export const metadata: Metadata = {
  title: "Organisation Overview",
};

export default function OrganisationOverviewPage() {
  return <OrgOverviewView />;
}
