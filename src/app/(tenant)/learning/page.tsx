import type { Metadata } from "next";

import { LearningCatalogueView } from "@/features/ld";

export const metadata: Metadata = {
  title: "Learning Catalogue",
};

export default function Page() {
  return <LearningCatalogueView />;
}
