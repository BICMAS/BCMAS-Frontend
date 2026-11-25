"use client";

import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { MatchCards } from "@/features/capability/components/results";
import { PriorityBadge, StageBadge } from "@/features/capability/components/shared";
import { latestResults, levelLabel, reviewQueue, stageOf } from "@/features/capability/services/capability";
import { verifiedLevel } from "@/features/capability/services/scoring";
import { useCapabilityUser } from "@/features/capability/use-capability";
import { getTeamMember } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

export function MemberDetailView({ memberId }: { memberId: string }) {
  const member = getTeamMember(memberId);
  const user = useCapabilityUser();
  if (!member) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">This person is not on your direct team.</p>
        <Link href="/manager/team" className="text-sm font-bold text-navy">
          Back to the directory
        </Link>
      </div>
    );
  }

  const results = user ? latestResults(user).find((a) => a.employeeName === member.name) : undefined;
  const current = user ? reviewQueue(user).find((a) => a.employeeName === member.name) : undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">Capability Analysis</p>
        }
        title={member.name}
        description={`${member.title} · ${member.dept}`}
      />
      {current ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-slate bg-white p-5" aria-label="Current cycle">
          <div className="space-y-1">
            <h2 className="font-bold text-navy">Current cycle</h2>
            <StageBadge stage={stageOf(current)} />
          </div>
          <Link href={`/verification/evidence/${current.id}`} className={cn(buttonVariants())}>
            {current.submittedAt ? "Verify Capability" : "View progress"}
          </Link>
        </section>
      ) : null}
      {results ? (
        <>
          <MatchCards items={results.items} />
          <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Latest results">
            <h2 className="font-bold text-navy">Latest released results</h2>
            <ul className="mt-3 divide-y divide-border-slate text-sm">
              {results.items.map((item) => (
                <li key={item.skillId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-semibold text-navy">{item.name}</span>
                  <span className="text-slate-600">
                    {levelLabel(verifiedLevel(item))} of {item.required}
                  </span>
                  <PriorityBadge item={item} />
                </li>
              ))}
            </ul>
            <Link href={`/verification/evidence/${results.id}`} className="mt-3 inline-block text-xs font-bold text-navy underline">
              View Evidence
            </Link>
          </section>
        </>
      ) : (
        <p className="text-sm text-slate-500">No released results yet.</p>
      )}
      <section className="rounded-2xl border border-border-slate bg-white p-5">
        <h2 className="text-sm font-bold tracking-wider text-navy uppercase">AI Recommendations</h2>
        <div className="mt-4">
          <Badge variant="info">In Progress</Badge>
          <p className="mt-2 font-bold text-navy">API Governance Level 4</p>
          <p className="text-sm text-slate-500">Objective: Master standards. 40%</p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100">
            <div className="h-full w-[40%] rounded-full bg-green-lime" />
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">Upcoming · Stakeholder Influence</p>
      </section>
    </div>
  );
}
