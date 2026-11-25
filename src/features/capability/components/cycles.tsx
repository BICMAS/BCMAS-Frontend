"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ASSESSMENT_SCOPES, buildSchedule, CYCLE_OPTIONS, ORGANISATION_SCOPE, type CyclesPerYear } from "@/features/ld/assessment-schedule";
import { AssessmentFrequencyPanel } from "@/features/ld/components/assessment-frequency-panel";
import { DepartmentPerformanceChart } from "@/features/ld/components/department-performance-chart";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/types/user";

import {
  activateCycle,
  assessmentsInCycle,
  closeCycle,
  createCapabilityCycle,
  cycleStats,
  getCapabilityCycle,
  listCapabilityCycles,
  recordCalibration,
  releaseResults,
  stageOf,
  type CycleStats,
} from "../services/capability";
import type { CapabilityCycle } from "../types";
import { formatDay, runCapability, WithCapabilityUser } from "../use-capability";
import { StageBadge } from "./shared";

const fieldClass = "mt-1 h-10 w-full rounded-lg border border-border-slate bg-white px-3 text-sm font-normal text-navy";
const labelClass = "block text-xs font-bold text-navy";
const pct = (n: number, total: number) => (total ? Math.round((100 * n) / total) : 0);
const STATUS = { scheduled: "Scheduled", active: "Active Cycle", completed: "Completed" } as const;

export function AssessmentCyclesView() {
  return <WithCapabilityUser>{(user) => <Cycles user={user} />}</WithCapabilityUser>;
}

