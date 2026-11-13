"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { getGoal, resumeLearning } from "@/features/me/services/portal-state";
import { cn } from "@/lib/utils";

export function GrowthJourneyView({ goalId }: { goalId: string }) {
  const [goal, setGoal] = useState(() => getGoal(goalId));
  const [pending, setPending] = useState(false);

  if (!goal) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold text-navy">Goal not found</h1>
        <Link href="/me/growth" className={cn(buttonVariants())}>
          Back to Growth Hub
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/me/growth" className="text-xs font-bold tracking-widest text-slate-400 uppercase hover:text-navy">
          Growth Hub
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-navy">{goal.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {goal.kind} · {goal.dueLabel}
        </p>
      </div>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold tracking-wider text-slate-400 uppercase">The Objective</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{goal.objective}</p>
        <p className="mt-4 text-sm font-bold text-navy">{goal.progress}% Comp.</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-navy" style={{ width: `${goal.progress}%` }} />
        </div>
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <p className="text-xs font-bold text-slate-400">1</p>
        <h2 className="font-bold text-navy">Learning Activity</h2>
        <p className="mt-2 text-sm font-bold text-navy">{goal.learningTitle}</p>
        <p className="text-xs text-slate-500">{goal.learningMeta}</p>
        <p className="mt-2 text-sm text-slate-600">
          Master the frameworks and standards required for this goal.
        </p>
        <Button
          type="button"
          className="mt-4"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              const updated = await resumeLearning(goal.id);
              if (updated) setGoal(updated);
              toast.success("Learning progress saved");
            } finally {
              setPending(false);
            }
          }}
        >
          Resume Learning
        </Button>
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <p className="text-xs font-bold text-slate-400">2</p>
        <h2 className="font-bold text-navy">Workplace Practice</h2>
        <p className="mt-2 text-sm text-slate-600">
          Demonstrate your skills in real-world scenarios to build evidence for verification.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-navy">
          {goal.practices.map((practice) => (
            <li key={practice} className="rounded-lg bg-slate-50 px-3 py-2">
              {practice}
            </li>
          ))}
        </ul>
        <Link href="/me/progress" className={cn(buttonVariants({ variant: "secondary" }), "mt-4")}>
          Add practice evidence
        </Link>
      </section>

      <section className="rounded-2xl bg-linear-to-br from-green-lime to-green-deep p-6 text-navy">
        <h2 className="font-bold">Ready to practice?</h2>
        <p className="mt-2 text-sm">
          Simulate a briefing with the AI Coach to test your knowledge.
        </p>
        <Link href="/ai-coach/session/sim-ai-gov" className={cn(buttonVariants(), "mt-4")}>
          Launch Session
        </Link>
      </section>
    </div>
  );
}
