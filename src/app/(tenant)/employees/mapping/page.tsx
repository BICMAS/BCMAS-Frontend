import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import {
  listEmployees,
  listMappingRoles,
  listMappingWorkspaces,
  MappingWorkspaceView,
} from "@/features/employees";

export const metadata: Metadata = {
  title: "Mapping Workspace",
};

export default async function MappingWorkspacePage() {
  const [employees, roles, workspaces] = await Promise.all([
    listEmployees(),
    listMappingRoles(),
    listMappingWorkspaces(),
  ]);

  return (
    <Suspense fallback={<LoadingSkeleton rows={3} />}>
      <MappingWorkspaceView
        employees={employees}
        roles={roles}
        workspaces={workspaces}
      />
    </Suspense>
  );
}
