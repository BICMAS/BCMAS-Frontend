import { Badge } from "@/components/ui/badge";
import type { ProfileStatus } from "@/features/organisation/types";

const statusConfig: Record<
  ProfileStatus,
  { label: string; variant: "success" | "info" | "secondary" | "warning" }
> = {
  published: { label: "Published", variant: "success" },
  awaiting_review: { label: "Awaiting Review", variant: "info" },
  draft: { label: "Draft", variant: "secondary" },
  changes_requested: { label: "Changes Requested", variant: "warning" },
};

export function RoleStatusBadge({ status }: { status: ProfileStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className="rounded uppercase">
      {config.label}
    </Badge>
  );
}
