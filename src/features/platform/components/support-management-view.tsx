"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import {
  createSupportTicket,
  listSupportSessions,
  listTenants,
  listTickets,
  type SupportTicket,
  type TicketPriority,
} from "@/features/platform/services/mock-platform";
import { usePlatformRevision } from "@/features/platform/use-platform-store";
import { useListQuery } from "@/hooks/use-list-query";
import { useSessionStore } from "@/stores/session-store";

const selectClass =
  "h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm text-navy outline-none";

export function SupportManagementView() {
  usePlatformRevision();
  const actor = useSessionStore((state) => state.user.name);
  const tenants = listTenants();
  const tickets = listTickets();
  const sessions = listSupportSessions();
  const tenantName = useMemo(() => {
    const names = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
    return (id: string) => names.get(id) ?? id;
  }, [tenants]);
  const list = useListQuery({
    data: tickets,
    searchKeys: ["id", "category", (row) => tenantName(row.tenantId)],
    initialPageSize: 8,
  });
  const openCount = tickets.filter((ticket) => ticket.status !== "Resolved").length;
  const [logOpen, setLogOpen] = useState(false);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("Medium");
  const [pending, setPending] = useState(false);

  const columns: DataTableColumn<SupportTicket>[] = [
    { id: "id", header: "Ticket ID", cell: (row) => <span className="font-mono text-[11px] font-bold">#{row.id}</span> },
    { id: "tenant", header: "Tenant", cell: (row) => tenantName(row.tenantId) },
    { id: "category", header: "Issue Category", cell: (row) => <span className="text-slate-600 italic">{row.category}</span> },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge variant={row.status === "Resolved" ? "success" : row.status === "Assigned" ? "info" : "warning"}>
          {row.status}
        </Badge>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      cell: (row) => (
        <Badge variant={row.priority === "High" ? "error" : row.priority === "Medium" ? "warning" : "secondary"}>
          {row.priority}
        </Badge>
      ),
    },
    {
      id: "action",
      header: "Action",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) =>
        row.status === "Resolved" ? (
          <button type="button" className="text-xs font-bold text-slate-400" onClick={() => setDetail(row)}>
            View Detail
          </button>
        ) : (
          <Link
            href={`/platform/support/access?tenant=${row.tenantId}&ticket=${row.id}`}
            className="text-xs font-bold text-navy"
          >
            Assume Access
          </Link>
        ),
    },
  ];

  return (
    <PlatformGate>
      <PageHeader
        title="Support & Ticket Operations"
        description="Centralized view of customer support requests, service tickets, and cross-tenant troubleshooting status."
        actions={
          <Button type="button" onClick={() => setLogOpen(true)}>
            <PlusIcon className="size-3.5" aria-hidden />
            Log New Ticket
          </Button>
        }
      />

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Tickets" value={String(openCount)} icon={PlusIcon} />
        <StatCard label="Avg. Response Time" value="42m" deltaTone="neutral" icon={SearchIcon} iconWellClassName="bg-green-50 text-green-deep" />
        <StatCard label="Active Support Sessions" value={String(sessions.length)} delta="Audited" icon={SearchIcon} iconWellClassName="bg-blue-50 text-blue-600" />
        <StatCard label="Resolution Rate" value="98.2%" deltaTone="neutral" />
      </div>

      <div className="relative mb-4 max-w-xs">
        <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
          placeholder="Search tickets..."
          className="pl-9"
          aria-label="Search tickets"
        />
      </div>

      <DataTable
        columns={columns}
        data={list.items}
        getRowId={(row) => row.id}
        pageIndex={list.pageIndex}
        pageCount={list.pageCount}
        onPreviousPage={() => list.setPageIndex(list.pageIndex - 1)}
        onNextPage={() => list.setPageIndex(list.pageIndex + 1)}
        emptyMessage="No tickets match this search."
      />

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log new ticket</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (category.trim().length < 3) return;
              setPending(true);
              try {
                const ticket = await createSupportTicket({ tenantId, category, priority, actorName: actor });
                if (!ticket) return;
                toast.success("Ticket logged", { description: `#${ticket.id}` });
                setCategory("");
                setLogOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            <select className={selectClass} value={tenantId} aria-label="Tenant" onChange={(event) => setTenantId(event.target.value)}>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
            <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Issue category" aria-label="Issue category" />
            <select
              className={selectClass}
              value={priority}
              aria-label="Priority"
              onChange={(event) => setPriority(event.target.value as TicketPriority)}
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setLogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || category.trim().length < 3}>
                Save ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detail != null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail ? `#${detail.id}` : "Ticket"}</DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>{tenantName(detail.tenantId)}</p>
              <p>{detail.category}</p>
              <p>
                {detail.status} · {detail.priority}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformGate>
  );
}
