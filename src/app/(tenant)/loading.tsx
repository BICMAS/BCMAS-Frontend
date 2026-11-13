import { LoadingSkeleton } from "@/components/shared/loading-skeleton";

/** Shown while a tenant page is still streaming. */
export default function TenantLoading() {
  return (
    <div className="space-y-6">
      <LoadingSkeleton rows={2} />
      <LoadingSkeleton variant="table" rows={5} />
    </div>
  );
}
