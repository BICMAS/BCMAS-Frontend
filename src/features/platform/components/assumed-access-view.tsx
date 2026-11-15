"use client";

import { ShieldUserIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import {
  assumeTenantAccess,
  listSupportSessions,
  listTenants,
  terminateSupportSession,
} from "@/features/platform/services/mock-platform";
import { usePlatformRevision } from "@/features/platform/use-platform-store";
import { useSessionStore } from "@/stores/session-store";

const selectClass =
  "h-12 w-full rounded-xl border border-border-slate bg-slate-50 px-4 text-sm font-bold text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

export function AssumedAccessView() {
  usePlatformRevision();
  const params = useSearchParams();
  const user = useSessionStore((state) => state.user);
  const tenants = listTenants();
  const sessions = listSupportSessions();
  const [tenantId, setTenantId] = useState(params.get("tenant") ?? tenants[0]?.id ?? "");
  const [ticketId, setTicketId] = useState(params.get("ticket") ?? "");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return (
    <PlatformGate>
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-border-slate bg-white shadow-xl">
            <ShieldUserIcon className="size-7 text-navy" aria-hidden />
          </div>
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-navy">Assumed Support Access</h1>
          <p className="leading-relaxed text-slate-500">
            Platform administrators must explicitly assume access to a customer tenant for troubleshooting. All actions performed during this session are logged in the global audit trail.
          </p>
        </div>

        <form
          className="space-y-8 rounded-3xl border border-border-slate bg-white p-8 shadow-xl lg:p-10"
          onSubmit={async (event) => {
            event.preventDefault();
            if (ticketId.trim().length < 3 || reason.trim().length < 3) {
              setError("Enter a ticket id and a reason of at least 3 characters.");
              return;
            }
            setError("");
            setPending(true);
            try {
              const session = await assumeTenantAccess({
                tenantId,
                ticketId,
                reason,
                actorName: user.name,
                actorAvatar: user.avatarUrl,
              });
              if (!session) {
                setError("Choose a customer tenant.");
                return;
              }
              setTicketId("");
              setReason("");
              toast.success("Support access assumed", { description: `Expires in ${session.expiresLabel}` });
            } finally {
              setPending(false);
            }
          }}
        >
          <div>
            <label htmlFor="tenant" className="mb-3 block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              1. Select Customer Tenant
            </label>
            <select
              id="tenant"
              className={selectClass}
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} ({tenant.externalId})
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">2. Justification & Tracking</p>
            <div className="space-y-4">
              <Input
                value={ticketId}
                onChange={(event) => setTicketId(event.target.value)}
                placeholder="Service Ticket ID (e.g. #TIC-10291)"
                aria-label="Service ticket id"
              />
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Detailed reason for access..."
                aria-label="Reason for access"
              />
            </div>
            {error ? <p className="mt-2 text-xs font-medium text-error-soft-foreground">{error}</p> : null}
          </div>

          <div className="flex items-start gap-4 rounded-2xl border border-amber-100 bg-amber-50 p-5">
            <div>
              <h2 className="mb-1 text-xs font-bold tracking-wider text-amber-900 uppercase">Privacy Notice</h2>
              <p className="text-[11px] leading-relaxed text-amber-700">
                Individual employee capability records and private skills data will be visible. Do not screenshot or export sensitive records without customer consent.
              </p>
            </div>
          </div>

          <div>
            <Button type="submit" className="h-12 w-full rounded-2xl" disabled={pending}>
              Assume Tenant Access
            </Button>
            <p className="mt-4 text-center text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">
              Session Auto-Expires in 60 Mins
            </p>
          </div>
        </form>

        <div className="mt-12">
          <h2 className="mb-4 ml-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Currently Active Support Sessions
          </h2>
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <p className="text-sm text-slate-500">No support sessions are active.</p>
            ) : (
              sessions.map((session) => {
                const tenant = tenants.find((item) => item.id === session.tenantId);
                return (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-2xl border border-border-slate bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={session.actorAvatar}
                        alt=""
                        className="size-8 rounded-full border border-border-slate"
                      />
                      <div>
                        <p className="text-xs font-bold text-navy">
                          {session.actorName} <span className="font-normal text-slate-400">assuming</span>{" "}
                          {tenant?.name ?? session.tenantId}
                        </p>
                        <p className="mt-1 text-[9px] text-slate-400 uppercase">
                          Ticket #{session.ticketId} · Expires in {session.expiresLabel}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-[10px] font-bold text-red-500 uppercase"
                      disabled={pending}
                      onClick={async () => {
                        setPending(true);
                        try {
                          await terminateSupportSession(session.id, user.name);
                          toast.success("Support session terminated");
                        } finally {
                          setPending(false);
                        }
                      }}
                    >
                      Force Termination
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </PlatformGate>
  );
}
