"use client";

import type { IdpGoal, IndividualDevelopmentPlan } from "@ai/contracts";
import { FlagIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const PRIORITY_TONE = { critical: "error", high: "warning", medium: "info", low: "secondary" } as const;

/** Read-only Individual Development Plan: goals, interventions, resources and milestone timeline. */
export function IdpView({ plan }: { plan: IndividualDevelopmentPlan }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
        <span>
          Role: <span className="font-semibold text-navy">{plan.employee.plan_role_title}</span>
        </span>
        <span>
          {plan.start_date} → {plan.end_date} ({plan.horizon_weeks} weeks)
        </span>
        <span>~{plan.weekly_learning_minutes} min/week formal learning</span>
      </div>
      {plan.development_objectives.length ? (
        <ul className="list-disc pl-5 text-sm text-navy">
          {plan.development_objectives.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      ) : null}
      {plan.goals.map((goal) => (
        <GoalCard key={goal.goal_key} goal={goal} horizon={plan.horizon_weeks} />
      ))}
    </div>
  );
}

function GoalCard({ goal, horizon }: { goal: IdpGoal; horizon: number }) {
  return (
    <article className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm" aria-label={goal.skill_name}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-navy">{goal.skill_name}</h4>
        <div className="flex items-center gap-2">
          <Badge variant={PRIORITY_TONE[goal.priority]}>{goal.priority}</Badge>
          <span className="text-sm text-slate-500">
            Level {goal.current_level ?? "—"} → {goal.target_level} (gap {goal.gap})
          </span>
        </div>
      </header>
      <p className="mt-2 text-sm text-navy">{goal.objective}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section>
          <h5 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Interventions</h5>
          <ul className="mt-1 space-y-1 text-sm text-slate-600">
            {goal.interventions.map((a) => (
              <li key={a.action_key}>
                <span className="font-semibold text-navy">{a.title}</span>{" "}
                <span className="text-xs">({a.type.replace(/_/g, " ")}, due in {a.due_in_days} days)</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h5 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Outcomes & success indicators</h5>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {goal.expected_outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
            {goal.success_indicators.map((s) => (
              <li key={s.indicator_id}>{s.text}</li>
            ))}
          </ul>
        </section>
      </div>
      <section className="mt-4" aria-label={`${goal.skill_name} milestones`}>
        <h5 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
          Milestones (weeks {goal.start_week}–{goal.end_week})
        </h5>
        <div className="relative mt-3 h-2 rounded-full bg-slate-100">
          <div
            className="absolute h-2 rounded-full bg-green-lime/40"
            style={{
              left: `${((goal.start_week - 1) / horizon) * 100}%`,
              width: `${((goal.end_week - goal.start_week + 1) / horizon) * 100}%`,
            }}
          />
          {goal.milestones.map((m) => (
            <FlagIcon
              key={m.milestone_key}
              aria-hidden
              className="absolute -top-2 size-4 text-navy"
              style={{ left: `calc(${(m.due_week / horizon) * 100}% - 8px)` }}
            />
          ))}
        </div>
        <ol className="mt-3 space-y-1 text-sm text-slate-600">
          {goal.milestones.map((m) => (
            <li key={m.milestone_key}>
              <span className="font-semibold text-navy">Week {m.due_week}:</span> {m.title} — {m.measure}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
