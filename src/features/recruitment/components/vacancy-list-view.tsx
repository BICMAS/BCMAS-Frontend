"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { applicantCount, listVacancies, vacancyCounts } from "../services/vacancies";
import type { Vacancy, VacancyStatus } from "../types";
import { HrbpGate, VacancyStatusBadge, formatDate, useRecruitmentRevision } from "./recruitment-shared";

type Tab = "all" | VacancyStatus;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "pending_approval", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "published", label: "Published" },
  { id: "paused", label: "Paused" },
  { id: "closed", label: "Closed" },
];

export function VacancyListView() {
  return <HrbpGate>{(ctx) => <VacancyList organisationId={ctx.organisationId} />}</HrbpGate>;
}

type Row = Vacancy & { applicants: number };

function VacancyList({ organisationId }: { organisationId: string }) {
  const router = useRouter();
  const revision = useRecruitmentRevision();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const { rows, counts } = useMemo(() => {
    void revision;
    return {
      rows: listVacancies(organisationId).map((v) => ({ ...v, applicants: applicantCount(v.id) })),
      counts: vacancyCounts(organisationId),
    };
  }, [organisationId, revision]);

  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (v) => (tab === "all" || v.status === tab) && (!q || `${v.title} ${v.department} ${v.location}`.toLowerCase().includes(q)),
  );

  const columns: DataTableColumn<Row>[] = [
    {
      id: "title",
      header: "Vacancy",
      cell: (row) => (
        <div>
          <p className="font-bold text-navy">{row.title}</p>
          <p className="text-[10px] text-slate-400">
            {row.location} · {row.employmentType} · {row.openings} opening{row.openings === 1 ? "" : "s"}
          </p>
        </div>
      ),
    },
    { id: "department", header: "Department", accessorKey: "department" },
    { id: "applicants", header: "Applicants", cell: (row) => <span className="font-bold text-navy">{row.applicants}</span> },
    { id: "status", header: "Status", cell: (row) => <VacancyStatusBadge status={row.status} /> },
    { id: "owner", header: "Owner", accessorKey: "owner" },
    { id: "closing", header: "Closing date", cell: (row) => formatDate(row.closingDate) },
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-3 text-[10px] font-bold tracking-wide uppercase">
          <Link href={`/talent/vacancies/${row.id}`} className="text-navy" onClick={(e) => e.stopPropagation()}>
            View
          </Link>
          {row.status === "draft" || row.status === "pending_approval" || row.status === "approved" ? (
            <Link href={`/talent/vacancies/${row.id}?edit=1`} className="text-navy" onClick={(e) => e.stopPropagation()}>
              Edit
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Vacancy Management"
        description="Create vacancies, set the role profile, assessment and pass thresholds, get Hiring Manager approval and publish a public application link."
        actions={
          <Link href="/talent/vacancies/new" className={cn(buttonVariants(), "gap-2")}>
            <PlusIcon className="size-3.5" aria-hidden />
            Create Vacancy
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Open vacancies", counts.open],
          ["Pending approval", counts.pendingApproval],
          ["Applications today", counts.applicationsToday],
          ["Closing within 7 days", counts.closingSoon],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Vacancy status" className="mb-4 flex flex-wrap gap-2">
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

      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vacancies…"
          className="pl-9"
          aria-label="Search vacancies"
        />
      </div>

      <DataTable
        columns={columns}
        data={shown}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/talent/vacancies/${row.id}`)}
        emptyMessage="No vacancies here yet."
      />
    </div>
  );
}
