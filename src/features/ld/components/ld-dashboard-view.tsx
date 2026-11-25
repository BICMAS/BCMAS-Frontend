"use client";

import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { improvements, teamReport } from "@/features/capability/services/analytics";
import { PRIORITY_LABEL } from "@/features/capability/types";
import { WithCapabilityUser } from "@/features/capability/use-capability";
import { DepartmentPerformanceChart } from "@/features/ld/components/department-performance-chart";
import { trainingPlanRows } from "@/features/ld/training-plan-data";
import { cn } from "@/lib/utils";

/** Development overview: capability figures from released results, training from the Training Plan. */
export function LdDashboardView() {
  return (
    <WithCapabilityUser>
      {(user) => {
        const report = teamReport(user);
        const progress = improvements(user);
        const gaps = report.skills.filter((s) => s.averageGap > 0);
        const allocated = trainingPlanRows.filter((r) => r.intervention);
        return (
          <div className="mx-auto max-w-6xl space-y-8">
            <PageHeader
              title="Capability Development Dashboard"
              description="Verified capability gaps, improvement between cycles and allocated training."
              actions={
                <Link href="/training-plan" className={cn(buttonVariants({ variant: "secondary" }))}>
                  Training Plan
                </Link>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Average capability match", report.averageMatch === null ? "—" : `${report.averageMatch}%`, `${report.people} with released results`],
                ["Skills with a gap", String(gaps.length), `${gaps.filter((g) => g.priority === "critical").length} critical`],
                ["Gaps closed", progress.compared ? String(progress.gapsClosed) : "—", `${progress.compared} compared with their last cycle`],
                ["Training allocated", String(allocated.length), `of ${trainingPlanRows.length} planned needs`],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
                  <p className="text-xs text-slate-500">{note}</p>
                </div>
              ))}
            </div>
            <DepartmentPerformanceChart />
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
                <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Largest gaps</h2>
                <ul className="mt-3 divide-y divide-border-slate text-sm">
                  {gaps.slice(0, 5).map((s) => (
                    <li key={s.skill} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="font-semibold text-navy">{s.skill}</span>
                      <span className="text-slate-600">
                        {s.affected.length} of {s.people} affected
                      </span>
                      <Badge variant={s.priority === "critical" ? "error" : "warning"}>{PRIORITY_LABEL[s.priority]}</Badge>
                    </li>
                  ))}
                  {gaps.length ? null : <li className="py-2 text-slate-500">No gaps in released results.</li>}
                </ul>
              </section>
              <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
                <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Verified Improvements</h2>
                <ul className="mt-3 divide-y divide-border-slate text-sm">
                  {progress.list.map((i) => (
                    <li key={`${i.name}-${i.skill}`} className="py-2 text-navy">
                      <span className="font-semibold">{i.name}</span>: {i.skill}, Level {i.from} to {i.to}
                    </li>
                  ))}
                  {progress.list.length ? null : (
                    <li className="py-2 text-slate-500">Shown when someone has released results in two cycles.</li>
                  )}
                </ul>
              </section>
            </div>
            <section className="overflow-x-auto rounded-xl border border-border-slate bg-white shadow-sm">
              <h2 className="border-b border-border-slate px-6 py-4 text-sm font-bold tracking-wider text-navy uppercase">Allocated training</h2>
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  <tr>
                    {["Employee", "Skill", "Training", "Status"].map((h) => (
                      <th key={h} className="px-6 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allocated.map((r) => (
                    <tr key={r.id} className="border-t border-border-slate">
                      <td className="px-6 py-3 font-bold text-navy">{r.employeeName}</td>
                      <td className="px-6 py-3">{r.skillGap}</td>
                      <td className="px-6 py-3 text-slate-600">{r.intervention}</td>
                      <td className="px-6 py-3">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        );
      }}
    </WithCapabilityUser>
  );
}
