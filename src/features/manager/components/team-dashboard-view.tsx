"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { managerActions } from "@/features/manager/team-data";
import { reviewQueue } from "@/features/capability/services/capability";
import { useCapabilityUser } from "@/features/capability/use-capability";
import { cn } from "@/lib/utils";

const gaps = [
  ["AI Governance", "-1.8 Levels", "8 Members", "Critical"],
  ["Cyber Security Ops", "-0.9 Levels", "5 Members", "High"],
  ["Stakeholder Mgmt", "-0.7 Levels", "4 Members", "High"],
];

const summary = [
  { label: "Team Size", value: "12", note: "Direct Reports", href: "/manager/team" },
  { label: "Average Capability Score", value: "84%", note: "Verified", href: "/insights/gaps" },
  { label: "Pending Verification", value: "8", note: "Action", href: "/verification/team" },
  { label: "Growth Velocity", value: "+1.2", note: "Levels / Year", href: "/insights/gaps" },
];

export function TeamDashboardView() {
  const router = useRouter();
  const user = useCapabilityUser();
  const waiting = (user ? reviewQueue(user) : []).filter((a) => a.submittedAt && !a.releasedAt && a.items.some((i) => !i.verification));

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
                const blob = new Blob(["IT Infrastructure Team\nSize 12\nAverage Capability Score 84%\n"], {
                  type: "text/plain",
                });
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
        {summary.map(({ label, value, note, href }) => ({ label, note, href, value: label === "Pending Verification" ? String(waiting.length) : value })).map(({ label, value, note, href }) => (
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
              {gaps.map(([skill, gap, impact, priority]) => {
                const href = `/manager/team?gap=${encodeURIComponent(skill!)}`;
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
                    <td>{gap}</td>
                    <td>{impact}</td>
                    <td>
                      <Badge variant={priority === "Critical" ? "error" : "warning"}>{priority}</Badge>
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
        <div className="space-y-4 text-sm text-navy">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="font-bold">James Miller</span> advanced to Level 4 – Advanced in Cloud Solution Design.
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
