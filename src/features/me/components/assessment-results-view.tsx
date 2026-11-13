"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { portalSkills } from "@/features/me/data/portal";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/utils";

export function AssessmentResultsView() {
  const firstName = useSessionStore((state) => state.user.name.split(" ")[0]);
  const rows = portalSkills.map((skill) => ({
    ...skill,
    shown: skill.verifiedLevel,
    met: skill.verifiedLevel >= skill.targetLevel,
  }));
  const gaps = rows.filter((row) => !row.met).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy">Great work, {firstName}!</h1>
        <p className="mt-2 text-slate-500">
          Your assessment is submitted. Let&apos;s see how your skills align with
          your current role.
        </p>
      </div>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-navy">Capability Match Analysis</h2>
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border-slate px-4 py-3"
            >
              <div>
                <p className="font-bold text-navy">{row.name}</p>
                <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  {row.group === "technical" ? "Technical" : "Behavioural"}
                </p>
              </div>
              <div className="text-right">
                <Badge variant={row.met ? "success" : "warning"}>
                  {row.met ? "Target Met" : "Level Gap"}
                </Badge>
                <p className="mt-1 text-xs font-bold text-navy">
                  L{row.shown} / L{row.targetLevel}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Why this is a priority</p>
          <p className="mt-1">
            Your current role requires independent governance oversight. Closing
            this gap will unlock critical project ownership opportunities.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-navy p-6 text-white">
          <p className="text-[10px] font-bold tracking-widest uppercase text-white/60">
            Overall Match
          </p>
          <p className="mt-2 text-4xl font-bold">82%</p>
        </div>
        <div className="rounded-2xl border border-border-slate bg-white p-6">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Gaps to Close
          </p>
          <p className="mt-2 text-4xl font-bold text-navy">{gaps}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/me" className={cn(buttonVariants())}>
          Back to home
        </Link>
        <Link href="/me/growth/goal-api" className={cn(buttonVariants({ variant: "secondary" }))}>
          Open growth plan
        </Link>
      </div>
    </div>
  );
}
