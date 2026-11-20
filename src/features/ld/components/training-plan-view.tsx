"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TRAINING_PLAN_COLUMNS,
  trainingPlanRows,
  type TrainingStatus,
} from "@/features/ld/training-plan-data";
import { downloadWorkbook } from "@/lib/spreadsheet";

const STATUS_VARIANT: Record<TrainingStatus, "info" | "warning" | "success" | "error"> = {
  Planned: "info",
  "In Progress": "warning",
  Completed: "success",
  Overdue: "error",
};

const selectClass =
  "h-10 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy";

export function TrainingPlanView() {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [exporting, setExporting] = useState(false);

  const departments = useMemo(() => [...new Set(trainingPlanRows.map((r) => r.department))].sort(), []);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trainingPlanRows.filter((r) => {
      if (department !== "all" && r.department !== department) return false;
      if (status === "unallocated" ? r.status !== null : status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return [r.employeeName, r.employeeId, r.skillGap, r.intervention ?? "", r.jobRole].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }, [query, department, status]);

  const employees = new Set(trainingPlanRows.map((r) => r.employeeId)).size;
  const plans = trainingPlanRows.filter((r) => r.intervention).length;
  const awaiting = trainingPlanRows.filter((r) => !r.intervention).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Plan"
        description="Plan, allocate and monitor employee development activities based on identified capability gaps."
        actions={
          <Button
            type="button"
            disabled={exporting || rows.length === 0}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadWorkbook({
                  filename: "bcms-training-plan.xlsx",
                  sheetName: "Training Plan",
                  columns: TRAINING_PLAN_COLUMNS,
                  rows,
                });
                toast.success(`Exported ${rows.length} row(s) to Excel`);
              } catch {
                toast.error("The Excel file could not be created. Please try again.");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <DownloadIcon className="size-4" aria-hidden />}
            Download Excel
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Employees", employees],
          ["Development Plans", plans],
          ["Awaiting Allocation", awaiting],
        ].map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatus(label === "Awaiting Allocation" ? "unallocated" : "all")}
            className="rounded-xl border border-border-slate bg-white p-6 text-left shadow-sm transition hover:border-navy/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          >
            <p className="text-3xl font-bold text-navy">{value}</p>
            <p className="mt-1 text-xs font-bold tracking-wider text-slate-400 uppercase">{label}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border-slate bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <SearchField
          placeholder="Search employee, ID, skill or intervention…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search training plan"
        />
        <select className={selectClass} value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department filter">
          <option value="all">All Departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="all">All Statuses</option>
          {(["Planned", "In Progress", "Completed", "Overdue"] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="unallocated">Awaiting allocation</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-slate bg-white shadow-sm">
        <table className="w-full min-w-[1400px] text-left text-sm">
          <thead className="bg-slate-50/50 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            <tr>
              {TRAINING_PLAN_COLUMNS.map((c) => (
                <th key={c.header} className="px-4 py-3 whitespace-nowrap">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border-slate">
                <td className="px-4 py-3 font-bold whitespace-nowrap text-navy">{r.employeeName}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.employeeId}</td>
                <td className="px-4 py-3">{r.department}</td>
                <td className="px-4 py-3">{r.jobRole}</td>
                <td className="px-4 py-3 font-medium text-navy">{r.skillGap}</td>
                <td className="px-4 py-3 text-center">{r.requiredProficiency}</td>
                <td className="px-4 py-3 text-center">{r.currentProficiency}</td>
                <td className="px-4 py-3">
                  {r.intervention ?? <span className="text-xs font-bold text-amber-600">Awaiting allocation</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{r.format ?? "—"}</td>
                <td className="px-4 py-3">{r.provider ?? "—"}</td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{r.startDate ?? "—"}</td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">{r.completionDate ?? "—"}</td>
                <td className="px-4 py-3">
                  {r.status ? (
                    <Badge variant={STATUS_VARIANT[r.status]} className="rounded uppercase">
                      {r.status}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="rounded uppercase">
                      Unallocated
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={TRAINING_PLAN_COLUMNS.length} className="px-4 py-10 text-center text-sm text-slate-500">
                  No training plan entries match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{rows.length} entries shown · the Excel download includes the rows shown.</p>
    </div>
  );
}
