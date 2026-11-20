import type { Metadata } from "next";

import { AboutBcmsView } from "@/features/organisation";

export const metadata: Metadata = {
  title: "About BCMS",
};

export default function Page() {
  return <AboutBcmsView />;
}
