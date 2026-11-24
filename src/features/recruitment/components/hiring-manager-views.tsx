"use client";

import { CheckCircle2Icon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { roleCompetencies } from "@/features/assessment-library/services/ai-builder";
import { cn } from "@/lib/utils";

import {
  approveVacancy,
  approvedRoleProfiles,
  getVacancy,
  latestApproval,
  returnVacancy,
  vacanciesForHiringManager,
  vacancyProblems,
} from "../services/vacancies";
import type { Vacancy } from "../types";
import {
  HiringManagerGate,
  VacancyStatusBadge,
  formatDate,
  formatDateTime,
  runAction,
  useRecruitmentRevision,
} from "./recruitment-shared";

export function VacancyApprovalsView() {
  return <HiringManagerGate>{(ctx) => <ApprovalsList {...ctx} />}</HiringManagerGate>;
}

function ApprovalsList({ organisationId, userId }: { organisationId: string; userId: string }) {
  const router = useRouter();
  const revision = useRecruitmentRevision();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const all = useMemo(() => {
    void revision;
    return vacanciesForHiringManager(organisationId, userId);
  }, [organisationId, userId, revision]);
  const rows = tab === "pending" ? all.filter((v) => v.status === "pending_approval") : all;

  const columns: DataTableColumn<Vacancy>[] = [
    { id: "title", header: "Vacancy", cell: (row) => <span className="font-bold text-navy">{row.title}</span> },
    { id: "department", header: "Department", accessorKey: "department" },
    {
      id: "thresholds",
      header: "Proposed thresholds",
      cell: (row) =>
        [
          row.stages.assessment.enabled ? `Assessment ${row.stages.assessment.threshold ?? "—"}%` : null,
          row.stages.interview.enabled ? `Interview ${row.stages.interview.threshold ?? "—"}%` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "CV review only",
    },
    { id: "owner", header: "Requested by", accessorKey: "owner" },
    { id: "status", header: "Status", cell: (row) => <VacancyStatusBadge status={row.status} /> },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Vacancy Approvals"
        description="As Hiring Manager, approve the pass thresholds and assessment for your vacancies before HR publishes them."
      />
      <div role="tablist" aria-label="Approval view" className="mb-4 flex gap-2">
        {(
          [
            ["pending", `Waiting for me (${all.filter((v) => v.status === "pending_approval").length})`],
            ["all", "All my vacancies"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-bold",
              tab === id ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy hover:bg-slate-50",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/manager/vacancies/${row.id}`)}
        emptyMessage={tab === "pending" ? "Nothing is waiting for your approval." : "You are not Hiring Manager for any vacancy."}
      />
    </div>
  );
}

export function VacancyApprovalView({ vacancyId }: { vacancyId: string }) {
  return <HiringManagerGate>{(ctx) => <ApprovalDetail vacancyId={vacancyId} {...ctx} />}</HiringManagerGate>;
}

function ApprovalDetail({
  vacancyId,
  organisationId,
  userId,
  actor,
}: {
  vacancyId: string;
  organisationId: string;
  userId: string;
  actor: string;
}) {
  const router = useRouter();
  const revision = useRecruitmentRevision();
  const vacancy = useMemo(() => {
    void revision;
    return getVacancy(organisationId, vacancyId);
  }, [organisationId, vacancyId, revision]);
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");

  if (!vacancy || vacancy.hiringManager?.userId !== userId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">You are not the Hiring Manager for this vacancy.</p>
        <Link href="/manager/vacancies" className="text-sm font-bold text-navy hover:underline">
          ← Vacancy Approvals
        </Link>
      </div>
    );
  }

  const me = { userId, name: actor };
  const role = approvedRoleProfiles().find((r) => r.id === vacancy.roleId);
  const problems = vacancyProblems(vacancy);
  const approval = latestApproval(vacancy);
  const pending = vacancy.status === "pending_approval";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/manager/vacancies" className="text-xs font-bold text-slate-500 hover:underline">
        ← Vacancy Approvals
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">{vacancy.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {vacancy.department} · {vacancy.location} · {vacancy.openings} opening{vacancy.openings === 1 ? "" : "s"} · closes{" "}
          {formatDate(vacancy.closingDate)} · requested by {vacancy.owner}
        </p>
        <div className="mt-2">
          <VacancyStatusBadge status={vacancy.status} />
        </div>
      </div>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">What you are approving</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <dt className="text-slate-500">Role profile</dt>
          <dd className="font-semibold text-navy">{vacancy.roleTitle ?? "—"}</dd>
          <dt className="text-slate-500">Role requirements</dt>
          <dd className="text-navy">{role ? roleCompetencies(role).map((c) => c.name).join(", ") : "—"}</dd>
          <dt className="text-slate-500">CV analysis</dt>
          <dd className="text-navy">Evidence against the role profile, reviewed by people</dd>
          <dt className="text-slate-500">Role-based assessment</dt>
          <dd className="font-semibold text-navy">
            {vacancy.stages.assessment.enabled
              ? `${vacancy.assessment ? `${vacancy.assessment.name} v${vacancy.assessment.version}` : "Not assigned"} · pass at ${vacancy.stages.assessment.threshold ?? "—"}%`
              : "Not used"}
          </dd>
          <dt className="text-slate-500">AI-avatar interview</dt>
          <dd className="font-semibold text-navy">
            {vacancy.stages.interview.enabled
              ? `${vacancy.stages.interview.questionSet ? `${vacancy.stages.interview.questionSet.name} v${vacancy.stages.interview.questionSet.version}` : "No question set"} · pass at ${vacancy.stages.interview.threshold ?? "—"}%`
              : "Not used"}
          </dd>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Candidates at or above every threshold are qualified for your review. You still make the shortlist decision, and
          BCMS stores this approval with every candidate&apos;s result.
        </p>
      </section>

      {pending && problems.length ? (
        <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          <p className="font-bold">This vacancy cannot be approved yet</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {approval && !pending ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">
          You approved snapshot v{approval.version} on {formatDateTime(approval.approvedAt)}.
          {approval.assessment !== null ? ` Assessment ${approval.assessment}%.` : ""}
          {approval.interview !== null ? ` Interview ${approval.interview}%.` : ""}
        </p>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="accent"
            disabled={problems.length > 0}
            onClick={() => {
              if (runAction(() => approveVacancy(organisationId, vacancy.id, me), "Thresholds approved. HR can now publish the vacancy.")) {
                router.push("/manager/vacancies");
              }
            }}
          >
            <CheckCircle2Icon aria-hidden />
            Approve
          </Button>
          <Button type="button" variant="secondary" onClick={() => setReturning(true)}>
            <Undo2Icon aria-hidden />
            Return for Changes
          </Button>
        </div>
      ) : (
        <Badge variant="secondary">No action needed</Badge>
      )}

      <Dialog open={returning} onOpenChange={setReturning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return for changes</DialogTitle>
            <DialogDescription>The vacancy goes back to HR as a draft with your comment.</DialogDescription>
          </DialogHeader>
          <label className="text-xs font-bold text-navy">
            What needs to change?
            <Textarea className="mt-1 font-normal" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setReturning(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!comment.trim()}
              onClick={() => {
                if (runAction(() => returnVacancy(organisationId, vacancy.id, me, comment), "Returned to HR with your comment.")) {
                  setReturning(false);
                  router.push("/manager/vacancies");
                }
              }}
            >
              Return to HR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
