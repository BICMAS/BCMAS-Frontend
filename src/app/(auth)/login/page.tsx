import type { Metadata } from "next";

import { LoginForm } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function Page() {
  return <LoginForm />;
}
