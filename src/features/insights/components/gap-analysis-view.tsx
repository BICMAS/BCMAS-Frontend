"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { developmentalActions, gapContributors } from "@/features/manager/team-data";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { getTeamMember } from "@/features/workforce/mock-workforce";

const departments = {
  "IT Dept": {
    match: "78%",
    strength: "Infrastructure Design",
    strengthLevel: "4.2",
    gap: "AI Governance",
    gapLevel: "2.1",
    delta: "-1.9",
    members: "450 Team Members",
    skills: [
      ["Cloud Solution Design", "85%"],
      ["Cyber Security Operations", "72%"],
      ["Advanced AI Governance", "24%"],
    ],
    deficits: [
      ["AI Governance", "-1.9 Levels", "Critical"],
      ["Secure SDLC", "-0.8 Levels", "High"],
      ["DevOps Automation", "-0.2 Levels", "Standard"],
    ],
  },
  Finance: {
    match: "81%",
    strength: "Financial Control",
    strengthLevel: "4.0",
    gap: "Data Storytelling",
    gapLevel: "2.4",
    delta: "-1.1",
    members: "120 Team Members",
    skills: [
      ["Financial Control", "90%"],
      ["Forecasting", "76%"],
      ["Data Storytelling", "31%"],
    ],
    deficits: [
      ["Data Storytelling", "-1.1 Levels", "High"],
      ["Systems Thinking", "-0.4 Levels", "Standard"],
    ],
  },
  Operations: {
    match: "74%",
    strength: "Service Continuity",
    strengthLevel: "3.8",
    gap: "Automation",
    gapLevel: "2.0",
    delta: "-1.4",
    members: "210 Team Members",
    skills: [
      ["Service Continuity", "80%"],
      ["Vendor Management", "66%"],
      ["Automation", "29%"],
    ],
    deficits: [
      ["Automation", "-1.4 Levels", "Critical"],
      ["Vendor Management", "-0.5 Levels", "High"],
    ],
  },
} as const;

export function GapAnalysisView() {
  const [department, setDepartment] = useState<keyof typeof departments>("IT Dept");
  const [openGap, setOpenGap] = useState<string | null>(null);
  const user = useHydratedUser();
  // Line manager wording, gap drill-down and developmental actions; other portals are unchanged.
  const isManager = user?.portal === "line_manager";
  const data = departments[department];
  const actions = developmentalActions[department] ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Analytics Hub / Gap Analysis
          </p>
        }
        title="Team Capability & Gaps"
        description={
          isManager
            ? "View your team's verified capability strengths, identify critical skill gaps and monitor progress against role requirements."
            : "Aggregate view of team strengths and critical capability deficits based on verified 2024 assessments."
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => toast.message(`${department} gap report is ready as a mock export.`)}
          >
            Full Report
          </Button>
        }
      />
      <div className="flex gap-2">
        {(Object.keys(departments) as (keyof typeof departments)[]).map((name) => (
          <button
            key={name}
            type="button"
            className={
              department === name
                ? "rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white"
                : "rounded-lg border border-border-slate bg-white px-3 py-2 text-xs font-bold text-navy"
            }
            onClick={() => {
              setDepartment(name);
              setOpenGap(null);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-navy p-6 text-white">
          <p className="text-4xl font-bold">{data.match}</p>
          <p className="text-sm">{isManager ? "Avg Team Capability Match" : "Avg. Team Match"} · High Alignment</p>
        </div>
        <div className="rounded-2xl border border-border-slate bg-white p-6">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            {isManager ? "Strongest Team Capability" : "Top Capability Strength"}
          </p>
          <p className="mt-2 text-lg font-bold text-navy">{data.strength}</p>
          <p className="text-sm text-slate-500">Avg Level: {data.strengthLevel}</p>
        </div>
        <div className="rounded-2xl border border-border-slate bg-white p-6">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Critical Capability Gap</p>
          <p className="mt-2 text-lg font-bold text-navy">{data.gap}</p>
          <p className="text-sm text-slate-500">
            Avg Level: {data.gapLevel} ({data.delta})
          </p>
        </div>
      </div>
      <section className="rounded-2xl border border-border-slate bg-white p-6">
        <h2 className="font-bold text-navy">Skill Proficiency Distribution</h2>
        <p className="text-xs text-slate-400">
          {department} · {data.members}
        </p>
        <div className="mt-4 space-y-3">
          {data.skills.map(([name, width]) => (
            <div key={name}>
              <div className="mb-1 flex justify-between text-xs font-bold text-navy">
                <span>{name}</span>
                <span>{width} Proficient+</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-green-lime" style={{ width }} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-border-slate bg-white">
        <h2 className="border-b border-border-slate px-6 py-4 text-sm font-bold tracking-wider text-navy uppercase">
          Target Capability Deficits
        </h2>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            <tr>
              {["Skill Domain", "Gap Size", "Priority"].map((heading) => (
                <th key={heading} className="px-6 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.deficits.map(([skill, size, priority]) => {
              const open = isManager && openGap === skill;
              const contributors = gapContributors[skill] ?? [];
              return (
                <Fragment key={skill}>
                  <tr className="border-t border-border-slate">
                    <td className="px-6 py-4 font-bold text-navy">
                      {isManager ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-left hover:underline"
                          aria-expanded={open}
                          onClick={() => setOpenGap(open ? null : skill)}
                        >
                          {open ? (
                            <ChevronDownIcon className="size-4" aria-hidden />
                          ) : (
                            <ChevronRightIcon className="size-4" aria-hidden />
                          )}
                          {skill}
                        </button>
                      ) : (
                        skill
                      )}
                    </td>
                    <td className="px-6 py-4">{size}</td>
                    <td className="px-6 py-4">
                      <Badge variant={priority === "Critical" ? "error" : priority === "High" ? "warning" : "secondary"}>
                        {priority}
                      </Badge>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-6 py-4">
                        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                          Employees contributing to this gap
                        </p>
                        {contributors.length ? (
                          <ul className="mt-2 divide-y divide-border-slate">
                            {contributors.map((c) => {
                              const member = getTeamMember(c.memberId);
                              return member ? (
                                <li key={c.memberId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                  <span>
                                    <span className="font-bold text-navy">{member.name}</span>
                                    <span className="text-xs text-slate-500"> · {member.title}</span>
                                  </span>
                                  <span className="text-xs text-slate-600">
                                    Current {c.current} · Required {c.required}
                                  </span>
                                  <Link
                                    href={`/manager/team/${member.id}`}
                                    className="text-[10px] font-bold tracking-widest text-navy uppercase"
                                  >
                                    View Profile
                                  </Link>
                                </li>
                              ) : null;
                            })}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">
                            None of your direct reports are in this department&apos;s gap.
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
      {isManager ? (
        <section className="rounded-2xl border border-border-slate bg-white p-6">
          <h2 className="font-bold text-navy">Team Developmental Actions</h2>
          <p className="text-xs text-slate-400">Key actions required to drive growth.</p>
          {actions.length ? (
            <ul className="mt-4 divide-y divide-border-slate">
              {actions.map((item) => (
                <li key={item.action}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50"
                  >
                    <span>
                      <span className="block text-sm font-bold text-navy">{item.action}</span>
                      <span className="text-xs text-slate-500">{item.detail}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge
                        variant={item.priority === "Critical" ? "error" : item.priority === "High" ? "warning" : "secondary"}
                      >
                        {item.priority}
                      </Badge>
                      <ChevronRightIcon className="size-4 text-slate-400" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No developmental actions for this department.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
