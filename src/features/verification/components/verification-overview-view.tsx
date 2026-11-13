"use client";

import Link from "next/link";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { elena, getTeamMember, jamesVerificationStatus } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

const months = [
  { label: "Aug", verified: 40, remaining: 70 },
  { label: "Sep", verified: 55, remaining: 60 },
  { label: "Oct", verified: 68, remaining: 48 },
  { label: "Nov (Live)", verified: 75, remaining: 36 },
];

export function VerificationOverviewView() {
  const james = getTeamMember("james");
  const jamesStatus = jamesVerificationStatus();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Quality Hub / Verification Overview
          </p>
        }
        title="Capability Verification Hub"
        description="Validate organisational capability through evidence-based assessment and manager-led verification plans."
        actions={
          <>
            <Link href="/verification/results" className={cn(buttonVariants({ variant: "secondary" }))}>
              Verification Plans
            </Link>
            <Button
              type="button"
              onClick={() => toast.message("A new verification plan uses the active 2024 Global Capability Review.")}
            >
              Start New Verification
            </Button>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Pending Verification", "124", "Action Required"],
          ["Verified Employees", "1,842", "75% of Total"],
          ["Evidence Awaiting Review", "48", "In queue"],
          ["Remaining Capability Gaps", "312", "Target: -12%"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
            <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
            <p className="text-[10px] font-bold text-slate-400">{note}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border-slate bg-white p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-navy">Verification Velocity</h2>
          <div className="mt-6 flex h-48 items-end gap-4">
            {months.map((month) => (
              <div key={month.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-36 w-full items-end gap-1">
                  <div className="w-1/2 rounded-t bg-green-lime" style={{ height: `${month.verified}%` }} />
                  <div className="w-1/2 rounded-t bg-slate-200" style={{ height: `${month.remaining}%` }} />
                </div>
                <span className="text-[9px] font-bold text-slate-400 uppercase">{month.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Verified · Remaining</p>
        </section>
        <section className="rounded-2xl border border-border-slate bg-white p-6">
          <h2 className="text-xs font-bold tracking-wider text-navy uppercase">Priority Review · Top 3</h2>
          <div className="mt-4 space-y-4">
            {james ? (
              <Link href="/verification/evidence/evidence-james" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={james.avatarUrl} alt="" className="mb-2 size-8 rounded-full object-cover" />
                <p className="text-sm font-bold text-navy">{james.name}</p>
                <p className="text-xs text-slate-500">{james.title}</p>
                <p className="text-[10px] font-bold text-amber-600 uppercase">{jamesStatus}</p>
              </Link>
            ) : null}
            <Link href="/verification/evidence/evidence-elena" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={elena.avatarUrl} alt="" className="mb-2 size-8 rounded-full object-cover" />
              <p className="text-sm font-bold text-navy">{elena.name}</p>
              <p className="text-xs text-slate-500">{elena.title}</p>
              <p className="text-[10px] font-bold text-red-600 uppercase">Missing Evidence</p>
            </Link>
          </div>
          <Link
            href="/verification/team"
            className="mt-6 block rounded-lg border border-border-slate py-2 text-center text-[10px] font-bold tracking-widest text-navy uppercase"
          >
            View Full Queue
          </Link>
        </section>
      </div>
    </div>
  );
}
