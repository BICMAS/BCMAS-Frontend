"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { portalSkills, type SkillGroup } from "@/features/me/data/portal";
import { cn } from "@/lib/utils";

const filters: Array<{ id: "all" | SkillGroup; label: string }> = [
  { id: "all", label: "All" },
  { id: "technical", label: "Technical" },
  { id: "behavioural", label: "Soft Skills" },
];

export function MySkillsView() {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const skills = useMemo(
    () =>
      portalSkills.filter((skill) => filter === "all" || skill.group === filter),
    [filter],
  );
  const technical = skills.filter((skill) => skill.group === "technical");
  const behavioural = skills.filter((skill) => skill.group === "behavioural");

  const downloadProfile = () => {
    const lines = [
      "Senior Solutions Architect",
      "Profile Version: V2.4 Published",
      "Overall Match: 82%",
      "",
      ...portalSkills.map(
        (skill) =>
          `${skill.name}: verified L${skill.verifiedLevel} / target L${skill.targetLevel}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "role-profile.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Profile summary downloaded");
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Active Profile
          </p>
          <h1 className="mt-2 text-xl font-bold text-navy">
            Senior Solutions Architect
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            Information Technology · Profile Version:{" "}
            <span className="font-bold text-navy">V2.4 Published</span>
          </p>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Overall Match</dt>
              <dd className="font-bold text-navy">82%</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Verified Skills</dt>
              <dd className="font-bold text-navy">10/12</dd>
            </div>
          </dl>
          <Link
            href="/roles/role-ssa"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-6 w-full")}
          >
            Open role
          </Link>
        </div>
      </aside>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold text-navy">My Skills & Proficiency</h2>
          <div className="flex gap-2">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold",
                  filter === item.id
                    ? "bg-navy text-white"
                    : "bg-white text-slate-500 ring-1 ring-border-slate",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {technical.length > 0 ? (
          <SkillSection title="Technical Competencies" count={technical.length} skills={technical} />
        ) : null}
        {behavioural.length > 0 ? (
          <SkillSection title="Behavioural Skills" count={behavioural.length} skills={behavioural} />
        ) : null}

        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <h3 className="font-bold text-navy">My Role Overview</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            As a Senior Solutions Architect, your focus is on driving the
            technical roadmap for high-availability systems. You bridge the gap
            between business needs and cloud engineering excellence.
          </p>
          <Button type="button" variant="secondary" className="mt-4" onClick={downloadProfile}>
            Download Full Profile PDF
          </Button>
        </section>

        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-navy">Recent Assessments</h3>
            <Link href="/me/assessments/cycle-2024/results" className="text-xs font-bold text-navy hover:underline">
              View All Assessments
            </Link>
          </div>
          <Link
            href="/me/assessments/cycle-2024/results"
            className="mt-4 flex items-center justify-between rounded-xl border border-border-slate px-4 py-3 hover:bg-slate-50"
          >
            <span>
              <span className="block text-sm font-bold text-navy">2024 Q3 Strategic Review</span>
              <span className="text-xs text-slate-500">Completed 12 Oct</span>
            </span>
            <Badge variant="success">Completed</Badge>
          </Link>
        </section>
      </div>
    </div>
  );
}

function SkillSection({
  title,
  count,
  skills,
}: {
  title: string;
  count: number;
  skills: typeof portalSkills;
}) {
  return (
    <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-navy">{title}</h3>
        <span className="text-xs font-bold text-slate-400">{count} Skills</span>
      </div>
      <div className="space-y-4">
        {skills.map((skill) => {
          const gap = skill.verifiedLevel < skill.targetLevel;
          return (
            <div key={skill.id} className="rounded-xl border border-border-slate p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-navy">{skill.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{skill.description}</p>
                </div>
                {gap ? <Badge variant="warning">Priority Gap</Badge> : <Badge variant="success">Verified</Badge>}
              </div>
              <div className="mt-3 flex gap-6 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                <span>Verified Level {skill.verifiedLevel}</span>
                <span>Target Level {skill.targetLevel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
