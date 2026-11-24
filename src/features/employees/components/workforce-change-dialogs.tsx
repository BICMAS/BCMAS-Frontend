"use client";

import { useState } from "react";
import { CheckIcon, DownloadIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  approvalBlocker,
  EMPLOYEE_TEMPLATE_COLUMNS,
  type PendingChange,
  type RemovalReason,
  useMappingApprovals,
} from "@/features/employees/services/mapping-approvals";
import type { BulkMappingRow, MappingRoleOption } from "@/features/employees/types";
import { downloadWorkbook, readSpreadsheetRows } from "@/lib/spreadsheet";
import type { MockUser } from "@/types/user";

type Submitter = { id: string; name: string } | null;

const fieldClass = "mb-1 block text-xs font-bold tracking-wider text-slate-500 uppercase";
const selectClass =
  "h-10 w-full rounded-lg border border-border-slate bg-white px-3 text-sm text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

/** Initials avatar generated locally (no third-party image service sees employee names). */
export function initialsAvatar(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="#0f2a4a"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="15" font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ── Bulk upload ─────────────────────────────────────────────────────────────

export function BulkUploadDialog({
  open,
  onOpenChange,
  roles,
  submitter,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: MappingRoleOption[];
  submitter: Submitter;
  onSubmitted: (count: number) => void;
}) {
  const submit = useMappingApprovals((s) => s.submit);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () =>
    downloadWorkbook({
      filename: "bcms-employee-upload-template.xlsx",
      sheetName: "Employees",
      columns: EMPLOYEE_TEMPLATE_COLUMNS.map((c) => ({
        header: c.header,
        width: 28,
        value: (row: Record<string, string>) => row[c.key],
      })),
      rows: [Object.fromEntries(EMPLOYEE_TEMPLATE_COLUMNS.map((c) => [c.key, c.example]))],
    });

  const onFile = async (file: File) => {
    setBusy(true);
    setErrors([]);
    try {
      const records = await readSpreadsheetRows(file);
      const problems: string[] = [];
      if (records.length === 0) problems.push("The file has no employee rows.");
      const missingColumns = EMPLOYEE_TEMPLATE_COLUMNS.filter(
        (c) => c.required && records.length > 0 && !(c.key in records[0]!),
      ).map((c) => c.header);
      if (missingColumns.length) problems.push(`Missing columns: ${missingColumns.join(", ")}. Use the template.`);
      const roleByTitle = new Map(roles.map((r) => [r.title.toLowerCase(), r]));
      records.forEach((record, index) => {
        const line = index + 2;
        for (const column of EMPLOYEE_TEMPLATE_COLUMNS) {
          if (column.required && !record[column.key]) problems.push(`Row ${line}: ${column.header} is empty.`);
        }
        if (record.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) {
          problems.push(`Row ${line}: email "${record.email}" is not valid.`);
        }
        if (record.job_role && !roleByTitle.has(record.job_role.toLowerCase())) {
          problems.push(`Row ${line}: role "${record.job_role}" is not in the Roles Directory.`);
        }
      });
      if (problems.length) {
        setErrors(problems.slice(0, 8).concat(problems.length > 8 ? [`…and ${problems.length - 8} more.`] : []));
        return;
      }
      if (!submitter) return;
      for (const record of records) {
        const role = roleByTitle.get(record.job_role!.toLowerCase())!;
        submit({
          kind: "new_employee",
          employeeId: null,
          employeeName: record.full_name!,
          summary: `Add employee as ${role.title}`,
          submittedBy: submitter,
          payload: {
            employeeCode: record.employee_id,
            email: record.email,
            departmentName: record.department,
            roleId: role.id,
            roleTitle: role.title,
            startDate: record.start_date,
          },
        });
      }
      onSubmitted(records.length);
      onOpenChange(false);
    } catch {
      setErrors(["The file could not be read. Upload the template as .xlsx or .csv."]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setErrors([]);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload</DialogTitle>
          <DialogDescription>
            Upload many employees at once. Every row is validated, then submitted for approval by another
            administrator before it goes live.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-navy">
          <li>
            <span className="font-bold">1. Download the template</span>
            <p className="text-xs text-slate-500">
              Columns: {EMPLOYEE_TEMPLATE_COLUMNS.map((c) => c.header).join(", ")}. Job roles must match the Roles
              Directory.
            </p>
            <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => void downloadTemplate()}>
              <DownloadIcon className="size-4" aria-hidden />
              Download template (.xlsx)
            </Button>
          </li>
          <li>
            <label htmlFor="bulk-upload-file" className="font-bold">
              2. Upload the completed file
            </label>
            <p className="text-xs text-slate-500">Excel (.xlsx) or CSV.</p>
            <input
              id="bulk-upload-file"
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void onFile(file);
              }}
            />
          </li>
        </ol>
        {errors.length ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <p className="font-bold">Fix these issues and upload again:</p>
            <ul className="mt-1 list-disc pl-4">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── Add one employee ────────────────────────────────────────────────────────

export function AddEmployeeDialog({
  open,
  onOpenChange,
  roles,
  departments,
  submitter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: MappingRoleOption[];
  departments: string[];
  submitter: Submitter;
}) {
  const submit = useMappingApprovals((s) => s.submit);
  const empty = { name: "", code: "", email: "", department: departments[0] ?? "", roleId: roles[0]?.id ?? "", start: "" };
  const [form, setForm] = useState(empty);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const valid =
    form.name.trim() && form.code.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) && form.department && form.roleId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setForm(empty);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const role = roles.find((r) => r.id === form.roleId);
            if (!valid || !role || !submitter) return;
            submit({
              kind: "new_employee",
              employeeId: null,
              employeeName: form.name.trim(),
              summary: `Add employee as ${role.title}`,
              submittedBy: submitter,
              payload: {
                employeeCode: form.code.trim(),
                email: form.email.trim(),
                departmentName: form.department,
                roleId: role.id,
                roleTitle: role.title,
                startDate: form.start || undefined,
              },
            });
            toast.success(`${form.name.trim()} submitted for approval`);
            setForm(empty);
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>
              The employee is added once another administrator approves the request.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="new-name" className={fieldClass}>
                Full name
              </label>
              <Input id="new-name" value={form.name} onChange={(e) => set({ name: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="new-code" className={fieldClass}>
                Employee ID
              </label>
              <Input id="new-code" value={form.code} onChange={(e) => set({ code: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="new-email" className={fieldClass}>
                Work email
              </label>
              <Input id="new-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="new-dept" className={fieldClass}>
                Department
              </label>
              <select id="new-dept" className={selectClass} value={form.department} onChange={(e) => set({ department: e.target.value })}>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-role" className={fieldClass}>
                Role
              </label>
              <select id="new-role" className={selectClass} value={form.roleId} onChange={(e) => set({ roleId: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="new-start" className={fieldClass}>
                Start date
              </label>
              <Input id="new-start" type="date" value={form.start} onChange={(e) => set({ start: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="-mx-6 mt-6 -mb-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || !submitter}>
              Submit for approval
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Remove a leaver ─────────────────────────────────────────────────────────

const REMOVAL_REASONS: RemovalReason[] = ["Resigned", "Retired", "Contract ended", "Dismissed", "Transferred out"];

export function RemoveEmployeeDialog({
  row,
  onOpenChange,
  submitter,
}: {
  row: BulkMappingRow | null;
  onOpenChange: (open: boolean) => void;
  submitter: Submitter;
}) {
  const submit = useMappingApprovals((s) => s.submit);
  const [reason, setReason] = useState<RemovalReason>("Resigned");
  const [lastDay, setLastDay] = useState("");

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(next) => {
        if (!next) {
          setReason("Resigned");
          setLastDay("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!row || !lastDay || !submitter) return;
            submit({
              kind: "removal",
              employeeId: row.employeeId,
              employeeName: row.name,
              summary: `Remove: ${reason.toLowerCase()}, last working day ${lastDay}`,
              submittedBy: submitter,
              payload: { reason, lastWorkingDay: lastDay, departmentName: row.departmentName },
            });
            toast.success(`Removal of ${row.name} submitted for approval`);
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Remove {row?.name}</DialogTitle>
            <DialogDescription>
              Use this when an employee leaves the organisation. They are removed from roles and capability
              reporting once another administrator approves the removal.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="remove-reason" className={fieldClass}>
                Reason
              </label>
              <select
                id="remove-reason"
                className={selectClass}
                value={reason}
                onChange={(e) => setReason(e.target.value as RemovalReason)}
              >
                {REMOVAL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="remove-last-day" className={fieldClass}>
                Last working day
              </label>
              <Input id="remove-last-day" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} required />
            </div>
          </div>
          <DialogFooter className="-mx-6 mt-6 -mb-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!lastDay || !submitter}>
              Submit removal for approval
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Approvals ───────────────────────────────────────────────────────────────

const KIND_LABEL: Record<PendingChange["kind"], string> = {
  mapping: "Role assignment",
  new_employee: "New employee",
  removal: "Removal",
};

/** Changes waiting for a second administrator, with approve / reject for eligible reviewers. */
export function PendingApprovalsPanel({
  user,
  onApplied,
}: {
  user: MockUser | null;
  onApplied: (change: PendingChange) => void;
}) {
  const changes = useMappingApprovals((s) => s.changes);
  const decide = useMappingApprovals((s) => s.decide);
  const pending = changes.filter((c) => c.status === "pending");
  if (pending.length === 0) return null;

  const act = (change: PendingChange, decision: "approved" | "rejected") => {
    if (!user) return;
    try {
      const decided = decide(change.id, user, decision);
      if (decision === "approved") onApplied(decided);
      toast.success(`${KIND_LABEL[change.kind]} for ${change.employeeName} ${decision}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the decision.");
    }
  };

  return (
    <section aria-labelledby="pending-approvals" className="rounded-xl border border-border-slate bg-white shadow-sm">
      <div className="border-b border-border-slate px-6 py-4">
        <h2 id="pending-approvals" className="font-bold text-navy">
          Pending approval ({pending.length})
        </h2>
        <p className="text-xs text-slate-500">
          Changes go live only after another Organisation Admin or HRBP approves them.
        </p>
      </div>
      <ul className="divide-y divide-border-slate">
        {pending.map((change) => {
          const blocker = approvalBlocker(change, user);
          return (
            <li key={change.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
              <div>
                <p className="text-sm font-bold text-navy">
                  {change.employeeName}{" "}
                  <Badge variant={change.kind === "removal" ? "error" : "info"} className="ml-1 rounded uppercase">
                    {KIND_LABEL[change.kind]}
                  </Badge>
                </p>
                <p className="text-xs text-slate-500">
                  {change.summary} · Submitted by {change.submittedBy.name}
                </p>
                {blocker ? <p className="mt-1 text-xs text-amber-700">{blocker}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(blocker)}
                  onClick={() => act(change, "rejected")}
                  aria-label={`Reject ${KIND_LABEL[change.kind].toLowerCase()} for ${change.employeeName}`}
                >
                  <XIcon className="size-4" aria-hidden />
                  Reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(blocker)}
                  onClick={() => act(change, "approved")}
                  aria-label={`Approve ${KIND_LABEL[change.kind].toLowerCase()} for ${change.employeeName}`}
                >
                  <CheckIcon className="size-4" aria-hidden />
                  Approve
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
