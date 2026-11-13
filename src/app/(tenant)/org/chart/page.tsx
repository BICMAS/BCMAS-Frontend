import type { Metadata } from "next";

import { getOrgChart, OrgChartView } from "@/features/organisation";

export const metadata: Metadata = {
  title: "Org Chart",
};

export default async function OrgChartPage() {
  const root = await getOrgChart();
  return <OrgChartView root={root} />;
}
