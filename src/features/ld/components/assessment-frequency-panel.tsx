"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ASSESSMENT_SCOPES,
  buildSchedule,
  CYCLE_OPTIONS,
  type CyclesPerYear,
  ORGANISATION_SCOPE,
} from "@/features/ld/assessment-schedule";
import { scheduleProgramme } from "@/features/capability/services/capability";
import { runCapability, useCapabilityUser } from "@/features/capability/use-capability";
import { cn } from "@/lib/utils";

type SavedProgramme = { scope: string; cycles: CyclesPerYear; year: number };

/**
 * Configure Assessment Frequency: choose the scope (a department or the whole organisation),
 * how many cycles per year, and the year; BCMS shows the resulting monthly timetable.
 * With readOnly (HRBP), the timetable is shown but cannot be changed or saved.
 */
export function AssessmentFrequencyPanel({
  readOnly = false,
}: {
  readOnly?: boolean;
}) {
  const user = useCapabilityUser();
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear + 1];
  const [scope, setScope] = useState(ORGANISATION_SCOPE);
  const [cycles, setCycles] = useState<CyclesPerYear>(2);
  const [year, setYear] = useState(thisYear + 1);
  const [saved, setSaved] = useState<SavedProgramme[]>([]);
  const schedule = buildSchedule(cycles, year);
  const label = CYCLE_OPTIONS.find((o) => o.value === cycles)!.label;

  return (
    <section
      aria-labelledby="assessment-frequency"
      className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm"
    >
      <h2 id="assessment-frequency" className="text-lg font-bold text-navy">
        {readOnly ? "Assessment Frequency" : "Configure Assessment Frequency"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {readOnly
          ? "The assessment timetable set by your Organisation Admin. You can view it but not change it."
          : "Choose how many capability assessment cycles to run in a year, for one department or the entire organisation. The timetable below shows everyone when to complete their assessments."}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <fieldset
          disabled={readOnly}
          className="min-w-0 space-y-5 disabled:opacity-70"
        >
          <div>
            <label
              htmlFor="assessment-scope"
              className="mb-2 block text-[10px] font-bold tracking-widest text-slate-400 uppercase"
            >
              Applies to
            </label>
            <select
              id="assessment-scope"
              className="h-10 w-full rounded-lg border border-border-slate bg-white px-3 text-sm text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {ASSESSMENT_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s === ORGANISATION_SCOPE
                    ? "Entire organisation (all departments)"
                    : s}
                </option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="mb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Number of assessment cycles per year
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CYCLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3 text-center transition has-focus-visible:ring-2 has-focus-visible:ring-navy",
                    cycles === option.value
                      ? "border-navy bg-slate-50"
                      : "border-border-slate hover:bg-slate-50",
                  )}
                >
                  <input
                    type="radio"
                    name="cycles-per-year"
                    className="sr-only"
                    checked={cycles === option.value}
                    onChange={() => setCycles(option.value)}
                  />
                  <span className="block text-2xl font-bold text-navy">
                    {option.value}
                  </span>
                  <span className="text-xs text-slate-500">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Assessment year
            </legend>
            <div className="flex gap-6">
              {years.map((y) => (
                <label
                  key={y}
                  className="flex items-center gap-2 text-sm text-navy"
                >
                  <input
                    type="radio"
                    name="assessment-year"
                    checked={year === y}
                    onChange={() => setYear(y)}
                  />
                  {y}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>

        <div>
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Assessment programme
          </p>
          <p className="mt-1 text-lg font-bold text-navy">
            {cycles} assessment cycle{cycles > 1 ? "s" : ""} per year ({label})
            · {scope}
          </p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <tr>
                <th className="py-2">Cycle</th>
                <th className="py-2">Assessment Period</th>
                <th className="py-2">Verification Deadline</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((w) => (
                <tr key={w.cycle} className="border-t border-border-slate">
                  <td className="py-2 font-bold text-navy">Cycle {w.cycle}</td>
                  <td className="py-2">{w.period}</td>
                  <td className="py-2">{w.verificationDeadline}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Exact start and end dates are confirmed when each cycle is
            activated.
          </p>
          {readOnly ? null : (
            <Button
              type="button"
              className="mt-4 w-full"
              onClick={() => {
                if (!user) return;
                let created = 0;
                if (!runCapability(() => { created = scheduleProgramme(user, scope, cycles, year); })) return;
                setSaved((prev) => [
                  { scope, cycles, year },
                  ...prev.filter((p) => !(p.scope === scope && p.year === year)),
                ]);
                toast.success("Assessment configuration saved", {
                  description: `${scope}: ${created} cycle${created === 1 ? "" : "s"} scheduled for ${year}`,
                });
              }}
            >
              Save Assessment Configuration
            </Button>
          )}
        </div>
      </div>

      {saved.length ? (
        <div className="mt-6 border-t border-border-slate pt-4">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Saved programmes
          </p>
          <ul className="mt-2 space-y-1 text-sm text-navy">
            {saved.map((p) => (
              <li key={`${p.scope}-${p.year}`}>
                <span className="font-bold">{p.scope}</span> · {p.year}:{" "}
                {p.cycles} cycle{p.cycles > 1 ? "s" : ""} (
                {CYCLE_OPTIONS.find((o) => o.value === p.cycles)!.label})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
