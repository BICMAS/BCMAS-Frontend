"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssessmentLibraryList } from "@/features/talent/components/library-picker";
import {
  getRecruitmentAssessment,
  recruitmentReportText,
  reviewRecruitmentAssessment,
  type RecruitmentAssessment,
  type RubricRow,
} from "@/features/talent/services/mock-recruitment";
import { useSessionStore } from "@/stores/session-store";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

const rubricColumns: DataTableColumn<RubricRow>[] = [
  { id: "skill", header: "Skill", accessorKey: "skill" },
  { id: "required", header: "Required level", accessorKey: "requiredLevel" },
  {
    id: "score",
    header: "Score",
    cell: (row) => (row.score == null ? "—" : String(row.score)),
  },
  {
    id: "readiness",
    header: "Readiness",
    cell: (row) =>
      row.readiness ? <Badge variant={readinessVariant[row.readiness]}>{row.readiness}</Badge> : "Not scored",
  },
];

export function RecruitmentDetailView({ assessmentId }: { assessmentId: string }) {
  const reviewer = useSessionStore((state) => state.user.name);
  const [record, setRecord] = useState(() => getRecruitmentAssessment(assessmentId));
  const [reviewing, setReviewing] = useState(false);

  if (!record) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This recruitment assessment is not on the current list.</p>
        <Link href="/talent/recruitment" className="text-sm font-bold text-navy">
          Back to recruitment
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title={record.candidateName}
        description={`${record.roleTitle} · deadline ${record.deadline} · ${record.durationMinutes} minutes`}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(record.reviewedBy) || reviewing}
              onClick={() => {
                setReviewing(true);
                void reviewRecruitmentAssessment(record.id, reviewer)
                  .then((next) => {
                    if (next) setRecord(next);
                    toast.success("Review recorded", { description: reviewer });
                  })
                  .finally(() => setReviewing(false));
              }}
            >
              {record.reviewedBy ? "Reviewed" : "Review"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                downloadReport(record);
                toast.success("Report downloaded");
              }}
            >
              Download report
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="info">{record.progress}</Badge>
        {record.readiness ? (
          <Badge variant={readinessVariant[record.readiness]}>{record.readiness}</Badge>
        ) : (
          <Badge variant="outline">Not scored</Badge>
        )}
        <Badge variant="secondary">{record.score == null ? "No score" : `${record.score}%`}</Badge>
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-navy">Rubric result</h2>
        <p className="text-xs text-slate-400">
          Scores use the fixed role rubric. A score at the required level is Ready, one level below is Near Ready,
          and anything lower is Not Ready.
        </p>
        <DataTable columns={rubricColumns} data={record.rubric} getRowId={(row) => row.skill} />
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Library items</h2>
        <p className="mt-1 text-xs text-slate-400">Selected from the shared library and bound to this role profile.</p>
        <AssessmentLibraryList ids={record.libraryItemIds} />
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Evidence</h2>
        {record.evidence.length ? (
          <ul className="mt-4 space-y-3">
            {record.evidence.map((item) => (
              <li key={item.id}>
                <p className="font-bold text-navy">{item.title}</p>
                <p className="text-sm text-slate-500">{item.note}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No evidence submitted yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Audit</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Created by</dt>
            <dd className="font-bold text-navy">{record.createdBy}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Reviewed by</dt>
            <dd className="font-bold text-navy">{record.reviewedBy ?? "—"}</dd>
          </div>
        </dl>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          {record.audit.map((item) => (
            <li key={item.id}>
              {item.action} by {item.actor} on {item.at}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function downloadReport(record: RecruitmentAssessment) {
  const blob = new Blob([recruitmentReportText(record)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${record.id}-recruitment-report.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
