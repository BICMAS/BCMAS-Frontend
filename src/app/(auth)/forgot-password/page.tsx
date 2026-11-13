import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Forgot Password",
};

export default function Page() {
  return <ForgotPasswordForm />;
}
