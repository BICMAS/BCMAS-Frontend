"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { InfoIcon, SparklesIcon, UploadIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  AddEmployeeDialog,
  BulkUploadDialog,
  initialsAvatar,
  PendingApprovalsPanel,
  RemoveEmployeeDialog,
} from "@/features/employees/components/workforce-change-dialogs";
import { useMappingApprovals } from "@/features/employees/services/mapping-approvals";
import { assignSuggestedRoles } from "@/features/employees/services/mock-mapping";
import type { BulkMappingRow, MappingRoleOption } from "@/features/employees/types";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { useListQuery } from "@/hooks/use-list-query";

type BulkMappingViewProps = {
  initialRows: BulkMappingRow[];
  roles: MappingRoleOption[];
};

export function BulkMappingView({ initialRows, roles }: BulkMappingViewProps) {
  const router = useRouter();
  const user = useHydratedUser();
  const [rows, setRows] = useState(initialRows);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BulkMappingRow | null>(null);
  const changes = useMappingApprovals((s) => s.changes);
  const submit = useMappingApprovals((s) => s.submit);

  const pendingFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const change of changes) {
      if (change.status === "pending" && change.employeeId) {
        map.set(change.employeeId, change.kind === "removal" ? "Removal pending" : "Pending approval");
      }
    }
    return map;
  }, [changes]);

  const departments = useMemo(() => [...new Set(rows.map((r) => r.departmentName))].sort(), [rows]);

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

  const submitter = user ? { id: user.id, name: user.name } : null;

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
        cell: (row) => <span className="text-slate-500">{row.departmentName}</span>,
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
                row.confidence >= 80 ? "text-[10px] font-bold text-green-deep" : "text-[10px] font-bold text-amber-600"
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
        cell: (row) => {
          const pending = pendingFor.get(row.employeeId);
          if (pending) {
            return (
              <Badge variant="info" className="rounded uppercase">
                {pending}
              </Badge>
            );
          }
          return (
            <Badge
              variant={row.status === "aligned" ? "success" : row.status === "draft" ? "warning" : "secondary"}
              className="rounded uppercase"
            >
              {row.status}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        headerClassName: "text-right",
        className: "text-right",
        cell: (row) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hover:bg-red-50 hover:text-red-600"
              disabled={pendingFor.has(row.employeeId)}
              aria-label={`Remove ${row.name} from the organisation`}
              onClick={() => setRemoveTarget(row)}
            >
              <UserMinusIcon className="size-4" aria-hidden />
              Remove
            </Button>
          </div>
        ),
      },
    ],
    [pendingFor],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Mapping Tool"
        description={
          <>
            <span className="block font-medium text-slate-600">
              Map employees to their respective organisational roles quickly and accurately.
            </span>
            <span className="mt-1 block text-sm">
              Use bulk mapping to assign employees to existing roles within your organisation, validate the assignments
              and establish the foundation for individual capability assessment.
            </span>
          </>
        }
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
            <Button type="button" onClick={() => setUploadOpen(true)}>
              <UploadIcon className="size-4" aria-hidden />
              Bulk Upload
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(true)}>
              <UserPlusIcon className="size-4" aria-hidden />
              Add New Employee
            </Button>
          </>
        }
      />

      <div className="flex gap-3 rounded-xl border border-info-soft bg-info-soft/40 p-4 text-sm text-navy">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p>
            <span className="font-bold">All changes are reviewed before they go live.</span> Role assignments, new
            employees and removals are submitted for approval, and must be approved by another administrator.
          </p>
          <p>
            <span className="font-bold">Employee has left the organisation?</span> Select <em>Remove</em> on their row,
            choose the reason (for example, resigned) and their last working day, then submit it for approval.
          </p>
        </div>
      </div>

      <PendingApprovalsPanel
        user={user}
        onApplied={(change) => {
          if (change.kind === "mapping" && change.employeeId && change.payload.roleId) {
            void assignSuggestedRoles([change.employeeId], change.payload.roleId, change.payload.roleTitle ?? "");
            setRows((current) =>
              current.map((row) =>
                row.employeeId === change.employeeId
                  ? {
                      ...row,
                      suggestedRoleId: change.payload.roleId!,
                      suggestedRoleTitle: change.payload.roleTitle ?? row.suggestedRoleTitle,
                      status: "aligned",
                      confidence: Math.max(row.confidence, 90),
                    }
                  : row,
              ),
            );
          } else if (change.kind === "removal" && change.employeeId) {
            setRows((current) => current.filter((row) => row.employeeId !== change.employeeId));
          } else if (change.kind === "new_employee") {
            const id = change.payload.employeeCode ?? change.id;
            setRows((current) => [
              {
                id: `row-${id}`,
                employeeId: id,
                name: change.employeeName,
                avatarUrl: initialsAvatar(change.employeeName),
                departmentName: change.payload.departmentName ?? "",
                suggestedRoleId: change.payload.roleId ?? "",
                suggestedRoleTitle: change.payload.roleTitle ?? "",
                confidence: 100,
                status: "aligned",
              },
              ...current,
            ]);
          }
        }}
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
            disabled={selectedIds.length === 0 || !submitter}
            onClick={() => {
              const role = roles.find((item) => item.id === roleId);
              if (!role || !submitter) return;
              const targets = rows.filter((r) => selectedIds.includes(r.employeeId) && !pendingFor.has(r.employeeId));
              for (const row of targets) {
                submit({
                  kind: "mapping",
                  employeeId: row.employeeId,
                  employeeName: row.name,
                  summary: `Assign role: ${role.title}`,
                  submittedBy: submitter,
                  payload: { roleId: role.id, roleTitle: role.title, departmentName: row.departmentName },
                });
              }
              setSelectedIds([]);
              toast.success(`Submitted ${targets.length} role assignment(s) for approval`);
            }}
          >
            Submit for approval
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
        onRowClick={(row) => router.push(`/employees/mapping?employee=${row.employeeId}`)}
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
        onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
        totalLabel={`${list.total} employees`}
        emptyMessage="No employees match these filters."
      />

      <p className="text-xs text-slate-500">
        Open an employee in the{" "}
        <Link href="/employees/mapping" className="font-bold text-navy underline">
          mapping workspace
        </Link>{" "}
        to compare their current and required skills before submitting.
      </p>

      <BulkUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        roles={roles}
        submitter={submitter}
        onSubmitted={(count) => toast.success(`${count} employee record(s) submitted for approval`)}
      />
      <AddEmployeeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        roles={roles}
        departments={departments}
        submitter={submitter}
      />
      <RemoveEmployeeDialog
        row={removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        submitter={submitter}
      />
    </div>
  );
}