function Cycles({ user }: { user: MockUser }) {
  // HRBPs see completion rates only; they cannot create, change or chase cycles.
  const viewOnly = user.portal !== "organisation_admin";
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const cycles = listCapabilityCycles(user.organisationId);
  const active = cycles.filter((c) => c.status === "active");
  const others = cycles.filter((c) => c.status !== "active" && c.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        breadcrumbs={<p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">Assessment Hub / Assessment Cycles</p>}
        title="Capability Assessment Cycles"
        description={
          viewOnly
            ? "Monitor completion of the organisation's capability assessment cycles. Cycles are set up by your Organisation Admin."
            : "Manage and monitor organizational capability assessment periods and verification workflows."
        }
        actions={
          viewOnly ? (
            <Badge variant="secondary">View only</Badge>
          ) : (
            <>
              <Link href="/verification" className={cn(buttonVariants({ variant: "secondary" }))}>
                Verification Hub
              </Link>
              <Button type="button" onClick={() => setCreating((v) => !v)}>
                Create New Cycle
              </Button>
            </>
          )
        }
      />
      {creating && !viewOnly ? <CreateCycle user={user} onDone={() => setCreating(false)} /> : null}
      {active.map((cycle) => (
        <ActiveCycle key={cycle.id} user={user} cycle={cycle} viewOnly={viewOnly} />
      ))}
      {active.length ? null : <p className="rounded-2xl border border-dashed border-border-slate p-6 text-sm text-slate-500">No cycle is active.</p>}
      <AssessmentFrequencyPanel readOnly={viewOnly} />
      <DepartmentPerformanceChart />
      <section className="overflow-x-auto rounded-xl border border-border-slate bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border-slate px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Scheduled and past cycles</h2>
          <SearchField value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cycles..." aria-label="Search cycles" containerClassName="sm:max-w-xs" />
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            <tr>
              {["Assessment Cycle", "Scope", "Period", "Status", "Verified", "Open"].map((h) => (
                <th key={h} className="px-6 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {others.map((c) => {
              const s = cycleStats(user, c.id).overall;
              return (
                <tr key={c.id} className="border-t border-border-slate">
                  <td className="px-6 py-4 font-bold text-navy">{c.name}</td>
                  <td className="px-6 py-4 text-slate-500">{c.scope}</td>
                  <td className="px-6 py-4 text-slate-500">
                    {c.period} {c.year}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="secondary">{STATUS[c.status]}</Badge>
                  </td>
                  <td className="px-6 py-4 font-bold">{c.status === "scheduled" ? "—" : `${pct(s.verified, s.total)}%`}</td>
                  <td className="px-6 py-4">
                    <Link href={`/assessments/${c.id}`} className="text-xs font-bold text-navy underline">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {others.length ? null : (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                  No cycles match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function CreateCycle({ user, onDone }: { user: MockUser; onDone: () => void }) {
  const thisYear = new Date().getFullYear();
  const [name, setName] = useState("");
  const [scope, setScope] = useState(ORGANISATION_SCOPE);
  const [year, setYear] = useState(thisYear + 1);
  const [cyclesPerYear, setPerYear] = useState<CyclesPerYear>(2);
  const [number, setNumber] = useState(1);
  return (
    <form
      className="grid gap-4 rounded-2xl border border-border-slate bg-white p-6 sm:grid-cols-2"
      aria-label="Create cycle"
      onSubmit={(e) => {
        e.preventDefault();
        if (runCapability(() => void createCapabilityCycle(user, { name, scope, year, cyclesPerYear, number }), "Cycle scheduled")) onDone();
      }}
    >
      <label className={cn(labelClass, "sm:col-span-2")}>
        Cycle name
        <Input className="mt-1 font-normal" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={labelClass}>
        Scope
        <select className={fieldClass} value={scope} onChange={(e) => setScope(e.target.value)}>
          {ASSESSMENT_SCOPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Year
        <select className={fieldClass} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear, thisYear + 1].map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Cycles a year
        <select
          className={fieldClass}
          value={cyclesPerYear}
          onChange={(e) => {
            setPerYear(Number(e.target.value) as CyclesPerYear);
            setNumber(1);
          }}
        >
          {CYCLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value} ({o.label})
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Period
        <select className={fieldClass} value={number} onChange={(e) => setNumber(Number(e.target.value))}>
          {buildSchedule(cyclesPerYear, year).map((w) => (
            <option key={w.cycle} value={w.cycle}>
              {w.period}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" className="sm:col-span-2 sm:w-fit">
        Save cycle
      </Button>
    </form>
  );
}

function ProgressBar({ stats }: { stats: CycleStats }) {
  const verified = pct(stats.verified, stats.total);
  const self = pct(stats.selfAssessed, stats.total);
  return (
    <div>
      <div className="mb-3 flex justify-between text-sm font-bold text-navy">
        <span>Total Completion Progress</span>
        <span className="text-green-deep">
          {verified + self}% ({stats.verified + stats.selfAssessed} / {stats.total})
        </span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-green-lime" style={{ width: `${self}%` }} />
        <div className="h-full bg-green-deep" style={{ width: `${verified}%` }} />
      </div>
      <p className="mt-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
        Self-Assessed {stats.selfAssessed} · Verified {stats.verified} · Remaining {stats.remaining}
      </p>
    </div>
  );
}

function ActiveCycle({ user, cycle, viewOnly }: { user: MockUser; cycle: CapabilityCycle; viewOnly: boolean }) {
  const stats = cycleStats(user, cycle.id).overall;
  return (
    <section className="space-y-6 rounded-2xl border border-l-4 border-border-slate border-l-green-lime bg-white p-6 shadow-sm" aria-label={cycle.name}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h2 className="flex items-center gap-3 text-xl font-bold text-navy">
            {cycle.name} <Badge variant="success">Active Cycle</Badge>
          </h2>
          <p className="mt-1 text-sm text-slate-500">{cycle.scope}</p>
        </div>
        <dl className="flex gap-8 text-sm">
          {[
            ["Self-assessment ends", cycle.endsOn],
            ["Verification deadline", cycle.verifyBy],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="font-bold text-navy">{value ? formatDay(value) : "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
      <ProgressBar stats={stats} />
      <div className="flex flex-wrap justify-end gap-3">
        {viewOnly ? null : (
          <Button
            type="button"
            variant="secondary"
            disabled={!stats.remaining}
            onClick={() => toast.success(`Reminders queued for ${stats.remaining} employee${stats.remaining === 1 ? "" : "s"}.`)}
          >
            Send Reminders
          </Button>
        )}
        <Link href={`/assessments/${cycle.id}`} className={cn(buttonVariants())}>
          View Cycle Dashboard
        </Link>
      </div>
    </section>
  );
}

/* ── One cycle ────────────────────────────────────────────────────────── */

export function CycleDashboardView({ cycleId }: { cycleId: string }) {
  return <WithCapabilityUser>{(user) => <CycleDashboard user={user} cycleId={cycleId} />}</WithCapabilityUser>;
}

function CycleDashboard({ user, cycleId }: { user: MockUser; cycleId: string }) {
  const admin = user.portal === "organisation_admin";
  const cycle = admin || user.portal === "hr_ld_admin" ? getCapabilityCycle(user.organisationId, cycleId) : null;
  if (!cycle) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">This cycle is not available to you.</p>
        <Link href="/assessments/cycles" className="text-sm font-bold text-navy">
          Back to cycles
        </Link>
      </div>
    );
  }
  const list = assessmentsInCycle(user, cycle.id);
  const { overall, byDepartment, byReviewer } = cycleStats(user, cycle.id);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={cycle.name}
        description={`${cycle.scope} · ${cycle.period} ${cycle.year} · verification due ${cycle.verifyBy ? formatDay(cycle.verifyBy) : cycle.verificationDeadline}`}
        actions={<Badge variant={cycle.status === "active" ? "success" : "secondary"}>{STATUS[cycle.status]}</Badge>}
      />
      {cycle.status === "scheduled" ? (
        admin ? <Activate user={user} cycle={cycle} /> : <p className="text-sm text-slate-500">This cycle has not started.</p>
      ) : (
        <>
          <section className="rounded-2xl border border-border-slate bg-white p-6">
            <ProgressBar stats={overall} />
          </section>
          <StatsTable title="By department" rows={byDepartment} />
          <StatsTable title="By reviewer (for calibration)" rows={byReviewer} />
          {admin ? <CalibrateAndRelease user={user} cycle={cycle} /> : null}
          <section className="rounded-2xl border border-border-slate bg-white p-6" aria-label="People">
            <h2 className="font-bold text-navy">People</h2>
            <ul className="mt-3 divide-y divide-border-slate text-sm">
              {list.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  {admin ? (
                    <Link href={`/verification/evidence/${a.id}`} className="font-bold text-navy underline">
                      {a.employeeName}
                    </Link>
                  ) : (
                    <span className="font-bold text-navy">{a.employeeName}</span>
                  )}
                  <span className="text-slate-500">
                    {a.roleTitle} · {a.reviewer.name}
                  </span>
                  <StageBadge stage={stageOf(a)} />
                </li>
              ))}
            </ul>
            {cycle.excluded.length ? (
              <>
                <h3 className="mt-4 text-sm font-bold text-navy">Not assessed</h3>
                <ul className="mt-1 text-sm text-slate-500">
                  {cycle.excluded.map((x) => (
                    <li key={x.name}>
                      {x.name}: {x.reason}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function StatsTable({ title, rows }: { title: string; rows: Array<CycleStats & { name: string }> }) {
  return (
    <section className="overflow-x-auto rounded-2xl border border-border-slate bg-white p-6">
      <h2 className="font-bold text-navy">{title}</h2>
      <table className="mt-3 w-full text-left text-sm" aria-label={title}>
        <thead className="text-xs text-slate-500">
          <tr>
            {["", "People", "Submitted", "Verified", "Remaining", "Avg. days to decide", "Self-rating minus verified", "Skills met", "Gaps closed", "Late decisions"].map((h) => (
              <th key={h || "name"} className="py-2 pr-4">
                {h || <span className="sr-only">Name</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border-slate">
              <td className="py-2 pr-4 font-bold text-navy">{r.name}</td>
              <td>{r.total}</td>
              <td>{r.selfAssessed}</td>
              <td>{r.verified}</td>
              <td>{r.remaining}</td>
              <td>{r.averageDays ?? "—"}</td>
              <td>{r.selfVsVerified === null ? "—" : `${r.selfVsVerified > 0 ? "+" : ""}${r.selfVsVerified}`}</td>
              <td>{r.skillsMetPct === null ? "—" : `${r.skillsMetPct}%`}</td>
              <td>{r.gapsClosed}</td>
              <td>{r.lateDecisions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Activate({ user, cycle }: { user: MockUser; cycle: CapabilityCycle }) {
  const [dates, setDates] = useState({ startsOn: "", endsOn: "", verifyBy: "" });
  return (
    <form
      className="space-y-4 rounded-2xl border border-border-slate bg-white p-6"
      aria-label="Activate cycle"
      onSubmit={(e) => {
        e.preventDefault();
        runCapability(() => void activateCycle(user, cycle.id, dates), "Cycle activated");
      }}
    >
      <h2 className="font-bold text-navy">Activate this cycle</h2>
      <p className="text-sm text-slate-500">
        Confirm the exact dates. Employees with an approved role mapping and role profile are assessed; everyone else is listed with the reason.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["startsOn", "Start date"],
            ["endsOn", "Self-assessment ends"],
            ["verifyBy", "Verification deadline"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className={labelClass}>
            {label}
            <Input type="date" className="mt-1 font-normal" value={dates[key]} onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))} />
          </label>
        ))}
      </div>
      <Button type="submit">Activate cycle</Button>
    </form>
  );
}

function CalibrateAndRelease({ user, cycle }: { user: MockUser; cycle: CapabilityCycle }) {
  const [note, setNote] = useState("");
  return (
    <section className="space-y-4 rounded-2xl border border-border-slate bg-white p-6" aria-label="Calibration and release">
      <h2 className="font-bold text-navy">Calibration and release</h2>
      {cycle.calibration ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          {cycle.calibration.by}, {formatDay(cycle.calibration.at)}: {cycle.calibration.note}
        </p>
      ) : null}
      {cycle.status === "active" ? (
        <>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (runCapability(() => recordCalibration(user, cycle.id, note), "Calibration recorded")) setNote("");
            }}
          >
            <label className={labelClass}>
              Compare a sample of decisions between reviewers of similar roles, then record what was agreed
              <Textarea className="mt-1 font-normal" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <Button type="submit" variant="secondary" disabled={note.trim().length < 15}>
              Record calibration
            </Button>
          </form>
          <p className="text-sm text-slate-500">
            Releasing makes results final for everyone whose skills have all been decided. A skill still waiting for evidence shows as not verified.
          </p>
          <div className="flex gap-2">
            <Button type="button" disabled={!cycle.calibration} onClick={() => runCapability(() => void releaseResults(user, cycle.id), "Results released")}>
              Release results
            </Button>
            <Button type="button" variant="ghost" onClick={() => runCapability(() => closeCycle(user, cycle.id), "Cycle closed")}>
              Close cycle
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
