"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  listPromotionAssessments,
  type PromotionAssessment,
} from "@/features/talent/services/mock-promotion";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { cn } from "@/lib/utils";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

export function PromotionListView() {
  const router = useRouter();
  const user = useHydratedUser();
  const [rows] = useState(() => listPromotionAssessments());
  const columns = useMemo<DataTableColumn<PromotionAssessment>[]>(
    () => [
      {
        id: "employee",
        header: "Employee",
        cell: (row) => <span className="font-bold text-navy">{row.employeeName}</span>,
      },
      { id: "role", header: "Prospective role", accessorKey: "roleTitle" },
      { id: "status", header: "Status", cell: (row) => <Badge variant="info">{row.status}</Badge> },
      {
        id: "readiness",
        header: "Readiness",
        cell: (row) =>
          row.readiness ? (
            <Badge variant={readinessVariant[row.readiness]}>{row.readiness}</Badge>
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  if (!user) return null;
  if (user.portal === "employee" || user.portal === "line_manager") {
    return (
      <p className="text-sm text-slate-500">
        Promotion administration is for HR / L&D. Open your own assignment from Promotion in the employee menu,
        or Promotion Review in the manager menu.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Promotion Assessments"
        description="Assign an existing employee to a prospective approved role profile."
        actions={
          <Link href="/talent/promotion/new" className={cn(buttonVariants())}>
            Create Assessment
          </Link>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => router.push(`/talent/promotion/${row.id}`)}
      />
    </div>
  );
}
