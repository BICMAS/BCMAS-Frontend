"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  listRecruitmentAssessments,
  recruitmentRows,
  recruitmentSnapshot,
  subscribeRecruitment,
  type RecruitmentAssessment,
  type RecruitmentProgress,
} from "@/features/talent/services/mock-recruitment";
import type { Readiness } from "@/features/talent/services/mock-talent";
import { cn } from "@/lib/utils";

const progressVariant: Record<RecruitmentProgress, "info" | "warning" | "success" | "accent"> = {
  Invited: "info",
  "In progress": "warning",
  Completed: "success",
  "Awaiting review": "accent",
};

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const satisfies Record<Readiness, "success" | "warning" | "error">;

export function RecruitmentListView() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribeRecruitment, recruitmentSnapshot, () => "pending");
  const rows = useMemo(
    () => (snapshot && snapshot !== "pending" ? recruitmentRows(snapshot) : listRecruitmentAssessments()),
    [snapshot],
  );

  const columns = useMemo<DataTableColumn<RecruitmentAssessment>[]>(
    () => [
      {
        id: "candidate",
        header: "Candidate",
        cell: (row) => <span className="font-bold text-navy">{row.candidateName}</span>,
      },
      { id: "role", header: "Role", accessorKey: "roleTitle" },
      { id: "deadline", header: "Deadline", accessorKey: "deadline" },
      {
        id: "progress",
        header: "Progress",
        cell: (row) =>
          row.progress === "Awaiting review" ? (
            <span className="flex flex-wrap gap-1">
              <Badge variant="success">Completed</Badge>
              <Badge variant="accent">Awaiting review</Badge>
            </span>
          ) : (
            <Badge variant={progressVariant[row.progress]}>{row.progress}</Badge>
          ),
      },
      {
        id: "score",
        header: "Score",
        cell: (row) => (row.score == null ? "—" : `${row.score}%`),
      },
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

  if (snapshot === "pending") return null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Recruitment Assessments"
        description="Assess candidates against an approved role skills profile."
        actions={
          <Link href="/talent/recruitment/new" className={cn(buttonVariants())}>
            Create Assessment
          </Link>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        onRowClick={(row) => router.push(`/talent/recruitment/${row.id}`)}
      />
    </div>
  );
}
