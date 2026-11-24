"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { candidateCounts, cvSignal, listCandidates, type CandidateRow } from "../services/candidates";
import { attemptFor, assessmentSummary } from "../services/delivery";
import { interviewFor, interviewSummary } from "../services/interview";
import { listVacancies } from "../services/vacancies";
import { STAGE_LABEL, type ApplicationStage } from "../types";
import { HrbpGate, formatDateTime, useRecruitmentRevision } from "./recruitment-shared";

type Tab = "all" | "new" | "cv" | "assessment" | "avatar" | "qualified" | "not_progressed" | "human_review";

const TABS: Array<{ id: Tab; label: string; stages: ApplicationStage[] | null }> = [
  { id: "all", label: "All Candidates", stages: null },
  { id: "new", label: "New", stages: ["new_application"] },
  { id: "cv", label: "CV Analysis", stages: ["cv_analysis"] },
  { id: "assessment", label: "Assessment", stages: ["assessment_invited", "assessment_completed"] },
  { id: "avatar", label: "Avatar", stages: ["avatar_invited", "avatar_completed"] },
  { id: "qualified", label: "Qualified", stages: ["qualified"] },
  { id: "not_progressed", label: "Not Progressed", stages: ["not_progressed"] },
  { id: "human_review", label: "Human Review", stages: ["human_review"] },
];

const STAGE_VARIANT: Partial<Record<ApplicationStage, "success" | "warning" | "info" | "error" | "secondary">> = {
  qualified: "success",
  not_progressed: "error",
  human_review: "warning",
  new_application: "secondary",
};

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <Badge variant={STAGE_VARIANT[stage] ?? "info"}>{STAGE_LABEL[stage]}</Badge>;
}

export function CandidateListView() {
  return <HrbpGate>{(ctx) => <CandidateList organisationId={ctx.organisationId} />}</HrbpGate>;
}

function CandidateList({ organisationId }: { organisationId: string }) {
  const router = useRouter();
  const revision = useRecruitmentRevision();
  const [tab, setTab] = useState<Tab>("all");
  const [vacancyId, setVacancyId] = useState("all");
  const [search, setSearch] = useState("");
  const { rows, counts, vacancies } = useMemo(() => {
    void revision;
    return {
      rows: listCandidates(organisationId),
      counts: candidateCounts(organisationId),
      vacancies: listVacancies(organisationId).filter((v) => v.publicToken),
    };
  }, [organisationId, revision]);

  const stages = TABS.find((t) => t.id === tab)?.stages ?? null;
  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (c) =>
      (!stages || stages.includes(c.stage)) &&
      (vacancyId === "all" || c.vacancyId === vacancyId) &&
      (!q || `${c.fullName} ${c.email} ${c.reference}`.toLowerCase().includes(q)),
  );

  const columns: DataTableColumn<CandidateRow>[] = [
    {
      id: "name",
      header: "Candidate",
      cell: (row) => (
        <div>
          <p className="font-bold text-navy">{row.fullName}</p>
          <p className="text-[10px] text-slate-400">
            {row.email} · {row.reference}
          </p>
          {row.possibleDuplicateOf ? <Badge variant="warning">Possible duplicate</Badge> : null}
        </div>
      ),
    },
    { id: "vacancy", header: "Vacancy", accessorKey: "vacancyTitle" },
    {
      id: "cv",
      header: "CV evidence",
      cell: (row) => {
        const signal = cvSignal(row);
        return <Badge variant={signal.tone}>{signal.label}</Badge>;
      },
    },
    {
      id: "assessment",
      header: "Assessment",
      cell: (row) => <span className="text-xs font-semibold text-navy">{assessmentSummary(attemptFor(organisationId, row.id))}</span>,
    },
    {
      id: "interview",
      header: "Interview",
      cell: (row) => <span className="text-xs font-semibold text-navy">{interviewSummary(interviewFor(organisationId, row.id))}</span>,
    },
    { id: "stage", header: "Stage", cell: (row) => <StageBadge stage={row.stage} /> },
    { id: "applied", header: "Applied", cell: (row) => <span className="text-xs">{formatDateTime(row.submittedAt)}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Candidate Management"
        description="Receive and track external applicants. Open a candidate for their CV evidence, notes, history and next steps."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Applicants", counts.applicants],
          ["CV analysed", counts.cvAnalysed],
          ["Assessment completed", counts.assessmentCompleted],
          ["Qualified", counts.qualified],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Candidate stage" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-bold",
              tab === t.id ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy hover:bg-slate-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or reference…"
            className="pl-9"
            aria-label="Search candidates"
          />
        </div>
        <select
          aria-label="Vacancy"
          className="h-9 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy"
          value={vacancyId}
          onChange={(e) => setVacancyId(e.target.value)}
        >
          <option value="all">Vacancy: All</option>
          {vacancies.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={shown}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/talent/candidates/${row.id}`)}
        emptyMessage="No candidates here."
      />
      <p className="mt-3 text-xs text-slate-500">
        Candidate records and CVs are visible only to your organisation&apos;s recruitment team.
      </p>
    </div>
  );
}
