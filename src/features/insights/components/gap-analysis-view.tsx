"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { departmentsWithResults, teamReport, type SkillSummary } from "@/features/capability/services/analytics";
import { PRIORITY_LABEL } from "@/features/capability/types";
import { downloadText, WithCapabilityUser } from "@/features/capability/use-capability";
import { teamMembers } from "@/features/workforce/mock-workforce";
import type { MockUser } from "@/types/user";

const VARIANT = { critical: "error", moderate: "warning", met: "secondary" } as const;

export function GapAnalysisView() {
  return <WithCapabilityUser>{(user) => <GapAnalysis user={user} />}</WithCapabilityUser>;
}

function GapAnalysis({ user }: { user: MockUser }) {
  const departments = departmentsWithResults(user);
  const [choice, setChoice] = useState<string | null>(null);
  const [openGap, setOpenGap] = useState<string | null>(null);
  const department = choice && departments.includes(choice) ? choice : departments[0];
  // Line managers also see who is behind each gap and the team's actions.
  const isManager = user.portal === "line_manager";
  const report = teamReport(user, department);
  const deficits = report.skills.filter((s) => s.averageGap > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">Analytics Hub / Gap Analysis</p>
        }
        title="Team Capability & Gaps"
        description={
          isManager
            ? "View your team's verified capability strengths, identify critical skill gaps and monitor progress against role requirements."
            : "Team strengths and capability gaps from released, verified results."
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            disabled={!report.people}
            onClick={() =>
              downloadText("capability-gaps.txt", [
                `${department}: ${report.averageMatch}% average match, ${report.people} people`,
                ...report.skills.map((s) => `${s.skill}: average level ${s.averageLevel} of ${s.averageRequired}, gap ${s.averageGap}, ${s.metPct}% met`),
              ])
            }
          >
            Full Report
          </Button>
        }
      />
      {!report.people ? (
        <p className="rounded-2xl border border-dashed border-border-slate p-8 text-center text-sm text-slate-500">
          No released results yet. Figures appear when a cycle&apos;s results are released.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {departments.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={department === name}
                className={
                  department === name
                    ? "rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white"
                    : "rounded-lg border border-border-slate bg-white px-3 py-2 text-xs font-bold text-navy"
                }
                onClick={() => {
                  setChoice(name);
                  setOpenGap(null);
                }}
              >
                {name}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Based on {report.people} {report.people === 1 ? "person" : "people"} with released results.
            {report.people < 5 ? " A small group: read averages with care." : ""}
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-navy p-6 text-white">
              <p className="text-4xl font-bold">{report.averageMatch === null ? "—" : `${report.averageMatch}%`}</p>
              <p className="text-sm">{isManager ? "Avg Team Capability Match" : "Average capability match"}</p>
            </div>
            <Highlight title="Strongest Team Capability" skill={report.strongest} />
            <Highlight title="Largest Capability Gap" skill={report.biggestGap} />
          </div>
          <section className="rounded-2xl border border-border-slate bg-white p-6">
            <h2 className="font-bold text-navy">People at their required level</h2>
            <div className="mt-4 space-y-3">
              {report.skills.map((s) => (
                <div key={s.skill}>
                  <div className="mb-1 flex justify-between text-xs font-bold text-navy">
                    <span>{s.skill}</span>
                    <span>
                      {s.metPct}% of {s.people}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-green-lime" style={{ width: `${s.metPct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="overflow-x-auto rounded-xl border border-border-slate bg-white">
            <h2 className="border-b border-border-slate px-6 py-4 text-sm font-bold tracking-wider text-navy uppercase">
              Target Capability Deficits
            </h2>
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                <tr>
                  {["Skill Domain", "Average gap", "Employees affected", "Priority"].map((heading) => (
                    <th key={heading} className="px-6 py-3">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deficits.map((s) => {
                  const open = isManager && openGap === s.skill;
                  return (
                    <Fragment key={s.skill}>
                      <tr className="border-t border-border-slate">
                        <td className="px-6 py-4 font-bold text-navy">
                          {isManager ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-left hover:underline"
                              aria-expanded={open}
                              onClick={() => setOpenGap(open ? null : s.skill)}
                            >
                              {open ? <ChevronDownIcon className="size-4" aria-hidden /> : <ChevronRightIcon className="size-4" aria-hidden />}
                              {s.skill}
                            </button>
                          ) : (
                            s.skill
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {s.averageGap} level{s.averageGap === 1 ? "" : "s"}
                        </td>
                        <td className="px-6 py-4">
                          {s.affected.length} of {s.people}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={VARIANT[s.priority]}>{PRIORITY_LABEL[s.priority]}</Badge>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-slate-50">
                          <td colSpan={4} className="px-6 py-4">
                            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                              Employees contributing to this gap
                            </p>
                            <Contributors skill={s} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {deficits.length ? null : (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-slate-500">
                      No gaps in released results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          {isManager && deficits.length ? (
            <section className="rounded-2xl border border-border-slate bg-white p-6">
              <h2 className="font-bold text-navy">Team Developmental Actions</h2>
              <p className="text-xs text-slate-400">From the largest gaps in released results.</p>
              <ul className="mt-4 divide-y divide-border-slate">
                {deficits.slice(0, 3).map((s) => (
                  <li key={s.skill}>
                    <Link href="/ai/plans" className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50">
                      <span>
                        <span className="block text-sm font-bold text-navy">Close the {s.skill} gap</span>
                        <span className="text-xs text-slate-500">
                          Review development plans for {s.affected.map((p) => p.name).join(", ")}.
                        </span>
                      </span>
                      <Badge variant={VARIANT[s.priority]}>{PRIORITY_LABEL[s.priority]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Highlight({ title, skill }: { title: string; skill: SkillSummary | null }) {
  return (
    <div className="rounded-2xl border border-border-slate bg-white p-6">
      <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{title}</p>
      <p className="mt-2 text-lg font-bold text-navy">{skill?.skill ?? "None"}</p>
      {skill ? (
        <p className="text-sm text-slate-500">
          Average level {skill.averageLevel}, required {skill.averageRequired}
        </p>
      ) : null}
    </div>
  );
}

function Contributors({ skill }: { skill: SkillSummary }) {
  return (
    <ul className="mt-2 divide-y divide-border-slate">
      {skill.affected.map((p) => {
        const member = teamMembers.find((m) => m.name === p.name);
        return (
          <li key={p.employeeId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-bold text-navy">{p.name}</span>
              <span className="text-xs text-slate-500"> · {p.role}</span>
            </span>
            <span className="text-xs text-slate-600">
              Level {p.level} · Required {p.required}
            </span>
            {member ? (
              <Link href={`/manager/team/${member.id}`} className="text-[10px] font-bold tracking-widest text-navy uppercase">
                View Profile
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
