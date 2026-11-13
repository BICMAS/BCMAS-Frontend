import type { Metadata } from "next";

import { ActivateAccountForm } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Activate Account",
};

export default function Page() {
  return <ActivateAccountForm />;
}
