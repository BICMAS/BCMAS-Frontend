"use client";

import Link from "next/link";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { teamMembers } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

const gaps = [
  ["AI Governance", "-1.8 Levels", "8 Members", "Critical"],
  ["Cyber Security Ops", "-0.9 Levels", "5 Members", "High"],
  ["Stakeholder Mgmt", "-0.7 Levels", "4 Members", "High"],
];

export function TeamDashboardView() {
  const james = teamMembers[0];
  const sarah = teamMembers[1];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Manager Hub / Team Dashboard
          </p>
        }
        title="IT Infrastructure Team"
        description="Aggregate capability profile, skill gaps, and active development monitoring for your direct reports."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const blob = new Blob(["IT Infrastructure Team\nSize 12\nMatch 84%\n"], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "team-report.txt";
                anchor.click();
                URL.revokeObjectURL(url);
                toast.success("Team report exported");
              }}
            >
              Export Team Report
            </Button>
            <Link href="/manager/team" className={cn(buttonVariants())}>
              New Team Review
            </Link>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Team Size", "12", "Direct Reports"],
          ["Avg. Team Match", "84%", "Verified"],
          ["Evidence Review", "8", "Action"],
          ["Growth Velocity", "+1.2", "Levels / Year"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-border-slate bg-white p-6">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
            <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
            <p className="text-[10px] text-slate-400">{note}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border-slate bg-white p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy">Critical Team Skill Gaps</h2>
            <Link href="/insights/gaps" className="text-[10px] font-bold tracking-widest text-navy uppercase">
              Full Gap Analysis
            </Link>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <tr>
                {["Skill Domain", "Avg. Gap", "Impacted", "Priority"].map((heading) => (
                  <th key={heading} className="py-2">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gaps.map(([skill, gap, impact, priority]) => (
                <tr key={skill} className="border-t border-border-slate">
                  <td className="py-3 font-bold text-navy">{skill}</td>
                  <td>{gap}</td>
                  <td>{impact}</td>
                  <td>
                    <Badge variant={priority === "Critical" ? "error" : "warning"}>{priority}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-2xl border border-border-slate bg-white p-6">
          <h2 className="text-xs font-bold tracking-wider text-navy uppercase">Evidence Queue · 8 New</h2>
          <div className="mt-4 space-y-4">
            {james ? (
              <Link href="/verification/evidence/evidence-james" className="block">
                <p className="text-xs font-bold text-navy">{james.name}</p>
                <p className="text-xs text-slate-500">Cloud Infrastructure</p>
              </Link>
            ) : null}
            {sarah ? (
              <Link href="/manager/team/sarah-connor" className="block">
                <p className="text-xs font-bold text-navy">{sarah.name}</p>
                <p className="text-xs text-slate-500">AI Governance</p>
              </Link>
            ) : null}
          </div>
          <Link href="/verification/team" className="mt-6 block text-center text-[10px] font-bold tracking-widest text-navy uppercase">
            View All Evidence
          </Link>
        </section>
      </div>
      <section className="rounded-2xl border border-border-slate bg-white p-6">
        <h2 className="mb-4 text-sm font-bold tracking-wider text-navy uppercase">Recent Team Progress</h2>
        <div className="space-y-4 text-sm text-navy">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="font-bold">James Miller</span> advanced to Level 4 (Expert) in Cloud Solution Design.
              <span className="block text-xs text-slate-400">Verified by you · 2 hours ago</span>
            </p>
            <Link href="/manager/team/james" className="text-[10px] font-bold tracking-widest uppercase">
              Feedback
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="font-bold">Robert Chen</span> completed the Advanced AI Ethics learning pathway.
              <span className="block text-xs text-slate-400">Ready for verification · Yesterday</span>
            </p>
            <Link href="/verification/team" className="text-[10px] font-bold tracking-widest uppercase">
              Review
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
