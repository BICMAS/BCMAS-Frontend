"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BadgeCheckIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  bulkAssignRole,
  bulkMarkAssessmentReady,
} from "@/features/employees/services/mock-employees";
import type {
  EmployeeDirectoryMetrics,
  EmployeeRecord,
} from "@/features/employees/types";
import { useListQuery } from "@/hooks/use-list-query";
import { cn } from "@/lib/utils";

type EmployeeDirectoryViewProps = {
  initialEmployees: EmployeeRecord[];
  metrics: EmployeeDirectoryMetrics;
};

export function EmployeeDirectoryView({
  initialEmployees,
  metrics,
}: EmployeeDirectoryViewProps) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initialEmployees);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const list = useListQuery({
    data: employees,
    searchKeys: [
      "name",
      "employeeCode",
      (row) => row.roleTitle ?? "",
      "departmentName",
    ],
    initialSort: { id: "name", direction: "asc" },
    filterFn: (row, filters) => {
      if (filters.department && filters.department !== "all") {
        if (row.departmentId !== filters.department) return false;
      }
      if (filters.mapping && filters.mapping !== "all") {
        if (row.mappingStatus !== filters.mapping) return false;
      }
      return true;
    },
    getSortValue: (row, id) => {
      if (id === "name") return row.name;
      if (id === "roleTitle") return row.roleTitle ?? "";
      return null;
    },
  });

  const columns = useMemo<DataTableColumn<EmployeeRecord>[]>(
    () => [
      {
        id: "name",
        header: "Employee Details",
        sortable: true,
        cell: (row) => (
          <div className="flex items-center gap-3">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.avatarUrl}
                alt=""
                className="size-10 rounded-full border border-border-slate"
              />
              <span
                className={cn(
                  "absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border-2 border-white",
                  row.assessmentReady ? "bg-green-lime text-navy" : "bg-blue-500 text-white",
                )}
              >
                {row.assessmentReady ? (
                  <BadgeCheckIcon className="size-2.5" />
                ) : null}
              </span>
            </div>
            <div>
              <p className="font-bold text-navy">{row.name}</p>
              <p className="text-[10px] font-medium text-slate-400">
                ID: {row.employeeCode} · {row.departmentName}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "roleTitle",
        header: "Assigned Role",
        sortable: true,
        cell: (row) =>
          row.roleTitle ? (
            <Link
              href={`/roles/${row.roleId}`}
              className="font-medium text-navy hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.roleTitle}
            </Link>
          ) : (
            <span className="text-slate-400">Unassigned</span>
          ),
      },
      {
        id: "profileVersion",
        header: "Approved Profile Version",
        cell: (row) =>
          row.profileVersion ? (
            <Badge variant="success" className="rounded uppercase">
              {row.profileVersion}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        id: "assessmentReady",
        header: "Ready for Assessment",
        headerClassName: "text-center",
        className: "text-center",
        cell: (row) =>
          row.assessmentReady ? (
            <span className="inline-flex size-8 items-center justify-center rounded-full border border-green-100 bg-green-50 text-green-deep">
              <BadgeCheckIcon className="size-3.5" />
            </span>
          ) : (
            <span className="text-xs text-slate-400">Pending</span>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        headerClassName: "text-right",
        className: "text-right",
        cell: (row) => (
          <Link
            href={`/employees/${row.id}`}
            className="rounded-lg border border-border-slate px-3 py-1.5 text-xs font-bold tracking-widest text-navy uppercase hover:bg-white hover:text-green-deep"
            onClick={(e) => e.stopPropagation()}
          >
            View Profile
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Directory"
        description="Track workforce mapping readiness and assessment eligibility."
        actions={
          <Link
            href="/employees/import"
            className={cn(buttonVariants({ variant: "secondary" }))}
          >
            <UploadIcon className="size-4" aria-hidden />
            Import employees
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
          <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Mapped workforce
          </p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-navy">{metrics.total.toLocaleString()}</h3>
            <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-deep">
              {metrics.mappedPercent}%
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
          <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Unmapped Talent
          </p>
          <h3 className="text-2xl font-bold text-amber-600">{metrics.unmapped}</h3>
        </div>
        <div className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
          <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Awaiting Assignment
          </p>
          <h3 className="text-2xl font-bold text-blue-600">
            {metrics.awaitingAssignment}
          </h3>
        </div>
        <div className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
          <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
            Assessment Ready
          </p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-navy">
              {metrics.assessmentReady.toLocaleString()}
            </h3>
            <BadgeCheckIcon className="size-4 text-green-lime" aria-hidden />
          </div>
        </div>
      </div>

      <FilterBar
        search={
          <SearchField
            placeholder="Search by name, ID or role…"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
          />
        }
        filters={
          <>
            <select
              className="h-10 rounded-lg border border-border-slate bg-white px-4 text-xs font-bold text-navy"
              value={list.filters.department ?? "all"}
              onChange={(e) => list.setFilter("department", e.target.value)}
            >
              <option value="all">Department: All</option>
              <option value="it">IT</option>
              <option value="hr">HR</option>
              <option value="finance">Finance</option>
            </select>
            <select
              className="h-10 rounded-lg border border-border-slate bg-white px-4 text-xs font-bold text-navy"
              value={list.filters.mapping ?? "all"}
              onChange={(e) => list.setFilter("mapping", e.target.value)}
            >
              <option value="all">Mapping: All</option>
              <option value="aligned">Aligned</option>
              <option value="unmapped">Unmapped</option>
              <option value="exception">Exception</option>
              <option value="pending">Pending</option>
            </select>
          </>
        }
      />

      <DataTable
        columns={columns}
        data={list.items}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        sort={list.sort}
        onSortChange={list.toggleSort}
        onRowClick={(row) => router.push(`/employees/${row.id}`)}
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
        onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
        totalLabel={`${list.total} employees · page ${list.pageIndex + 1} of ${list.pageCount}`}
        bulkActions={
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                const count = await bulkMarkAssessmentReady(selectedIds);
                setEmployees((prev) =>
                  prev.map((e) =>
                    selectedIds.includes(e.id)
                      ? { ...e, assessmentReady: true }
                      : e,
                  ),
                );
                setSelectedIds([]);
                toast.success(`Marked ${count} employees assessment-ready`);
              }}
            >
              Mark assessment ready
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                const count = await bulkAssignRole(
                  selectedIds,
                  "role-ssa",
                  "Senior Solutions Architect",
                );
                setEmployees((prev) =>
                  prev.map((e) =>
                    selectedIds.includes(e.id)
                      ? {
                          ...e,
                          roleId: "role-ssa",
                          roleTitle: "Senior Solutions Architect",
                          mappingStatus: "aligned",
                          profileVersion: e.profileVersion ?? "V1.0 (Draft)",
                        }
                      : e,
                  ),
                );
                setSelectedIds([]);
                toast.success(`Assigned SSA role to ${count} employees (mock)`);
              }}
            >
              Assign SSA role
            </Button>
          </>
        }
      />
    </div>
  );
}
