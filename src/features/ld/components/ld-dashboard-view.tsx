"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { avatar } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

const months = [
  { label: "Jan", base: 30, lift: 20 },
  { label: "Feb", base: 35, lift: 25 },
  { label: "Mar", base: 45, lift: 35 },
  { label: "Apr", base: 42, lift: 38 },
  { label: "May", base: 55, lift: 48 },
  { label: "Jun", base: 65, lift: 60 },
  { label: "Jul", base: 58, lift: 50 },
  { label: "Aug", base: 62, lift: 55 },
  { label: "Sep", base: 70, lift: 62 },
  { label: "Oct", base: 74, lift: 66 },
  { label: "Nov", base: 78, lift: 70 },
  { label: "Dec", base: 82, lift: 74 },
];

const assignments = [
  {
    id: "plan-james-ai",
    name: "James Miller",
    avatarUrl: avatar(2),
    domain: "AI Governance",
    objective: "Achieve Level 4 Proficiency",
    evidence: "Pending Review",
    due: "15 Nov 2024",
    status: "In Progress",
  },
  {
    id: "plan-robert-infra",
    name: "Robert Chen",
    avatarUrl: avatar(3),
    domain: "Infrastructure Design",
    objective: "Mentoring 2 Junior Engineers",
    evidence: "Complete",
    due: "20 Dec 2024",
    status: "Verifying",
  },
];

export function LdDashboardView() {
  const [range, setRange] = useState<"6" | "12">("12");
  const bars = range === "6" ? months.slice(0, 6) : months;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Growth Hub / Dashboard
          </p>
        }
        title="Capability Development Dashboard"
        description="Tracking organizational ROI through skill gap closure, active development pathways, and reassessment outcomes."
        actions={
          <>
            <Link href="/insights/learning" className={cn(buttonVariants({ variant: "secondary" }))}>
              Growth Reports
            </Link>
            <Button
              type="button"
              onClick={() =>
                toast.success("Development plan queued", {
                  description: "Open James Miller's pathway to assign the next objective.",
                })
              }
            >
              Assign Development Plan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active Growth Plans", "1,842", "75% Coverage"],
          ["Gaps Being Targeted", "428", "Unique skill sets"],
          ["Avg. Gap Closure Velocity", "+0.8", "Levels / Year"],
          ["Capability ROI", "92%", "Verified impact"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p className={cn("text-3xl font-bold", label.includes("Velocity") ? "text-green-deep" : "text-navy")}>
                {value}
              </p>
              <span className="text-[10px] font-bold text-slate-400">{note}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-8 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy">Capability Growth Velocity</h2>
              <p className="mt-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                Aggregate improvement across key skill domains
              </p>
            </div>
            <div className="flex gap-2">
              {(["6", "12"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "rounded px-3 py-1 text-[10px] font-bold uppercase",
                    range === value ? "bg-navy text-white" : "border border-border-slate bg-slate-50 text-slate-500",
                  )}
                  onClick={() => setRange(value)}
                >
                  {value} Months
                </button>
              ))}
            </div>
          </div>
          <div className="flex h-56 items-end gap-2">
            {bars.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="relative h-44 w-full">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t bg-navy/10"
                    style={{ height: `${bar.base}%` }}
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t bg-green-lime"
                    style={{ height: `${bar.lift}%` }}
                  />
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">{bar.label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-sm font-bold tracking-wider text-navy uppercase">Strategic Focus Skills</h2>
            {[
              ["AI Governance", "42 Plans", "42%", "bg-amber-400"],
              ["Cloud Architecture", "128 Plans", "85%", "bg-green-lime"],
              ["Strategic Influence", "84 Plans", "65%", "bg-blue-500"],
            ].map(([name, count, width, color]) => (
              <div key={name} className="mb-5">
                <div className="mb-2 flex justify-between text-xs font-bold text-navy">
                  <span>{name}</span>
                  <span className="text-[10px] text-slate-500">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", color)} style={{ width }} />
                </div>
              </div>
            ))}
          </section>
          <section className="rounded-2xl bg-navy p-6 text-white shadow-xl">
            <h2 className="mb-4 text-xs font-bold tracking-widest uppercase opacity-60">Verified Improvements</h2>
            {[
              [avatar(2), "James Miller", "Level 3 → Level 4 (Expert)"],
              [avatar(5), "Sarah Connor", "Foundation → Developing"],
            ].map(([src, name, note]) => (
              <div key={name} className="mb-4 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-8 rounded-full border border-white/20 object-cover" />
                <div>
                  <p className="text-xs font-bold">{name}</p>
                  <p className="text-[10px] text-green-lime">{note}</p>
                </div>
              </div>
            ))}
            <Link
              href="/verification/results"
              className="mt-2 block rounded-lg bg-white/10 py-2 text-center text-[10px] font-bold tracking-widest uppercase hover:bg-white/20"
            >
              View All Successes
            </Link>
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-border-slate bg-slate-50/50 px-6 py-4">
          <h2 className="text-sm font-bold tracking-wider text-navy uppercase">High-Impact Learning Assignments</h2>
          <Link href="/ld/team-matrix" className="text-[10px] font-bold tracking-widest text-navy uppercase">
            Manage All Plans
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <tr>
                {["Employee", "Skill Domain", "Development Objective", "Practice Evidence", "Due Date", "Status"].map(
                  (heading) => (
                    <th key={heading} className="px-6 py-3">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {assignments.map((row) => (
                <tr key={row.id} className="border-t border-border-slate">
                  <td className="px-6 py-4">
                    <Link href={`/growth/${row.id}`} className="flex items-center gap-3 font-bold text-navy">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">{row.domain}</td>
                  <td className="px-6 py-4 text-slate-500">{row.objective}</td>
                  <td className="px-6 py-4">
                    <Badge variant={row.evidence === "Complete" ? "success" : "warning"}>{row.evidence}</Badge>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400">{row.due}</td>
                  <td className="px-6 py-4">
                    <Badge variant={row.status === "Verifying" ? "success" : "info"}>{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
