import type { Metadata } from "next";

import { TrainingPlanView } from "@/features/ld";

export const metadata: Metadata = {
  title: "Training Plan",
};

export default function Page() {
  return <TrainingPlanView />;
}
