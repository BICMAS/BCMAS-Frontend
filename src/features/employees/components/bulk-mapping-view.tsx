"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "lucide-react";
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
import {
  assignSuggestedRoles,
  autoMapSuggestions,
  finaliseAllDrafts,
} from "@/features/employees/services/mock-mapping";
import type {
  BulkMappingRow,
  MappingRoleOption,
} from "@/features/employees/types";
import { useListQuery } from "@/hooks/use-list-query";

type BulkMappingViewProps = {
  initialRows: BulkMappingRow[];
  roles: MappingRoleOption[];
};

export function BulkMappingView({ initialRows, roles }: BulkMappingViewProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  const list = useListQuery({
    data: rows,
    searchKeys: ["name", "departmentName", "suggestedRoleTitle"],
    initialSort: { id: "confidence", direction: "desc" },
    filterFn: (row, filters) => {
      if (filters.status && filters.status !== "all") {
        return row.status === filters.status;
      }
      return true;
    },
    getSortValue: (row, id) => {
      if (id === "name") return row.name;
      if (id === "confidence") return row.confidence;
      if (id === "departmentName") return row.departmentName;
      return null;
    },
  });

  const averageConfidence = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length)
    : 0;

  const columns = useMemo<DataTableColumn<BulkMappingRow>[]>(
    () => [
      {
        id: "name",
        header: "Employee",
        sortable: true,
        cell: (row) => (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.avatarUrl} alt="" className="size-8 rounded-full" />
            <span className="font-bold text-navy">{row.name}</span>
          </div>
        ),
      },
      {
        id: "departmentName",
        header: "Department",
        sortable: true,
        cell: (row) => (
          <span className="text-slate-500">{row.departmentName}</span>
        ),
      },
      {
        id: "suggestedRoleTitle",
        header: "AI Suggested Role",
        cell: (row) => (
          <span className="inline-flex items-center gap-2 font-medium text-navy">
            {row.suggestedRoleTitle}
            <SparklesIcon className="size-3 text-green-lime" aria-hidden />
          </span>
        ),
      },
      {
        id: "confidence",
        header: "Confidence",
        sortable: true,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <div className="h-1 w-12 overflow-hidden rounded-full bg-slate-100">
              <div
                className={row.confidence >= 80 ? "h-full bg-green-lime" : "h-full bg-amber-400"}
                style={{ width: `${row.confidence}%` }}
              />
            </div>
            <span
              className={
                row.confidence >= 80
                  ? "text-[10px] font-bold text-green-deep"
                  : "text-[10px] font-bold text-amber-600"
              }
            >
              {row.confidence}%
            </span>
          </div>
        ),
      },
      {
        id: "status",
        header: "Mapping Status",
        headerClassName: "text-right",
        className: "text-right",
        cell: (row) => (
          <Badge
            variant={
              row.status === "aligned"
                ? "success"
                : row.status === "draft"
                  ? "warning"
                  : "secondary"
            }
            className="rounded uppercase"
          >
            {row.status}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Mapping Tool"
        description="Map multiple employees to roles at scale. AI will suggest the best fit based on previous assessments and CV data."
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/employees/mapping">Alignment Hub</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Bulk Mapping</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <>
            <Button
              type="button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  const count = await autoMapSuggestions();
                  setRows((current) =>
                    current.map((row) =>
                      row.status === "aligned" ? row : { ...row, status: "draft" },
                    ),
                  );
                  toast.success(`Auto-mapped ${count} suggestions`);
                } finally {
                  setPending(false);
                }
              }}
            >
              <SparklesIcon className="size-4 text-green-lime" aria-hidden />
              Auto-Map Suggestions
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  const count = await finaliseAllDrafts();
                  setRows((current) =>
                    current.map((row) =>
                      row.status === "draft" ? { ...row, status: "aligned" } : row,
                    ),
                  );
                  toast.success(
                    count
                      ? `Finalised ${count} draft mappings`
                      : "No draft mappings to finalise",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Finalise All
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 rounded-xl border border-border-slate bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-lg border border-border-slate bg-slate-50 px-3 py-1.5 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Selected: {selectedIds.length} Employees
          </div>
          <select
            className="h-9 rounded border border-border-slate bg-white px-3 text-xs font-bold text-navy"
            value={roleId}
            onChange={(event) => setRoleId(event.target.value)}
            aria-label="Assign role to selected"
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || selectedIds.length === 0}
            onClick={async () => {
              const role = roles.find((item) => item.id === roleId);
              if (!role) return;
              setPending(true);
              try {
                const count = await assignSuggestedRoles(
                  selectedIds,
                  role.id,
                  role.title,
                );
                setRows((current) =>
                  current.map((row) =>
                    selectedIds.includes(row.employeeId)
                      ? {
                          ...row,
                          suggestedRoleId: role.id,
                          suggestedRoleTitle: role.title,
                          status: "aligned",
                          confidence: Math.max(row.confidence, 90),
                        }
                      : row,
                  ),
                );
                setSelectedIds([]);
                toast.success(`Assigned ${role.title} to ${count} employees`);
              } finally {
                setPending(false);
              }
            }}
          >
            Assign to selected
          </Button>
          <SearchField
            placeholder="Search employees…"
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
          <select
            className="h-10 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy"
            value={list.filters.status ?? "all"}
            onChange={(event) => list.setFilter("status", event.target.value)}
            aria-label="Status filter"
          >
            <option value="all">Status: All</option>
            <option value="draft">Draft</option>
            <option value="unmapped">Unmapped</option>
            <option value="aligned">Aligned</option>
          </select>
        </div>
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          AI Confidence:{" "}
          <span className="text-green-deep">
            {averageConfidence >= 80 ? "High" : "Mixed"} ({averageConfidence}%)
          </span>
        </p>
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        sort={list.sort}
        onSortChange={list.toggleSort}
        onRowClick={(row) =>
          router.push(`/employees/mapping?employee=${row.employeeId}`)
        }
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
        onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
        totalLabel={`${list.total} suggestions`}
        emptyMessage="No mapping suggestions match these filters."
      />

      <p className="text-xs text-slate-500">
        Open an employee in the{" "}
        <Link href="/employees/mapping" className="font-bold text-navy underline">
          mapping workspace
        </Link>{" "}
        to review gaps before finalising.
      </p>
    </div>
  );
}
