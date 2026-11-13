"use client";

import Link from "next/link";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  FilePenIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/utils";

const skills = [
  {
    name: "Cloud Solution Design",
    status: "Level 4 Met",
    met: true,
    verified: 80,
    target: 20,
  },
  {
    name: "Strategic Influence",
    status: "Level 3 (Target: 5)",
    met: false,
    verified: 60,
    target: 40,
  },
  {
    name: "API Governance",
    status: "Level 2 (Target: 4)",
    met: false,
    verified: 40,
    target: 40,
  },
] as const;

const todos = [
  {
    title: "Evidence Missing",
    detail: "Cyber Security",
    href: "/me/progress",
    icon: FilePenIcon,
    tone: "border-amber-100 bg-amber-50 text-amber-600",
    detailTone: "text-amber-700",
  },
  {
    title: "Awaiting Review",
    detail: "Cloud Infrastructure",
    href: "/me/skills",
    icon: ShieldCheckIcon,
    tone: "border-blue-100 bg-blue-50 text-blue-600",
    detailTone: "text-blue-700",
  },
  {
    title: "Start Learning",
    detail: "AI Ethics 101",
    href: "/me/growth/goal-ai",
    icon: GraduationCapIcon,
    tone: "border-green-100 bg-green-50 text-green-600",
    detailTone: "text-green-700",
  },
] as const;

export function EmployeeHomeView() {
  const name = useSessionStore((state) => state.user.name);
  const firstName = name.split(" ")[0] ?? name;

  return (
    <div className="mx-auto max-w-325">
      <div className="mb-10">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-navy">
          Hello, {firstName}! 👋
        </h1>
        <p className="max-w-2xl leading-relaxed text-slate-500 italic">
          &quot;The beautiful thing about learning is that no one can take it
          away from you.&quot; — B.B. King
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section className="relative flex flex-col items-center gap-8 overflow-hidden rounded-3xl bg-navy p-8 text-white shadow-xl md:flex-row">
            <div className="flex size-24 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
              <ClipboardCheckIcon className="size-10 text-green-lime" aria-hidden />
            </div>
            <div className="relative z-10 flex-1 text-center md:text-left">
              <h2 className="mb-2 text-xl font-bold">
                Complete your 2024 Self-Assessment
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-white/70">
                It&apos;s that time again! Reflect on your recent achievements
                and update your skill levels for the current cycle.
              </p>
              <Link
                href="/me/assessments/cycle-2024/start"
                className={cn(
                  buttonVariants({ variant: "accent" }),
                  "rounded-xl",
                )}
              >
                Start Assessment
                <ArrowRightIcon className="size-3.5" aria-hidden />
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-border-slate bg-white p-8 shadow-sm">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-bold text-navy">
                Your Capability Snapshot
              </h2>
              <div className="flex gap-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-green-lime" />
                  Verified
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-slate-200" />
                  Role Target
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              <div className="space-y-6">
                {skills.map((skill) => (
                  <div key={skill.name}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold tracking-wider text-navy uppercase">
                        {skill.name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-bold uppercase",
                          skill.met ? "text-green-deep" : "text-amber-600",
                        )}
                      >
                        {skill.status}
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full",
                          skill.met ? "bg-green-lime" : "bg-amber-400",
                        )}
                        style={{ width: `${skill.verified}%` }}
                      />
                      <div
                        className="h-full border-l border-white bg-slate-200"
                        style={{ width: `${skill.target}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-slate bg-slate-50 p-6">
                <p className="mb-4 text-[10px] font-bold tracking-[0.2em] text-slate-400 uppercase">
                  Overall Role Alignment
                </p>
                <div
                  className="mb-4 grid size-24 place-items-center rounded-full"
                  style={{
                    background:
                      "conic-gradient(var(--color-green-lime) 82%, #e2e8f0 0)",
                  }}
                  aria-label="82 percent role alignment"
                >
                  <div className="grid size-18 place-items-center rounded-full bg-slate-50">
                    <span className="text-xl leading-none font-bold text-navy">
                      82%
                    </span>
                  </div>
                </div>
                <Link
                  href="/me/skills"
                  className="text-[10px] font-bold tracking-widest text-navy uppercase hover:underline"
                >
                  Full Skills Analysis
                </Link>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-border-slate bg-white shadow-sm">
            <div className="border-b border-border-slate bg-slate-50/50 px-6 py-4">
              <h2 className="text-xs font-bold tracking-wider text-navy uppercase">
                Your To-Do List
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {todos.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-4 transition-shadow hover:shadow-sm",
                      item.tone,
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-lg border border-current/10 bg-white">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-xs leading-tight font-bold text-navy">
                          {item.title}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block text-[9px] font-medium uppercase",
                            item.detailTone,
                          )}
                        >
                          {item.detail}
                        </span>
                      </span>
                    </span>
                    <ChevronRightIcon className="size-3 opacity-60" aria-hidden />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-xs font-bold tracking-wider text-navy uppercase">
              Development Priorities
            </h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="mt-1.5 size-1.5 rounded-full bg-navy" />
                <div>
                  <p className="text-xs font-bold text-navy">
                    Master Strategic Stakeholder Engagement
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Closing Level 3 to Level 5 gap.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <span className="mt-1.5 size-1.5 rounded-full bg-green-lime" />
                <div>
                  <p className="text-xs font-bold text-navy">
                    Acquire AWS Certified Architect Pro
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Verification evidence for Infra Design.
                  </p>
                </div>
              </div>
            </div>
            <Link
              href="/me/growth"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "mt-8 w-full text-[10px] tracking-widest uppercase",
              )}
            >
              View Growth Hub
            </Link>
          </section>

          <section className="rounded-2xl bg-linear-to-br from-green-lime to-green-deep p-6 text-navy shadow-xl">
            <h2 className="mb-2 text-sm font-bold">Practice with AI Coach</h2>
            <p className="mb-4 text-[10px] leading-relaxed font-medium">
              Ready for a role simulation? Practice your stakeholder influence
              today.
            </p>
            <Link
              href="/ai-coach"
              className={cn(
                buttonVariants({ size: "sm" }),
                "text-[10px] tracking-widest uppercase",
              )}
            >
              Launch AI Coach
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
