"use client";

import Link from "next/link";
import { useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FirstAdminDialog } from "@/features/platform/components/first-admin-dialog";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import {
  entitlementOptions,
  listTenants,
  updateTenantEntitlements,
  type TenantRecord,
  type TenantStatus,
} from "@/features/platform/services/mock-platform";
import { usePlatformRevision } from "@/features/platform/use-platform-store";
import { useListQuery } from "@/hooks/use-list-query";
import { useSessionStore } from "@/stores/session-store";

const selectClass =
  "h-9 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy outline-none";

function statusVariant(status: TenantStatus) {
  if (status === "Active") return "success" as const;
  if (status === "Provisioning" || status === "Awaiting Admin") return "info" as const;
  if (status === "Suspended") return "error" as const;
  return "warning" as const;
}

export function TenantDirectoryView() {
  const revision = usePlatformRevision();
  const actor = useSessionStore((state) => state.user.name);
  const tenants = listTenants();
  void revision;
  const list = useListQuery({
    data: tenants,
    searchKeys: ["name", "externalId", "code"],
    initialPageSize: 8,
    filterFn: (row, filters) => {
      if (filters.plan && filters.plan !== "all" && row.plan !== filters.plan) return false;
      if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
      return true;
    },
    getSortValue: (row, id) => {
      if (id === "name") return row.name;
      if (id === "plan") return row.plan;
      if (id === "status") return row.status;
      return "";
    },
  });
  const [editing, setEditing] = useState<TenantRecord | null>(null);
  const [adminOf, setAdminOf] = useState<TenantRecord | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const columns: DataTableColumn<TenantRecord>[] = [
    {
      id: "name",
      header: "Tenant Detail",
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-navy text-xs font-bold text-white">
            {row.code}
          </span>
          <div>
            <p className="font-bold text-navy">{row.name}</p>
            <p className="font-mono text-[10px] text-slate-400">ID: {row.externalId}</p>
          </div>
        </div>
      ),
    },
    {
      id: "entitlements",
      header: "Entitlements",
      cell: (row) => (
        <div className="flex max-w-56 flex-wrap gap-1">
          {row.entitlements.map((item) => (
            <Badge key={item} variant="info">
              {item}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "plan",
      header: "Subscription",
      sortable: true,
      cell: (row) => (
        <div>
          <p className="text-xs font-bold text-navy">{row.plan}</p>
          <p className="mt-1 text-[10px] tracking-widest text-slate-400 uppercase">Renewal: {row.renewal}</p>
        </div>
      ),
    },
    {
      id: "infrastructure",
      header: "Infrastructure",
      cell: (row) => <p className="text-[10px] text-slate-500">Shards: {row.shards} Active</p>,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
    },
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Link
            href={`/platform/support/access?tenant=${row.id}`}
            className="text-[10px] font-bold tracking-wide text-navy uppercase"
          >
            Access
          </Link>
          <button
            type="button"
            className="text-[10px] font-bold tracking-wide text-navy uppercase"
            onClick={() => {
              setEditing(row);
              setFlags(row.entitlements);
            }}
          >
            Entitlements
          </button>
          {row.adminUserId ? (
            <button type="button" className="text-[10px] font-bold tracking-wide text-navy uppercase" onClick={() => setAdminOf(row)}>
              First admin
            </button>
          ) : null}
          <Link
            href={`/platform/audit?tenant=${row.externalId}&category=Provisioning`}
            className="text-[10px] font-bold tracking-wide text-navy uppercase"
          >
            Logs
          </Link>
        </div>
      ),
    },
  ];

  return (
    <PlatformGate>
      <PageHeader
        title="Tenant Management"
        description="System-wide control over multi-tenant infrastructure, subscription levels, and cross-tenant security monitoring."
        actions={
          <Link href="/platform/tenants/new" className={cn(buttonVariants(), "gap-2")}>
            <PlusIcon className="size-3.5" aria-hidden />
            Provision New Tenant
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border-slate bg-white p-4 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
            placeholder="Search by Tenant ID or Name..."
            className="pl-9"
            aria-label="Search tenants"
          />
        </div>
        <select
          className={selectClass}
          value={list.filters.plan ?? "all"}
          aria-label="Subscription"
          onChange={(event) => list.setFilter("plan", event.target.value)}
        >
          <option value="all">Subscription: All</option>
          <option value="Enterprise Plus">Enterprise Plus</option>
          <option value="Standard">Standard</option>
          <option value="Pilot / Trial">Pilot / Trial</option>
        </select>
        <select
          className={selectClass}
          value={list.filters.status ?? "all"}
          aria-label="Status"
          onChange={(event) => list.setFilter("status", event.target.value)}
        >
          <option value="all">Status: All</option>
          <option value="Active">Active</option>
          <option value="Provisioning">Provisioning</option>
          <option value="Awaiting Admin">Awaiting Admin</option>
          <option value="MFA Pending">MFA Pending</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        getRowId={(row) => row.id}
        sort={list.sort}
        onSortChange={list.toggleSort}
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
        onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
        totalLabel={`${list.total} tenants`}
        emptyMessage="No tenants match this search."
      />

      {adminOf ? <FirstAdminDialog tenant={adminOf} onClose={() => setAdminOf(null)} /> : null}

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify entitlements</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.name} (${editing.externalId})` : "Tenant"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {entitlementOptions.map((option) => (
              <label key={option} className="flex items-center gap-3 text-sm text-navy">
                <Checkbox
                  checked={flags.includes(option)}
                  onCheckedChange={(checked) =>
                    setFlags((current) =>
                      checked ? [...current, option] : current.filter((item) => item !== option),
                    )
                  }
                />
                {option}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !editing}
              onClick={async () => {
                if (!editing) return;
                setPending(true);
                try {
                  await updateTenantEntitlements(editing.id, flags, actor);
                  toast.success("Entitlements updated", { description: editing.name });
                  setEditing(null);
                } finally {
                  setPending(false);
                }
              }}
            >
              Save entitlements
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformGate>
  );
}
