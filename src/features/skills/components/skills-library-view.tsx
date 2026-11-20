"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CopyIcon, PenIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { OrgMetricCard } from "@/features/organisation/components/org-metric-card";
import type { OrgMetric } from "@/features/organisation/types";
import { duplicateSkill } from "@/features/skills/services/mock-skills";
import type { SkillRecord } from "@/features/skills/types";
import { useListQuery } from "@/hooks/use-list-query";
import { SKILL_CATEGORY_LABELS } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

type SkillsLibraryViewProps = {
  initialSkills: SkillRecord[];
};

const categoryVariant = {
  technical: "info",
  behavioural: "accent",
  knowledge: "secondary",
} as const;

export function SkillsLibraryView({ initialSkills }: SkillsLibraryViewProps) {
  const router = useRouter();
  const [skills, setSkills] = useState(initialSkills);
  const [category, setCategory] = useState<"all" | SkillRecord["category"]>(
    "all",
  );

  const list = useListQuery({
    data: skills,
    searchKeys: ["name", "description"],
    initialSort: { id: "name", direction: "asc" },
    filterFn: (row, filters) => {
      if (category !== "all" && row.category !== category) return false;
      if (filters.status && filters.status !== "all") {
        if (row.status !== filters.status) return false;
      }
      return true;
    },
    getSortValue: (row, id) => {
      if (id === "roleUsage") return row.roleUsage;
      if (id === "requiredLevels") return row.requiredLevels?.max ?? 0;
      if (id === "employeesRequiring") return row.employeesRequiring;
      if (id === "name") return row.name;
      return null;
    },
  });

  const summary = useMemo<{ metric: OrgMetric; status: string }[]>(() => {
    const count = (status: SkillRecord["status"]) => String(skills.filter((s) => s.status === status).length);
    return [
      { metric: { id: "total", label: "Total Skills Identified", value: String(skills.length), icon: "badge" }, status: "all" },
      {
        metric: { id: "approved", label: "Approved Skills", value: count("published"), icon: "check", tone: "success" },
        status: "published",
      },
      {
        metric: { id: "awaiting", label: "Awaiting Review", value: count("awaiting_review"), icon: "clock", tone: "warning" },
        status: "awaiting_review",
      },
      { metric: { id: "draft", label: "Draft Skills", value: count("draft"), icon: "draft" }, status: "draft" },
    ];
  }, [skills]);

  const columns = useMemo<DataTableColumn<SkillRecord>[]>(
    () => [
      {
        id: "name",
        header: "Skill Name",
        sortable: true,
        cell: (row) => (
          <div>
            <Link
              href={`/skills/${row.id}`}
              className="font-bold text-navy hover:text-green-deep"
              onClick={(e) => e.stopPropagation()}
            >
              {row.name}
            </Link>
            <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
              {row.description}
            </p>
          </div>
        ),
      },
      {
        id: "category",
        header: "Category",
        cell: (row) => (
          <Badge
            variant={categoryVariant[row.category]}
            className="rounded uppercase"
          >
            {SKILL_CATEGORY_LABELS[row.category]}
          </Badge>
        ),
      },
      {
        id: "requiredLevels",
        header: "Proficiency Level",
        sortable: true,
        cell: (row) =>
          row.requiredLevels ? (
            <span
              className="font-medium"
              title={`Roles require level ${row.requiredLevels.min} to level ${row.requiredLevels.max}`}
            >
              {row.requiredLevels.min === row.requiredLevels.max
                ? `Level ${row.requiredLevels.min}`
                : `Level ${row.requiredLevels.min}–${row.requiredLevels.max}`}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Not set</span>
          ),
      },
      {
        id: "roleUsage",
        header: "Role Usage",
        sortable: true,
        cell: (row) => (
          <span className="text-xs font-bold">{row.roleUsage} Roles</span>
        ),
      },
      {
        id: "employeesRequiring",
        header: "Employees Requiring",
        sortable: true,
        cell: (row) => <span className="text-xs font-bold">{row.employeesRequiring.toLocaleString("en-GB")}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge
            variant={
              row.status === "published"
                ? "success"
                : row.status === "awaiting_review"
                  ? "info"
                  : "secondary"
            }
            className="rounded uppercase"
          >
            {row.status.replace("_", " ")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        headerClassName: "text-right",
        className: "text-right",
        cell: (row) => (
          <div
            className="flex justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${row.name}`}
              onClick={() => router.push(`/skills/${row.id}`)}
            >
              <PenIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Duplicate ${row.name}`}
              onClick={async () => {
                const copy = await duplicateSkill(row.id);
                if (copy) {
                  setSkills((prev) => [copy, ...prev]);
                  toast.success(`Duplicated “${row.name}”`);
                }
              }}
            >
              <CopyIcon className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    [router],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Skills Library"
        description={
          <>
            <span className="block">
              Explore and manage the skills and competencies identified by BCMS as essential for effective
              performance across your organisation.
            </span>
            <span className="mt-1 block text-sm">
              AI-generated recommendations should be reviewed and validated before becoming part of the
              organisation&apos;s approved skills framework.
            </span>
          </>
        }
        actions={
          <>
            <Link
              href="/skills/framework"
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              Framework settings
            </Link>
            <Button
              type="button"
              onClick={() =>
                toast.message("Create skill", {
                  description:
                    "Open any skill and use Duplicate, or add via framework governance later.",
                })
              }
            >
              <PlusIcon className="size-4" aria-hidden />
              New Skill
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ metric, status }) => {
          const current = list.filters.status ?? "all";
          return (
            <OrgMetricCard
              key={metric.id}
              metric={metric}
              active={current === status}
              onClick={() => {
                setCategory("all");
                list.setFilter("status", current === status && status !== "all" ? "all" : status);
              }}
            />
          );
        })}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-bold text-amber-900">
            Potential Duplicates Detected
          </h4>
          <p className="mt-1 text-xs text-amber-700">
            BCMS has identified 3 skills that may overlap with existing
            skills in your library. Review and resolve these suggestions to
            maintain a consistent and accurate skills framework.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="bg-amber-600 text-white hover:bg-amber-700"
          onClick={() => {
            list.setSearch("Cloud");
            toast.message("Filtered to likely overlaps");
          }}
        >
          Review Now
        </Button>
      </div>

      <FilterBar
        search={
          <SearchField
            placeholder="Search skills…"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
          />
        }
        filters={
          <>
            <div className="flex rounded-lg border border-border-slate bg-white p-1">
              {(
                [
                  ["all", "All"],
                  ["technical", "Technical"],
                  ["behavioural", "Behavioural"],
                  ["knowledge", "Knowledge"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "rounded-md px-4 py-1.5 text-xs font-bold transition-all",
                    category === value
                      ? "bg-navy text-white"
                      : "text-slate-500 hover:bg-slate-100",
                  )}
                  onClick={() => {
                    setCategory(value);
                    list.setPageIndex(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className="h-10 rounded-lg border border-border-slate bg-white px-4 text-xs font-bold text-navy outline-none"
              value={list.filters.status ?? "all"}
              onChange={(e) => list.setFilter("status", e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="awaiting_review">Review Pending</option>
            </select>
          </>
        }
      />

      <DataTable
        columns={columns}
        data={list.items}
        sort={list.sort}
        onSortChange={list.toggleSort}
        onRowClick={(row) => router.push(`/skills/${row.id}`)}
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
        onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
        totalLabel={`${list.total} skills · page ${list.pageIndex + 1} of ${list.pageCount}`}
      />
    </div>
  );
}
