"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { PriorityBadge } from "@/features/capability/components/shared";
import { cycleOf, levelLabel, myAssessment, myLatestResults, stageOf } from "@/features/capability/services/capability";
import { capabilityMatch, verifiedLevel } from "@/features/capability/services/scoring";
import { STAGE_LABEL, type AssessmentItem } from "@/features/capability/types";
import { formatDay, WithCapabilityUser } from "@/features/capability/use-capability";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/types/user";

const filters: Array<{ id: "all" | AssessmentItem["category"]; label: string }> = [
  { id: "all", label: "All" },
  { id: "technical", label: "Technical" },
  { id: "behavioural", label: "Soft Skills" },
];

export function MySkillsView() {
  return <WithCapabilityUser>{(user) => <MySkills user={user} />}</WithCapabilityUser>;
}

function MySkills({ user }: { user: MockUser }) {
  const current = myAssessment(user);
  const results = myLatestResults(user);
  const profile = results ?? current;
  const match = capabilityMatch(results?.items ?? []);
  const alignment = match.percent === null ? "Not assessed yet" : `${match.percent}%`;
  const recent = [current, results].filter((a, i, list) => a && list.findIndex((b) => b?.id === a.id) === i);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const skills = (profile?.items ?? []).filter((skill) => filter === "all" || skill.category === filter);
  const technical = skills.filter((skill) => skill.category === "technical");
  const behavioural = skills.filter((skill) => skill.category === "behavioural");

  const downloadProfile = () => {
    const lines = [
      profile?.roleTitle ?? "",
      `Profile Version: ${profile?.profileVersion ?? "—"}`,
      `Role Capability Alignment: ${alignment}`,
      "",
      ...(profile?.items ?? []).map(
        (skill) => `${skill.name}: ${levelLabel(verifiedLevel(skill))} / required ${levelLabel(skill.required)}`,
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
            {profile?.roleTitle ?? "No approved role"}
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            {profile?.department} · Profile Version:{" "}
            <span className="font-bold text-navy">{profile?.profileVersion ?? "—"}</span>
          </p>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Role Capability Alignment</dt>
              <dd className="font-bold text-navy">{alignment}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Skills Met</dt>
              <dd className="font-bold text-navy">
                {match.met}/{match.total}
              </dd>
            </div>
          </dl>
          <Link
            href={profile ? `/roles/${profile.roleId}` : "/me"}
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
            {profile
              ? `Your role profile has ${profile.items.length} skills. Verified levels come from your latest released results.`
              : "Your role mapping has not been approved yet."}
          </p>
          <Button type="button" variant="secondary" className="mt-4" onClick={downloadProfile}>
            Download Full Profile PDF
          </Button>
        </section>

        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-navy">Recent Assessments</h3>
            <Link href="/me/assessments/latest/results" className="text-xs font-bold text-navy hover:underline">
              View All Assessments
            </Link>
          </div>
          {recent.map((a) => (
            <Link
              key={a!.id}
              href={`/me/assessments/${a!.releasedAt ? "latest" : a!.cycleId}/results`}
              className="mt-4 flex items-center justify-between rounded-xl border border-border-slate px-4 py-3 hover:bg-slate-50"
            >
              <span>
                <span className="block text-sm font-bold text-navy">{cycleOf(a!)?.name}</span>
                <span className="text-xs text-slate-500">
                  {a!.releasedAt ? `Released ${formatDay(a!.releasedAt)}` : "In this cycle"}
                </span>
              </span>
              <Badge variant={a!.releasedAt ? "success" : "warning"}>{STAGE_LABEL[stageOf(a!)]}</Badge>
            </Link>
          ))}
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
  skills: AssessmentItem[];
}) {
  return (
    <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-navy">{title}</h3>
        <span className="text-xs font-bold text-slate-400">{count} Skills</span>
      </div>
      <div className="space-y-4">
        {skills.map((skill) => {
          return (
            <div key={skill.skillId} className="rounded-xl border border-border-slate p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-navy">{skill.name}</p>
                </div>
                <PriorityBadge item={skill} />
              </div>
              <div className="mt-3 flex gap-6 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                <span>Verified: {levelLabel(verifiedLevel(skill))}</span>
                <span>Required: {levelLabel(skill.required)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
