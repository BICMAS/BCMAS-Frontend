"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  getCoachMetrics,
  listScenarios,
  listSessions,
} from "@/features/ai-coach/services/mock-coach";
import type { CoachSession } from "@/features/ai-coach/types";
import { cn } from "@/lib/utils";

export function CoachOverviewView() {
  const router = useRouter();
  const metrics = getCoachMetrics();
  const recommended = listScenarios().slice(0, 2);
  const [sessions] = useState(() => listSessions());

  const columns = useMemo<DataTableColumn<CoachSession>[]>(
    () => [
      {
        id: "title",
        header: "Scenario",
        cell: (row) => <span className="font-bold text-navy">{row.title}</span>,
      },
      { id: "date", header: "Date", accessorKey: "date" },
      { id: "duration", header: "Duration", accessorKey: "duration" },
      {
        id: "score",
        header: "Skill Performance",
        cell: (row) => (
          <span className="font-bold text-navy">{row.score ? `${row.score}%` : "—"}</span>
        ),
      },
      {
        id: "result",
        header: "Result",
        cell: (row) => (
          <Badge variant={row.result === "completed" ? "success" : "warning"}>
            {row.result === "completed" ? "Completed" : "In progress"}
          </Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Coaching Dashboard"
        description="Personalized AI simulations designed to build and verify your role-specific capabilities through interactive scenarios."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                toast.message("Coaching settings", {
                  description:
                    "Practice results stay separate from verified capability levels.",
                })
              }
            >
              Coaching Settings
            </Button>
            <Link href="/ai-coach/scenarios" className={cn(buttonVariants())}>
              New Session
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total Sessions", String(metrics.totalSessions), `+${metrics.sessionsThisMonth} this month`],
          ["Skill Gaps Targeted", String(metrics.gapsTargeted), "Across role skills"],
          ["Avg. Performance", `${metrics.averagePerformance}%`, "Completed sessions"],
          ["Time Coached", `${metrics.hoursCoached}h`, "Total runtime"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</p>
            <p className="mt-2 text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-navy">Recommended Simulations</h2>
          <Link href="/ai-coach/scenarios" className="text-xs font-bold text-navy hover:underline">
            View Library
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {recommended.map((scenario) => (
            <article key={scenario.id} className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                {scenario.category === "role" ? "Critical Gap Fix" : "Role Practice"}
              </p>
              <h3 className="mt-2 font-bold text-navy">{scenario.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{scenario.description}</p>
              <p className="mt-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                {scenario.minutes} Mins · {scenario.difficulty}
              </p>
              <Link
                href={`/ai-coach/session/${scenario.id}`}
                className={cn(buttonVariants({ size: "sm" }), "mt-4")}
              >
                Launch Simulation
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border-slate bg-white p-6">
        <h2 className="font-bold text-navy">Coaching Impact Trend</h2>
        <p className="mt-1 text-xs text-slate-500">Confidence score (last 5 sessions)</p>
        <div className="mt-4 flex h-16 items-end gap-2">
          {[68, 74, 80, 86, metrics.averagePerformance].map((value) => (
            <div key={value} className="flex-1 rounded-t bg-green-lime" style={{ height: `${value}%` }} />
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          AI coaching results provide development insights. They do not constitute formal capability verification or competency sign-off.
        </p>
      </section>

      <section>
        <h2 className="mb-4 font-bold text-navy">Recent Sessions</h2>
        <DataTable
          columns={columns}
          data={sessions}
          onRowClick={(row) =>
            router.push(
              row.result === "completed"
                ? `/ai-coach/sessions/${row.id}`
                : `/ai-coach/session/${row.id}`,
            )
          }
          emptyMessage="No coaching sessions yet."
        />
      </section>
    </div>
  );
}
