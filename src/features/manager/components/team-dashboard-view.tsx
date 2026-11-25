"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { managerActions } from "@/features/manager/team-data";
import { improvements, teamReport } from "@/features/capability/services/analytics";
import { reviewQueue } from "@/features/capability/services/capability";
import { PRIORITY_LABEL } from "@/features/capability/types";
import { downloadText, useCapabilityUser } from "@/features/capability/use-capability";
import { teamMembers } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

export function TeamDashboardView() {
  const router = useRouter();
  const user = useCapabilityUser();
  const waiting = (user ? reviewQueue(user) : []).filter((a) => a.submittedAt && !a.releasedAt && a.items.some((i) => !i.verification));
  const report = user ? teamReport(user) : null;
  const progress = user ? improvements(user) : null;
  const gaps = (report?.skills ?? []).filter((s) => s.averageGap > 0).slice(0, 4);
  const score = report?.averageMatch == null ? "—" : `${report.averageMatch}%`;
  const summary = [
    { label: "Team Size", value: String(teamMembers.length), note: "Direct Reports", href: "/manager/team" },
    { label: "Average Capability Score", value: score, note: `Verified · ${report?.people ?? 0} with results`, href: "/insights/gaps" },
    { label: "Pending Verification", value: String(waiting.length), note: "Action", href: "/verification/team" },
    {
      label: "Skills Improved",
      value: progress?.compared ? String(progress.list.length) : "—",
      note: "Since the last cycle",
      href: "/insights/gaps",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Manager Hub / Team Dashboard
          </p>
        }
        title="IT Infrastructure Team"
        description="Monitor your team's capabilities, identify skill gaps and drive employee development."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                downloadText("team-report.txt", [
                  "IT Infrastructure Team",
                  `Average capability score ${score} (${report?.people ?? 0} with results)`,
                  ...gaps.map((g) => `${g.skill}: average gap ${g.averageGap}, ${g.affected.length} of ${g.people} affected`),
                ]);
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
        {summary.map(({ label, value, note, href }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-2xl border border-border-slate bg-white p-6 transition hover:border-navy hover:shadow-sm focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none"
          >
            <p className="flex items-center justify-between text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              {label}
              <ChevronRightIcon className="size-3.5 text-slate-300 transition group-hover:text-navy" aria-hidden />
            </p>
            <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
            <p className="text-[10px] text-slate-400">{note}</p>
          </Link>
        ))}
      </div>
      <section className="rounded-2xl border border-border-slate bg-white p-6">
        <h2 className="text-lg font-bold text-navy">Manager Action Centre</h2>
        <p className="mt-1 text-sm text-slate-500">Pending actions that need your attention.</p>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            <tr>
              <th className="py-2">Action Required</th>
              <th className="py-2">Pending</th>
              <th className="py-2">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {managerActions.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-t border-border-slate hover:bg-slate-50"
                onClick={() => router.push(item.href)}
              >
                <td className="py-3 font-bold text-navy">
                  <Link href={item.href} className="hover:underline">
                    {item.action}
                  </Link>
                </td>
                <td className="text-slate-600">
                  {item.id === "verify" ? `${waiting.length} submission${waiting.length === 1 ? "" : "s"} awaiting review` : item.detail}
                </td>
                <td className="text-right">
                  <ChevronRightIcon className="ml-auto size-4 text-slate-400" aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
                {["Skill/Competency", "Avg. Proficiency Gap", "Employees Affected", "Developmental Priority"].map(
                  (heading) => (
                    <th key={heading} className="py-2">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {gaps.map(({ skill, averageGap, affected, people, priority }) => {
                const href = `/manager/team?gap=${encodeURIComponent(skill)}`;
                return (
                  <tr
                    key={skill}
                    className="cursor-pointer border-t border-border-slate hover:bg-slate-50"
                    onClick={() => router.push(href)}
                  >
                    <td className="py-3 font-bold text-navy">
                      <Link href={href} className="hover:underline">
                        {skill}
                      </Link>
                    </td>
                    <td>
                      {averageGap} level{averageGap === 1 ? "" : "s"}
                    </td>
                    <td>
                      {affected.length} of {people}
                    </td>
                    <td>
                      <Badge variant={priority === "critical" ? "error" : "warning"}>{PRIORITY_LABEL[priority]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="rounded-2xl border border-border-slate bg-white p-6">
          <h2 className="text-xs font-bold tracking-wider text-navy uppercase">Pending Capability Verification · {waiting.length} New</h2>
          <div className="mt-4 space-y-4">
            {waiting.map((a) => (
              <Link key={a.id} href={`/verification/evidence/${a.id}`} className="block">
                <p className="text-xs font-bold text-navy">{a.employeeName}</p>
                <p className="text-xs text-slate-500">{a.items.filter((i) => !i.verification).length} skills to decide</p>
              </Link>
            ))}
          </div>
          <Link href="/verification/team" className="mt-6 block text-center text-[10px] font-bold tracking-widest text-navy uppercase">
            View All Evidence
          </Link>
        </section>
      </div>
      <section className="rounded-2xl border border-border-slate bg-white p-6">
        <h2 className="mb-4 text-sm font-bold tracking-wider text-navy uppercase">Recent Team Progress</h2>
        {progress?.list.length ? (
          <ul className="space-y-2 text-sm text-navy">
            {progress.list.map((i) => (
              <li key={`${i.name}-${i.skill}`}>
                <span className="font-bold">{i.name}</span> moved from Level {i.from} to Level {i.to} in {i.skill}.
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Shown when a team member has released results in two cycles.</p>
        )}
      </section>
    </div>
  );
}
