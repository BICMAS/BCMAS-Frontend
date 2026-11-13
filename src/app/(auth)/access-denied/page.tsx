import type { Metadata } from "next";

import { AccessDeniedView } from "@/features/authentication";

export const metadata: Metadata = {
  title: "Access Denied",
};

export default function Page() {
  return <AccessDeniedView />;
}
