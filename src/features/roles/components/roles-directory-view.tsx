"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BanIcon,
  LayoutGridIcon,
  ListIcon,
  PenLineIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateRoleDialog } from "@/features/roles/components/create-role-dialog";
import { RoleStatusBadge } from "@/features/roles/components/role-status-badge";
import { deactivateRole } from "@/features/roles/services/mock-roles";
import type { RoleRecord } from "@/features/roles/types";
import { useListQuery } from "@/hooks/use-list-query";
import { cn } from "@/lib/utils";

type RolesDirectoryViewProps = {
  initialRoles: RoleRecord[];
};

export function RolesDirectoryView({ initialRoles }: RolesDirectoryViewProps) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [view, setView] = useState<"table" | "grid">("table");
  const [createOpen, setCreateOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<RoleRecord | null>(
    null,
  );

  const list = useListQuery({
    data: roles,
    searchKeys: ["title", "departmentName"],
    initialSort: { id: "title", direction: "asc" },
    filterFn: (row, filters) => {
      if (filters.department && filters.department !== "all") {
        if (row.departmentId !== filters.department) return false;
      }
      if (filters.status && filters.status !== "all") {
        if (row.status !== filters.status) return false;
      }
      return true;
    },
    getSortValue: (row, id) => {
      if (id === "employeeCount") return row.employeeCount;
      if (id === "updatedAt") return row.updatedAt;
      if (id === "title") return row.title;
      if (id === "departmentName") return row.departmentName;
      return null;
    },
  });

  const columns = useMemo<DataTableColumn<RoleRecord>[]>(
    () => [
      {
        id: "title",
        header: "Role Name",
        sortable: true,
        cell: (row) => (
          <Link
            href={`/roles/${row.id}`}
            className="font-bold text-navy hover:text-green-deep"
            onClick={(e) => e.stopPropagation()}
          >
            {row.title}
          </Link>
        ),
      },
      {
        id: "departmentName",
        header: "Department",
        sortable: true,
        accessorKey: "departmentName",
      },
      {
        id: "employeeCount",
        header: "Employee Count",
        sortable: true,
        cell: (row) => (
          <span className="font-medium">{row.employeeCount}</span>
        ),
      },
      {
        id: "status",
        header: "Profile Status",
        cell: (row) => <RoleStatusBadge status={row.status} />,
      },
      {
        id: "updatedAt",
        header: "Last Updated",
        sortable: true,
        cell: (row) => (
          <span className="text-xs text-slate-400">
            {new Date(row.updatedAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        headerClassName: "text-right",
        className: "text-right",
        cell: (row) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${row.title}`}
              onClick={() => router.push(`/roles/${row.id}/profile/setup`)}
            >
              <PenLineIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hover:bg-red-50 hover:text-red-500"
              aria-label={`Deactivate ${row.title}`}
              onClick={() => setDeactivateTarget(row)}
            >
              <BanIcon className="size-4" />
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
        title="Roles Directory"
        description="Manage organisational roles and AI-assisted skills profiles."
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" aria-hidden />
            Create New Role
          </Button>
        }
      />

      <FilterBar
        search={
          <SearchField
            placeholder="Search roles…"
            value={list.search}
            onChange={(e) => list.setSearch(e.target.value)}
          />
        }
        filters={
          <>
            <select
              className="h-10 min-w-[160px] rounded-lg border border-border-slate bg-slate-50 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-navy"
              value={list.filters.department ?? "all"}
              onChange={(e) => list.setFilter("department", e.target.value)}
            >
              <option value="all">All Departments</option>
              <option value="it">IT</option>
              <option value="hr">HR</option>
              <option value="finance">Finance</option>
            </select>
            <select
              className="h-10 min-w-[160px] rounded-lg border border-border-slate bg-slate-50 px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-navy"
              value={list.filters.status ?? "all"}
              onChange={(e) => list.setFilter("status", e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="awaiting_review">Awaiting Review</option>
              <option value="approved">Approved</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="published">Published</option>
            </select>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="mr-1 text-xs font-bold tracking-widest text-slate-400 uppercase">
              Display
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant={view === "table" ? "secondary" : "ghost"}
              aria-label="Table view"
              onClick={() => setView("table")}
            >
              <ListIcon className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant={view === "grid" ? "secondary" : "ghost"}
              aria-label="Grid view"
              onClick={() => setView("grid")}
            >
              <LayoutGridIcon className="size-4" />
            </Button>
          </div>
        }
      />

      {view === "table" ? (
        <DataTable
          columns={columns}
          data={list.items}
          sort={list.sort}
          onSortChange={list.toggleSort}
          onRowClick={(row) => router.push(`/roles/${row.id}`)}
          pageIndex={list.pageIndex}
          pageCount={list.pageCount}
          onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
          onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
          totalLabel={`${list.total} roles · page ${list.pageIndex + 1} of ${list.pageCount}`}
          emptyMessage="No roles match your filters."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.items.map((role) => (
            <Link
              key={role.id}
              href={`/roles/${role.id}`}
              className="rounded-xl border border-border-slate bg-white p-5 shadow-sm transition-all hover:border-green-lime hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="font-bold text-navy">{role.title}</h3>
                <RoleStatusBadge status={role.status} />
              </div>
              <p className="text-sm text-slate-500">{role.departmentName}</p>
              <p className="mt-4 text-xs font-bold text-slate-400 uppercase">
                {role.employeeCount} employees
              </p>
            </Link>
          ))}
          {list.items.length === 0 ? (
            <p className="col-span-full py-12 text-center text-sm text-slate-500">
              No roles match your filters.
            </p>
          ) : null}
        </div>
      )}

      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(role) => {
          setRoles((prev) => [role, ...prev]);
          router.push(`/roles/${role.id}/profile/setup`);
        }}
      />

      <Dialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate role?</DialogTitle>
            <DialogDescription>
              {deactivateTarget
                ? `“${deactivateTarget.title}” will be removed from the directory (mock).`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeactivateTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!deactivateTarget) return;
                await deactivateRole(deactivateTarget.id);
                setRoles((prev) =>
                  prev.filter((r) => r.id !== deactivateTarget.id),
                );
                toast.success(`Deactivated “${deactivateTarget.title}”`);
                setDeactivateTarget(null);
              }}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-slate-400">
        Need org structure first?{" "}
        <Link
          href="/org/departments"
          className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}
        >
          Manage departments
        </Link>
      </p>
    </div>
  );
}
