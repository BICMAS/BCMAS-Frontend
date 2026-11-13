"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGoal, listEvidence, listGoals } from "@/features/me/services/portal-state";

export function GrowthHubView() {
  const router = useRouter();
  const [goals, setGoals] = useState(() => listGoals());
  const [evidence] = useState(() => listEvidence());
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const progress = Math.round(
    goals.reduce((sum, goal) => sum + goal.progress, 0) / Math.max(goals.length, 1),
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_300px]">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold text-navy">Active Growth Pathways</h1>
          <Button type="button" onClick={() => setCreating((open) => !open)}>
            + New Development Goal
          </Button>
        </div>

        {creating ? (
          <form
            className="flex flex-col gap-3 rounded-2xl border border-border-slate bg-white p-4 sm:flex-row"
            onSubmit={async (event) => {
              event.preventDefault();
              if (title.trim().length < 3) {
                toast.error("Add a goal title");
                return;
              }
              setPending(true);
              try {
                const goal = await createGoal(title);
                setGoals(listGoals());
                setTitle("");
                setCreating(false);
                toast.success("Development goal created");
                router.push(`/me/growth/${goal.id}`);
              } finally {
                setPending(false);
              }
            }}
          >
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Goal title"
              aria-label="Goal title"
            />
            <Button type="submit" disabled={pending}>
              Save goal
            </Button>
          </form>
        ) : null}

        <div className="grid gap-4">
          {goals.map((goal) => (
            <Link
              key={goal.id}
              href={`/me/growth/${goal.id}`}
              className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm hover:border-navy"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                    {goal.kind}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-navy">{goal.title}</h2>
                </div>
                <Badge variant="warning">{goal.dueLabel}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <p>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Current</span>
                  <span className="font-bold text-navy">L{goal.currentLevel}</span>
                </p>
                <p>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Target</span>
                  <span className="font-bold text-navy">L{goal.targetLevel}</span>
                </p>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-green-lime" style={{ width: `${goal.progress}%` }} />
              </div>
            </Link>
          ))}
        </div>

        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-navy">My Evidence Locker</h2>
            <Link href="/me/progress" className="text-xs font-bold text-navy hover:underline">
              Upload Evidence
            </Link>
          </div>
          <div className="space-y-3">
            {evidence.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-slate px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-navy">{item.fileName}</p>
                  <p className="text-[10px] text-slate-400">
                    Linked to: {item.linkedTo} · {item.when}
                  </p>
                </div>
                <Badge variant={item.status === "verified" ? "success" : "info"}>
                  {item.status === "verified" ? "Verified" : "Awaiting Review"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl bg-navy p-6 text-white">
          <p className="text-[10px] font-bold tracking-widest text-white/60 uppercase">
            Overall Growth Progress
          </p>
          <p className="mt-3 text-4xl font-bold">{progress}%</p>
          <p className="text-sm text-white/70">of targets met</p>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            You&apos;ve closed <strong>2 skill gaps</strong> this year. Keep going.
          </p>
        </div>
        <div className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-navy">Capability Gains</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between">
              <span>Cloud Security</span>
              <span className="font-bold text-green-deep">Verified L3 Met</span>
            </li>
            <li className="flex justify-between">
              <span>IaC (Terraform)</span>
              <span className="font-bold text-green-deep">Verified L4 Met</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
