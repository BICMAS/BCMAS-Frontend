import { Badge } from "@/components/ui/badge";
import {
  PROFILE_STATUS_LABELS,
  type ProfileLifecycleStatus,
} from "@/lib/mock/types";

const variantMap: Record<
  ProfileLifecycleStatus,
  "success" | "info" | "secondary" | "warning" | "accent"
> = {
  published: "success",
  approved: "success",
  awaiting_review: "info",
  draft: "secondary",
  changes_requested: "warning",
};

export function RoleStatusBadge({ status }: { status: ProfileLifecycleStatus }) {
  return (
    <Badge variant={variantMap[status]} className="rounded uppercase">
      {PROFILE_STATUS_LABELS[status]}
    </Badge>
  );
}
