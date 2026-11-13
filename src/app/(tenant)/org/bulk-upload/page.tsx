import type { Metadata } from "next";

import { BulkUploadView, getOrgUploads } from "@/features/organisation";

export const metadata: Metadata = {
  title: "Bulk Upload",
};

export default async function BulkUploadPage() {
  const uploads = await getOrgUploads();
  return <BulkUploadView initialUploads={uploads} />;
}
