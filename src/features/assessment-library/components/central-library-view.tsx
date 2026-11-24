"use client";

import { EyeIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import { useListQuery } from "@/hooks/use-list-query";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/session-store";

import {
  createTemplate,
  currentVersion,
  getTemplate,
  libraryCounts,
  listTemplates,
  type TemplateSummary,
} from "../services/central-library";
import {
  ASSESSMENT_TYPES,
  ASSESSMENT_TYPE_LABEL,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  type TemplateStatus,
  type TemplateVersion,
} from "../types";
import { ROLE_FAMILIES, TemplateStatusBadge, VersionBadge, selectClass, useLibraryRevision } from "./library-shared";
import { PreviewDialog } from "./preview-compare-dialogs";
import { TemplateFormDialog } from "./template-form-dialog";

type StatusTab = "all" | TemplateStatus;

const TABS: Array<{ id: StatusTab; label: string }> = [
  { id: "all", label: "All Templates" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Drafts" },
  { id: "retired", label: "Retired" },
];

export function CentralLibraryView() {
  return (
    <PlatformGate>
      <CentralLibrary />
    </PlatformGate>
  );
}

function CentralLibrary() {
  const router = useRouter();
  const revision = useLibraryRevision();
  const actor = useSessionStore((state) => state.user.name);
  const templates = useMemo(() => {
    void revision;
    return listTemplates();
  }, [revision]);
  const counts = useMemo(() => {
    void revision;
    return libraryCounts();
  }, [revision]);
  const competencies = useMemo(() => [...new Set(templates.flatMap((t) => t.competencies))].sort(), [templates]);
  const [tab, setTab] = useState<StatusTab>("all");
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<TemplateVersion | null>(null);

  const list = useListQuery<TemplateSummary>({
    data: templates,
    searchKeys: ["name", "roleFamily", (row) => row.competencies.join(" ")],
    initialPageSize: 10,
    filterFn: (row, filters) => {
      if (tab === "draft" && !(row.status === "draft" || row.pending)) return false;
      if (tab !== "all" && tab !== "draft" && row.status !== tab) return false;
      if (filters.type && filters.type !== "all" && row.assessmentType !== filters.type) return false;
      if (filters.family && filters.family !== "all" && row.roleFamily !== filters.family) return false;
      if (filters.competency && filters.competency !== "all" && !row.competencies.includes(filters.competency)) return false;
      if (filters.difficulty && filters.difficulty !== "all" && !row.difficulties.includes(filters.difficulty)) return false;
      return true;
    },
  });

  const columns: DataTableColumn<TemplateSummary>[] = [
    {
      id: "name",
      header: "Template",
      cell: (row) => (
        <div>
          <p className="font-bold text-navy">{row.name}</p>
          <p className="text-[10px] text-slate-400">{row.competencies.join(" · ")}</p>
        </div>
      ),
    },
    { id: "type", header: "Assessment type", cell: (row) => ASSESSMENT_TYPE_LABEL[row.assessmentType] },
    { id: "family", header: "Role family", accessorKey: "roleFamily" },
    { id: "items", header: "Items", cell: (row) => <span className="font-bold text-navy">{row.itemCount}</span> },
    {
      id: "status",
      header: "Version / Status",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-navy">v{row.version}</span>
          <TemplateStatusBadge status={row.status} />
          {row.pending ? <VersionBadge status={row.pending.status} version={row.pending.version} /> : null}
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Preview ${row.name}`}
          onClick={(event) => {
            event.stopPropagation();
            const template = getTemplate(row.id);
            if (template) setPreview(currentVersion(template));
          }}
        >
          <EyeIcon aria-hidden />
          Preview
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Central Assessment Library"
        description="BICMAS administrators create and maintain reusable master templates. Organisations browse published masters read-only and work on their own copies."
        actions={
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden />
            Create Master
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Master templates", counts.all],
          ["Published", counts.published],
          ["Drafts", counts.draft],
          ["Retired", counts.retired],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Template status" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              list.setPageIndex(0);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-bold",
              tab === t.id ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy hover:bg-slate-50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border-slate bg-white p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
            placeholder="Search templates…"
            className="pl-9"
            aria-label="Search templates"
          />
        </div>
        <select
          className={selectClass}
          aria-label="Assessment type"
          value={list.filters.type ?? "all"}
          onChange={(e) => list.setFilter("type", e.target.value)}
        >
          <option value="all">Type: All</option>
          {ASSESSMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {ASSESSMENT_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          aria-label="Role family"
          value={list.filters.family ?? "all"}
          onChange={(e) => list.setFilter("family", e.target.value)}
        >
          <option value="all">Role family: All</option>
          {ROLE_FAMILIES.map((family) => (
            <option key={family}>{family}</option>
          ))}
        </select>
        <select
          className={selectClass}
          aria-label="Competency"
          value={list.filters.competency ?? "all"}
          onChange={(e) => list.setFilter("competency", e.target.value)}
        >
          <option value="all">Competency: All</option>
          {competencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          className={selectClass}
          aria-label="Difficulty"
          value={list.filters.difficulty ?? "all"}
          onChange={(e) => list.setFilter("difficulty", e.target.value)}
        >
          <option value="all">Difficulty: All</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/platform/assessment-library/${row.id}`)}
        emptyMessage="No templates match these filters."
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(Math.max(0, list.pageIndex - 1))}
        onNextPage={() => list.setPageIndex(Math.min(list.pageCount - 1, list.pageIndex + 1))}
        totalLabel={`${list.total} templates`}
      />
      <p className="mt-3 text-xs text-slate-400">
        <Badge variant="secondary">Note</Badge> These are BCMS-developed role-based assessments, not scientifically
        validated psychometric tests.
      </p>

      <TemplateFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create master template"
        submitLabel="Create draft"
        onSubmit={(settings) => {
          const id = createTemplate(settings, actor);
          setCreating(false);
          toast.success("Draft master created. Add questions, then submit it for review.");
          router.push(`/platform/assessment-library/${id}`);
        }}
      />
      <PreviewDialog version={preview} onOpenChange={(open) => !open && setPreview(null)} />
    </div>
  );
}
