"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranchIcon, UserCogIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { resolveMappingException } from "@/features/employees/services/mock-mapping";
import type {
  MappingException,
  MappingExceptionMetrics,
  MappingExceptionType,
} from "@/features/employees/types";
import { useListQuery } from "@/hooks/use-list-query";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<MappingExceptionType, string> = {
  role_mismatch: "Role Mismatch",
  outdated_version: "Outdated Version",
  custom_override: "Custom Override",
};

type MappingExceptionsViewProps = {
  initialRows: MappingException[];
  initialMetrics: MappingExceptionMetrics;
};

export function MappingExceptionsView({
  initialRows,
  initialMetrics,
}: MappingExceptionsViewProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const list = useListQuery({
    data: rows,
    searchKeys: ["name", "employeeCode", "departmentName", "assignedProfile"],
    initialSort: { id: "name", direction: "asc" },
    filterFn: (row, filters) => {
      if (filters.type && filters.type !== "all") {
        return row.type === filters.type;
      }
      return true;
    },
    getSortValue: (row, id) => {
      if (id === "name") return row.name;
      if (id === "departmentName") return row.departmentName;
      if (id === "type") return row.type;
      return null;
    },
  });

  const columns = useMemo<DataTableColumn<MappingException>[]>(
    () => [
      {
        id: "name",
        header: "Employee",
        sortable: true,
        cell: (row) => (
          <div>
            <p className="font-bold text-navy">{row.name}</p>
            <p className="text-[10px] text-slate-400">{row.employeeCode}</p>
          </div>
        ),
      },
      {
        id: "departmentName",
        header: "Department",
        sortable: true,
        cell: (row) => (
          <span className="font-medium text-slate-600">{row.departmentName}</span>
        ),
      },
      {
        id: "type",
        header: "Exception Type",
        sortable: true,
        cell: (row) => (
          <Badge
            variant={
              row.type === "role_mismatch"
                ? "error"
                : row.type === "outdated_version"
                  ? "warning"
                  : "info"
            }
            className="rounded uppercase"
          >
            {TYPE_LABELS[row.type]}
          </Badge>
        ),
      },
      {
        id: "assignedProfile",
        header: "Assigned Profile",
        cell: (row) => (
          <div>
            <p
              className={cn(
                "text-xs",
                row.type === "role_mismatch"
                  ? "text-slate-500 italic"
                  : "font-bold text-navy",
              )}
            >
              {row.assignedProfile}
            </p>
            {row.currentVersion ? (
              <p className="text-[10px] text-slate-400">
                Current: {row.currentVersion}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "resolution",
        header: "Resolution",
        headerClassName: "text-right",
        className: "text-right",
        cell: (row) => (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 text-xs font-bold"
            disabled={pendingId === row.id}
            onClick={async (event) => {
              event.stopPropagation();
              if (row.type !== "outdated_version") {
                router.push(`/employees/mapping?employee=${row.employeeId}`);
                return;
              }
              setPendingId(row.id);
              try {
                const resolved = await resolveMappingException(row.id);
                if (!resolved) {
                  toast.error("Could not update this exception");
                  return;
                }
                setRows((current) => current.filter((item) => item.id !== row.id));
                setMetrics((current) => ({
                  ...current,
                  [resolved.type]: Math.max(0, current[resolved.type] - 1),
                }));
                toast.success(`${resolved.name} updated to ${resolved.currentVersion}`);
              } finally {
                setPendingId(null);
              }
            }}
          >
            {row.resolutionLabel}
          </Button>
        ),
      },
    ],
    [pendingId, router],
  );

  const cards: Array<{
    type: MappingExceptionType | "all";
    label: string;
    hint: string;
    value: number;
    icon: typeof UserXIcon;
    accent: string;
  }> = [
    {
      type: "role_mismatch",
      label: "Role Mismatch",
      hint: "Role not found in Dept library",
      value: metrics.role_mismatch,
      icon: UserXIcon,
      accent: "border-l-red-500",
    },
    {
      type: "outdated_version",
      label: "Profile Version Conflict",
      hint: "Assigned to archived versions",
      value: metrics.outdated_version,
      icon: GitBranchIcon,
      accent: "border-l-amber-500",
    },
    {
      type: "custom_override",
      label: "Custom Overrides",
      hint: "Manual profile adjustments",
      value: metrics.custom_override,
      icon: UserCogIcon,
      accent: "border-l-blue-500",
    },
  ];

  const downloadReport = () => {
    const header = "Employee,Code,Department,Exception,Assigned Profile";
    const body = list.items
      .map((row) =>
        [row.name, row.employeeCode, row.departmentName, TYPE_LABELS[row.type], row.assignedProfile]
          .map((value) => `"${value.replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mapping-exceptions.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Exception report downloaded");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapping Exceptions & Dept Alignment"
        description="Identify employees whose roles do not align with department standards or who require custom skill profile overrides."
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/employees">Employee Hub</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Mapping Exceptions</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const active = (list.filters.type ?? "all") === card.type;
          return (
            <button
              key={card.type}
              type="button"
              onClick={() =>
                list.setFilter("type", active ? "all" : card.type)
              }
              className={cn(
                "rounded-xl border border-border-slate border-l-4 bg-white p-6 text-left shadow-sm",
                card.accent,
                active && "ring-2 ring-navy",
              )}
            >
              <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                {card.label}
              </p>
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-navy">{card.value}</h3>
                <Icon className="size-7 text-slate-200" aria-hidden />
              </div>
              <p className="mt-2 text-[10px] text-slate-400">{card.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border-slate bg-slate-50/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold tracking-wider text-navy uppercase">
            Active Alignment Exceptions
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SearchField
              placeholder="Search exceptions…"
              value={list.search}
              onChange={(event) => list.setSearch(event.target.value)}
            />
            <Button type="button" variant="secondary" size="sm" onClick={downloadReport}>
              Download Report
            </Button>
          </div>
        </div>
        <DataTable
          columns={columns}
          data={list.items}
          sort={list.sort}
          onSortChange={list.toggleSort}
          onRowClick={(row) =>
            router.push(`/employees/mapping?employee=${row.employeeId}`)
          }
          pageIndex={list.pageIndex}
          pageCount={list.pageCount}
          onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
          onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
          emptyMessage="No active exceptions in this category."
          className="rounded-none border-0 shadow-none"
        />
      </div>
    </div>
  );
}
