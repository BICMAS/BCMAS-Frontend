"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import {
  auditExportText,
  listAuditEvents,
  type AuditCategory,
  type AuditEvent,
} from "@/features/platform/services/mock-platform";
import { usePlatformRevision } from "@/features/platform/use-platform-store";
import { useListQuery } from "@/hooks/use-list-query";

const selectClass =
  "h-9 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy outline-none";

function categoryVariant(category: AuditCategory) {
  if (category === "Assumed Access") return "warning" as const;
  if (category === "Provisioning") return "success" as const;
  return "info" as const;
}

export function PlatformAuditView() {
  usePlatformRevision();
  const params = useSearchParams();
  const tenantFilter = params.get("tenant") ?? "";
  const [category, setCategory] = useState(params.get("category") ?? "all");
  const events = listAuditEvents();
  const scoped = useMemo(
    () =>
      events.filter((event) => {
        if (tenantFilter && event.tenantExternalId !== tenantFilter) return false;
        if (category !== "all" && event.category !== category) return false;
        return true;
      }),
    [category, events, tenantFilter],
  );
  const list = useListQuery({
    data: scoped,
    searchKeys: ["adminName", "summary", "tenantExternalId", "sessionId", "category"],
    initialPageSize: 8,
  });

  const columns: DataTableColumn<AuditEvent>[] = [
    { id: "at", header: "Timestamp", cell: (row) => <span className="text-xs whitespace-nowrap text-slate-500">{row.at}</span> },
    {
      id: "admin",
      header: "Admin User",
      cell: (row) => (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.adminAvatar} alt="" className="size-6 rounded-full border border-border-slate" />
          <span className="font-bold text-navy">{row.adminName}</span>
        </div>
      ),
    },
    {
      id: "category",
      header: "Event Category",
      cell: (row) => <Badge variant={categoryVariant(row.category)}>{row.category}</Badge>,
    },
    { id: "tenant", header: "Target Tenant", cell: (row) => <span className="text-xs font-medium">{row.tenantExternalId}</span> },
    { id: "summary", header: "Action Summary", cell: (row) => <p className="max-w-xs text-xs text-slate-600">{row.summary}</p> },
    {
      id: "session",
      header: "Session ID",
      headerClassName: "text-right",
      className: "text-right font-mono text-[10px] text-slate-400",
      cell: (row) => row.sessionId,
    },
  ];

  return (
    <PlatformGate>
      <PageHeader
        title="Global Platform Audit"
        description="System-wide immutable logs for vendor-side administrative actions, tenant provisioning, and assumed support access events."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const blob = new Blob([auditExportText(list.allFiltered)], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "platform-audit.txt";
              anchor.click();
              URL.revokeObjectURL(url);
              toast.success("Security log exported");
            }}
          >
            Export Security Log
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
            placeholder="Search logs..."
            className="pl-9"
            aria-label="Search logs"
          />
        </div>
        <select
          className={selectClass}
          value={category}
          aria-label="Event category"
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">Category: All Events</option>
          <option value="Security">Security</option>
          <option value="Assumed Access">Assumed Access</option>
          <option value="Provisioning">Provisioning</option>
        </select>
        {tenantFilter ? <span className="text-xs font-bold text-navy">Tenant {tenantFilter}</span> : null}
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        getRowId={(row) => row.id}
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
        onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
        totalLabel="Platform Global Audit (Immutable Logs)"
        emptyMessage="No audit events match this search."
      />
    </PlatformGate>
  );
}
