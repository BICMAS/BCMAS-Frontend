import type { Metadata } from "next";

import { MfaForm } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Two-Factor Authentication",
};

export default function Page() {
  return <MfaForm />;
}
