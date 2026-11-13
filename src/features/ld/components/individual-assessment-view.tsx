"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  assessmentSkills,
  getRating,
  ratedCount,
  saveRating,
} from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

const levels = ["Foundation", "Developing", "Proficient", "Advanced", "Expert"];

export function IndividualAssessmentView({ assessmentId }: { assessmentId: string }) {
  const [index, setIndex] = useState(0);
  const [version, setVersion] = useState(0);
  const [notes, setNotes] = useState("");
  const skill = assessmentSkills[index];
  if (!skill || (assessmentId !== "cycle-2024" && assessmentId !== "assessment-james")) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">This assessment is not open in the current cycle.</p>
        <Link href="/assessments/cycles" className="text-sm font-bold text-navy">
          Back to cycles
        </Link>
      </div>
    );
  }
  const selected = getRating(skill.id);
  const progress = Math.round((ratedCount() / assessmentSkills.length) * 100);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_240px]" data-ratings={version}>
      <div>
        <PageHeader
          breadcrumbs={<p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">James Miller</p>}
          title="Self-Assessment: Senior Solutions Architect"
          description={`${skill.name}. Target: ${skill.target}.`}
        />
        <section className="rounded-2xl border border-border-slate bg-white p-6">
          <h2 className="text-sm font-bold text-navy">Select Your Proficiency Level</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {levels.map((label, levelIndex) => {
              const level = levelIndex + 1;
              return (
                <button
                  key={label}
                  type="button"
                  className={cn(
                    "rounded-xl border px-3 py-4 text-left",
                    selected === level ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy",
                  )}
                  onClick={() => {
                    saveRating(skill.id, level);
                    setVersion((value) => value + 1);
                  }}
                >
                  <span className="block text-lg font-bold">{level}</span>
                  <span className="text-[10px] font-bold uppercase">{label}</span>
                </button>
              );
            })}
          </div>
          <h3 className="mt-6 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Observable Behavioural Indicators
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy">
            {skill.indicators.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <label className="mt-6 block text-xs font-bold tracking-widest text-slate-400 uppercase" htmlFor="evidence-notes">
            Evidence & Comments
          </label>
          <Textarea
            id="evidence-notes"
            className="mt-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add a note for the manager review."
          />
          <div className="mt-4 flex justify-between">
            <Button type="button" variant="secondary" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>
              Previous Skill
            </Button>
            <span className="self-center text-xs font-bold text-slate-400">
              Skill {index + 1} of {assessmentSkills.length}
            </span>
            <Button
              type="button"
              disabled={index === assessmentSkills.length - 1}
              onClick={() => setIndex((value) => value + 1)}
            >
              Next Skill
            </Button>
          </div>
        </section>
      </div>
      <aside className="h-fit rounded-2xl border border-border-slate bg-white p-5">
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Assessment Progress</p>
        <p className="mt-2 text-3xl font-bold text-navy">{progress}%</p>
        <p className="mt-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Skills to Rate</p>
        <ul className="mt-2 space-y-2 text-sm">
          {assessmentSkills.map((item, itemIndex) => (
            <li key={item.id}>
              <button type="button" className="font-bold text-navy" onClick={() => setIndex(itemIndex)}>
                {item.name}
                {getRating(item.id) ? ` · L${getRating(item.id)}` : ""}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
