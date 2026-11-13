"use client";

import Link from "next/link";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { getSession } from "@/features/ai-coach/services/mock-coach";
import { cn } from "@/lib/utils";

export function SessionReviewView({ sessionId }: { sessionId: string }) {
  const session = getSession(sessionId);

  if (!session) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold text-navy">Session not found</h1>
        <Link href="/ai-coach" className={cn(buttonVariants())}>
          Back to coaching
        </Link>
      </div>
    );
  }

  const exportSession = () => {
    const lines = [
      session.title,
      session.date,
      `Score: ${session.score || 85}%`,
      "",
      ...session.messages.map((message) => `${message.role}: ${message.text}`),
      "",
      "This session is coaching practice and does not update verified capability levels.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${session.id}-review.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Session summary downloaded");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              session.avatarUrl ??
              "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg"
            }
            alt=""
            className="size-16 rounded-2xl border border-border-slate object-cover"
          />
          <div>
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Session complete · {session.persona}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-navy">{session.title}</h1>
            <p className="text-sm text-slate-500">Completed {session.date}</p>
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={exportSession}>
          Export Session PDF
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-navy p-6 text-white sm:col-span-1">
          <p className="text-4xl font-bold">{session.score || 85}%</p>
          <p className="text-sm text-white/70">Match · Confidence verified</p>
        </div>
        <div className="rounded-2xl border border-border-slate bg-white p-6">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Time in sim</p>
          <p className="mt-2 text-2xl font-bold text-navy">{session.duration}</p>
        </div>
        <div className="rounded-2xl border border-border-slate bg-white p-6">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Skills targeted</p>
          <p className="mt-2 text-2xl font-bold text-navy">2 Critical</p>
          <p className="text-xs text-slate-500">{session.skill}</p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">
        You demonstrated proficiency in addressing constraints while keeping the conversation moving. Your reply to the {session.persona} was specific enough to continue the simulation.
      </p>

      <section className="space-y-4 rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Skill-linked feedback</h2>
        <div className="rounded-xl bg-green-50 p-4">
          <p className="text-xs font-bold text-green-deep">Strength identified</p>
          <p className="mt-2 text-sm text-navy">
            You tied the answer to a retention rule instead of defending the architecture. That matches the behavioural indicator for applying an ethics framework consistently.
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-800">Growth opportunity</p>
          <p className="mt-2 text-sm text-navy">
            The first reply can sound defensive. Frame the constraint as a safeguard you and the stakeholder can both verify. Tip: use a &quot;yes, and&quot; opening.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Next steps</h2>
        <p className="mt-2 text-sm text-slate-600">
          Practice suggests focusing on high-stakes communication before the next formal assessment.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/me/growth/goal-ai" className="rounded-xl border border-border-slate p-4 hover:bg-slate-50">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Recommended learning</p>
            <p className="mt-1 font-bold text-navy">Executive Communication Masterclass</p>
            <p className="text-xs text-slate-500">Internal workshop · 2h</p>
          </Link>
          <Link href="/ai-coach/session/sim-vendor" className="rounded-xl border border-border-slate p-4 hover:bg-slate-50">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Simulation</p>
            <p className="mt-1 font-bold text-navy">Board level stakeholder conversation</p>
            <p className="text-xs text-slate-500">Hard · 15 mins</p>
          </Link>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        This session is coaching practice. Performance data can be reviewed by your manager. It will not update verified capability levels without a formal assessment cycle.
      </p>
      <Link href="/ai-coach" className={cn(buttonVariants({ variant: "secondary" }))}>
        Done
      </Link>
    </div>
  );
}
