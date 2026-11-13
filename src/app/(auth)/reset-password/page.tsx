import type { Metadata } from "next";

import { ResetPasswordForm } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Reset Password",
};

export default function Page() {
  return <ResetPasswordForm />;
}
