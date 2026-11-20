"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { planProgress, type PracticeStatus } from "@/features/manager/team-data";
import type { GrowthPlan } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "secondary" | "info";

function statusVariant(status: string): BadgeVariant {
  if (status === "Completed" || status === "Verified") return "success";
  if (status === "In Progress" || status === "Awaiting Verification") return "warning";
  if (status === "Not Started" || status === "Not Submitted") return "secondary";
  return "info";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border-slate py-3 first:border-t-0 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</dt>
      <dd className="text-sm text-navy">{children}</dd>
    </div>
  );
}

/**
 * Manager view of a direct report's development plan progress. Replaces the evidence upload
 * for line managers: the employee submits evidence, the manager reviews and acts on it.
 */
export function ManagerPlanProgress({ plan, memberName }: { plan: GrowthPlan; memberName: string }) {
  const progress = planProgress[plan.id];
  if (!progress) {
    return (
      <section className="rounded-2xl border border-border-slate bg-white p-5">
        <h2 className="text-sm font-bold text-navy">Progress & Verification</h2>
        <p className="mt-2 text-sm text-slate-500">No progress has been recorded for this plan yet.</p>
      </section>
    );
  }
  const { learning, practices, evidence, verification, action } = progress;
  const percent = learning.total ? Math.round((learning.completed / learning.total) * 100) : 0;

  return (
    <section className="rounded-2xl border border-border-slate bg-white p-5" aria-labelledby="plan-progress">
      <h2 id="plan-progress" className="text-sm font-bold text-navy">
        Progress & Verification
      </h2>
      <p className="mt-1 text-xs text-slate-500">{memberName}&apos;s progress on this plan, and what needs your attention.</p>
      <dl className="mt-4">
        <Row label="Learning Completion">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(learning.status)}>{learning.status}</Badge>
            <span>
              {plan.learningTitle}: {learning.completed} of {learning.total} completed ({percent}%)
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100" aria-hidden>
            <div className="h-full rounded-full bg-green-lime" style={{ width: `${percent}%` }} />
          </div>
        </Row>
        <Row label="Workplace Practice">
          <ul className="space-y-2">
            {plan.practices.map((item, index) => {
              const status: PracticeStatus = practices[index] ?? "Not Started";
              return (
                <li key={item} className="flex flex-wrap items-start justify-between gap-2">
                  <span className="flex-1">{item}</span>
                  <Badge variant={statusVariant(status)}>{status}</Badge>
                </li>
              );
            })}
          </ul>
        </Row>
        <Row label="Evidence Submitted">
          {evidence ? (
            <span>
              {evidence.title} <span className="text-slate-500">({evidence.fileName})</span>
            </span>
          ) : (
            <span className="text-slate-500">No evidence submitted by the employee yet.</span>
          )}
        </Row>
        <Row label="Date Submitted">{evidence ? evidence.submittedOn : <span className="text-slate-500">—</span>}</Row>
        <Row label="Verification Status">
          <Badge variant={statusVariant(verification)}>{verification}</Badge>
        </Row>
        <Row label="Action Required">
          {action ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{action.detail}</span>
              {action.href ? (
                <Link href={action.href} className={cn(buttonVariants({ size: "sm" }))}>
                  {action.label}
                </Link>
              ) : action.nudge ? (
                <Button type="button" size="sm" onClick={() => toast.success(`Reminder sent to ${memberName}.`)}>
                  {action.label}
                </Button>
              ) : null}
            </div>
          ) : (
            <span className="text-slate-500">No action required.</span>
          )}
        </Row>
      </dl>
    </section>
  );
}
