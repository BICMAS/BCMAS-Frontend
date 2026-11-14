"use client";

import Link from "next/link";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { AssessmentLibraryList } from "@/features/talent/components/library-picker";
import {
  getPromotionAssessment,
  isDirectReport,
  type PromotionRubricRow,
} from "@/features/talent/services/mock-promotion";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

const rubricColumns: DataTableColumn<PromotionRubricRow>[] = [
  { id: "skill", header: "Skill", accessorKey: "skill" },
  { id: "required", header: "Required level", accessorKey: "requiredLevel" },
  { id: "score", header: "Score", cell: (row) => (row.score == null ? "—" : String(row.score)) },
  {
    id: "readiness",
    header: "Readiness",
    cell: (row) =>
      row.readiness ? <Badge variant={readinessVariant[row.readiness]}>{row.readiness}</Badge> : "Not scored",
  },
];

export function PromotionReportView({ assessmentId }: { assessmentId: string }) {
  const user = useHydratedUser();
  if (!user) return null;
  const record = getPromotionAssessment(assessmentId);
  if (!record) {
    return <p className="text-sm text-slate-500">This promotion assessment is not on the current list.</p>;
  }

  const allowed =
    user.portal === "employee"
      ? record.employeeUserId === user.id
      : user.portal === "line_manager"
        ? isDirectReport(record.employeeId)
        : true;

  if (!allowed) {
    return (
      <p className="text-sm text-slate-500">
        {user.portal === "employee"
          ? "You can only open your own promotion assignment."
          : "Managers only see promotion assessments for direct reports."}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title={record.employeeName}
        description={`${record.currentRole} → ${record.roleTitle}`}
      />
      <div className="flex flex-wrap gap-2">
        <Badge variant="info">{record.status}</Badge>
        {record.readiness ? (
          <Badge variant={readinessVariant[record.readiness]}>{record.readiness}</Badge>
        ) : (
          <Badge variant="outline">Not scored</Badge>
        )}
        <Badge variant="secondary">{record.score == null ? "No score" : `${record.score}%`}</Badge>
      </div>
      <section className="space-y-3">
        <h2 className="font-bold text-navy">Rubric result</h2>
        <DataTable columns={rubricColumns} data={record.rubric} getRowId={(row) => row.skill} />
      </section>
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Library items</h2>
        <AssessmentLibraryList ids={record.libraryItemIds} />
      </section>
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Manager review</h2>
        {record.managerDecision ? (
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Decision</dt>
              <dd className="font-bold text-navy">{record.managerDecision}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Reviewed by</dt>
              <dd className="font-bold text-navy">{record.reviewedBy}</dd>
            </div>
            <p className="pt-2 text-slate-600">{record.managerComment}</p>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No manager review yet.</p>
        )}
        {user.portal === "line_manager" ? (
          <Link href="/manager/promotion" className="mt-4 inline-block text-sm font-bold text-navy">
            Back to promotion review
          </Link>
        ) : null}
      </section>
    </div>
  );
}
