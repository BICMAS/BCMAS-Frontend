"use client";

import { MoreHorizontalIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { mockEmployees } from "@/features/employees/data/mock-employees";
import { useListQuery } from "@/hooks/use-list-query";
import { useSessionStore } from "@/stores/session-store";

import {
  accessRoles,
  cancelActivationCode,
  changeAccessRole,
  correctEmail,
  inviteUser,
  listAccountEvents,
  listAccounts,
  newActivationCode,
  reactivateAccount,
  resetSignIn,
  SETUP_METHOD_HINT,
  SETUP_METHOD_LABEL,
  setupMethodFor,
  suspendAccount,
  unlockAccount,
  type AccessRole,
  type Account,
  type AccountStatus,
  type Actor,
  type Setup,
} from "../services/accounts";
import { useAccountsRevision } from "../use-accounts";
import { SetupDialog } from "./setup-dialog";

const selectClass =
  "h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm font-bold text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

const STATUSES: AccountStatus[] = ["Active", "Invited", "Code expired", "Reset pending", "Locked", "Suspended"];

function statusVariant(status: AccountStatus) {
  if (status === "Active") return "success" as const;
  if (status === "Invited" || status === "Reset pending") return "info" as const;
  if (status === "Suspended") return "error" as const;
  return "warning" as const;
}

const EVENT_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Job to confirm before it happens. */
type Pending = { account: Account; action: "reset" | "suspend" };

export function UserManagementView() {
  const revision = useAccountsRevision();
  const user = useSessionStore((s) => s.user);
  if (revision === -1) return null;
  if (user.portal !== "organisation_admin") {
    return <p className="text-sm text-slate-500">User Management is available to the Organisation Admin.</p>;
  }
  return <Users actor={user} />;
}

function Users({ actor }: { actor: Actor }) {
  const organisationId = actor.organisationId;
  const accounts = listAccounts(organisationId);
  const method = setupMethodFor(organisationId);
  const events = listAccountEvents(organisationId).slice(0, 8);
  const [inviting, setInviting] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [roleFor, setRoleFor] = useState<Account | null>(null);
  const [emailFor, setEmailFor] = useState<Account | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useListQuery({
    data: accounts,
    searchKeys: ["name", "email"],
    initialPageSize: 10,
    filterFn: (row, filters) =>
      (!filters.role || filters.role === "all" || row.accessRole === filters.role) &&
      (!filters.status || filters.status === "all" || row.status === filters.status),
    getSortValue: (row, id) => (id === "role" ? row.accessRole : id === "status" ? row.status : row.name),
  });

  /** Runs one action and shows its message or its error. Returns whether it worked. */
  async function run(action: () => Promise<Setup | void>, message?: string) {
    setBusy(true);
    try {
      const result = await action();
      if (result) setSetup(result);
      if (message) toast.success(message);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function actionsFor(row: Account): { label: string; run: () => void }[] {
    if (row.id === actor.id) return [];
    const pendingSetup = row.status === "Invited" || row.status === "Code expired" || row.status === "Reset pending";
    const items: { label: string; run: () => void }[] = [];
    if (pendingSetup && method !== "sso") {
      items.push({ label: "New code", run: () => void run(() => newActivationCode(row.id, actor)) });
      if (row.codeExpiresAt) {
        items.push({ label: "Cancel code", run: () => void run(() => cancelActivationCode(row.id, actor), "Code cancelled") });
      }
    }
    if (pendingSetup && row.status !== "Reset pending") items.push({ label: "Correct email", run: () => setEmailFor(row) });
    if (row.status === "Locked") items.push({ label: "Unlock", run: () => void run(() => unlockAccount(row.id, actor), `${row.name} unlocked`) });
    if ((row.status === "Active" || row.status === "Locked") && method !== "sso") {
      items.push({ label: "Reset sign-in", run: () => setConfirm({ account: row, action: "reset" }) });
    }
    items.push({ label: "Change access role", run: () => setRoleFor(row) });
    items.push(
      row.status === "Suspended"
        ? { label: "Reactivate", run: () => void run(() => reactivateAccount(row.id, actor), `${row.name} reactivated`) }
        : { label: "Suspend", run: () => setConfirm({ account: row, action: "suspend" }) },
    );
    return items;
  }

  const columns: DataTableColumn<Account>[] = [
    {
      id: "name",
      header: "Person",
      sortable: true,
      cell: (row) => (
        <div>
          <p className="font-bold text-navy">
            {row.name}
            {row.id === actor.id ? " (you)" : ""}
          </p>
          <p className="text-xs text-slate-500">{row.email}</p>
        </div>
      ),
    },
    { id: "role", header: "Access role", sortable: true, cell: (row) => row.accessRole },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (row) => (
        <div>
          <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
          {row.codeExpiresAt ? (
            <p className="mt-1 text-[10px] text-slate-400">Code until {EVENT_TIME.format(new Date(row.codeExpiresAt))}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "signIn",
      header: "Last sign-in",
      cell: (row) => (row.lastSignInAt ? EVENT_TIME.format(new Date(row.lastSignInAt)) : "—"),
    },
    {
      id: "actions",
      header: "Actions",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => {
        const items = actionsFor(row);
        return items.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" disabled={busy} aria-label={`Actions for ${row.name}`} />}>
              <MoreHorizontalIcon aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {items.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.run}>
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Invite people, set what they can access, and help them sign in. Each person chooses their own password; nobody else can see or set it."
        actions={
          <Button type="button" onClick={() => setInviting(true)}>
            <UserPlusIcon aria-hidden /> Invite user
          </Button>
        }
      />

      <section aria-label="Account setup" className="rounded-xl border border-border-slate bg-white p-4 text-sm">
        <p className="font-bold text-navy">Account setup: {SETUP_METHOD_LABEL[method]}</p>
        <p className="mt-1 text-slate-500">{SETUP_METHOD_HINT[method]}</p>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-border-slate bg-white p-4 sm:flex-row">
        <Input value={list.search} onChange={(e) => list.setSearch(e.target.value)} placeholder="Search by name or email…" aria-label="Search users" className="sm:max-w-xs" />
        <select aria-label="Filter by role" className={selectClass} value={list.filters.role ?? "all"} onChange={(e) => list.setFilter("role", e.target.value)}>
          <option value="all">Role: All</option>
          {accessRoles.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
        <select aria-label="Filter by status" className={selectClass} value={list.filters.status ?? "all"} onChange={(e) => list.setFilter("status", e.target.value)}>
          <option value="all">Status: All</option>
          {STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
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
        totalLabel={`${list.total} people`}
        emptyMessage="Nobody matches this search."
      />

      <section aria-label="Recent account activity" className="rounded-xl border border-border-slate bg-white p-6">
        <h2 className="text-sm font-bold text-navy">Recent account activity</h2>
        {events.length ? (
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {events.map((event) => (
              <li key={event.id}>
                <span className="text-xs text-slate-400">{EVENT_TIME.format(new Date(event.at))}</span> · {event.actor}: {event.summary}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Nothing yet.</p>
        )}
      </section>

      {inviting ? (
        <InviteDialog
          organisationId={organisationId}
          accounts={accounts}
          busy={busy}
          onClose={() => setInviting(false)}
          onInvite={async (input) => {
            if (await run(() => inviteUser({ ...input, organisationId }, actor), "Account created")) setInviting(false);
          }}
        />
      ) : null}
      {roleFor ? (
        <RoleDialog
          account={roleFor}
          busy={busy}
          onClose={() => setRoleFor(null)}
          onSave={async (role) => {
            if (await run(() => changeAccessRole(roleFor.id, role, actor), "Access role updated")) setRoleFor(null);
          }}
        />
      ) : null}
      {emailFor ? (
        <EmailDialog
          account={emailFor}
          busy={busy}
          onClose={() => setEmailFor(null)}
          onSave={async (email) => {
            if (await run(() => correctEmail(emailFor.id, email, actor), "Email corrected")) setEmailFor(null);
          }}
        />
      ) : null}
      {confirm ? (
        <Dialog open onOpenChange={(open) => !open && setConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirm.action === "reset" ? "Reset sign-in" : "Suspend"} {confirm.account.name}?
              </DialogTitle>
              <DialogDescription>
                {confirm.action === "reset"
                  ? "Check who they are first. Their password and MFA stop working until they activate again with a new code."
                  : "They cannot sign in until you reactivate the account. Their records are kept."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  const { account, action } = confirm;
                  const ok = await run(
                    () => (action === "reset" ? resetSignIn(account.id, actor) : suspendAccount(account.id, actor)),
                    action === "suspend" ? `${account.name} suspended` : undefined,
                  );
                  if (ok) setConfirm(null);
                }}
              >
                {confirm.action === "reset" ? "Reset sign-in" : "Suspend"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      <SetupDialog setup={setup} onClose={() => setSetup(null)} />
    </div>
  );
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type InviteInput = { name: string; email: string; accessRole: AccessRole; employeeId: string | null };

function InviteDialog({
  organisationId,
  accounts,
  busy,
  onClose,
  onInvite,
}: {
  organisationId: string;
  accounts: Account[];
  busy: boolean;
  onClose: () => void;
  onInvite: (input: InviteInput) => void;
}) {
  const [form, setForm] = useState<InviteInput>({ name: "", email: "", accessRole: "Employee", employeeId: null });
  // Sample employees belong to the seeded organisation.
  const employees =
    organisationId === "org-gec" ? mockEmployees.filter((e) => !accounts.some((a) => a.employeeId === e.id || a.email === e.email.toLowerCase())) : [];
  const valid = form.name.trim().length > 1 && EMAIL.test(form.email.trim());
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>They set their own password. The access role is separate from their job role.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onInvite(form);
          }}
        >
          {employees.length ? (
            <Field label="Employee record (optional)" htmlFor="invite-employee">
              <select
                id="invite-employee"
                className={selectClass}
                value={form.employeeId ?? ""}
                onChange={(e) => {
                  const employee = employees.find((item) => item.id === e.target.value);
                  setForm((f) => (employee ? { ...f, employeeId: employee.id, name: employee.name, email: employee.email } : { ...f, employeeId: null }));
                }}
              >
                <option value="">Not linked</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employeeCode})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Full name" htmlFor="invite-name">
            <Input id="invite-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Work email" htmlFor="invite-email">
            <Input id="invite-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Access role" htmlFor="invite-role">
            <select id="invite-role" className={selectClass} value={form.accessRole} onChange={(e) => setForm({ ...form, accessRole: e.target.value as AccessRole })}>
              {accessRoles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ account, busy, onClose, onSave }: { account: Account; busy: boolean; onClose: () => void; onSave: (role: AccessRole) => void }) {
  const [role, setRole] = useState<AccessRole>(account.accessRole);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change access role</DialogTitle>
          <DialogDescription>{account.name}. This changes what they can see and do in BICMAS.</DialogDescription>
        </DialogHeader>
        <Field label="Access role" htmlFor="change-role">
          <select id="change-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AccessRole)}>
            {accessRoles.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => onSave(role)}>
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmailDialog({ account, busy, onClose, onSave }: { account: Account; busy: boolean; onClose: () => void; onSave: (email: string) => void }) {
  const [email, setEmail] = useState(account.email);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct email</DialogTitle>
          <DialogDescription>{account.name}. The old code stops working and you get a new one.</DialogDescription>
        </DialogHeader>
        <Field label="Work email" htmlFor="correct-email">
          <Input id="correct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !EMAIL.test(email.trim())} onClick={() => onSave(email)}>
            Save email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
