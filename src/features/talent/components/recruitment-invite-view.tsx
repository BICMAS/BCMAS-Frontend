"use client";

import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { AuthBrandHeader } from "@/features/authentication/components/auth-brand-header";
import { AuthCard } from "@/features/authentication/components/auth-card";
import {
  getRecruitmentByToken,
  inviteState,
  knowledgeLevels,
  recruitmentRows,
  recruitmentSnapshot,
  scenarioChoices,
  submitCandidateInvite,
  subscribeRecruitment,
} from "@/features/talent/services/mock-recruitment";
import { cn } from "@/lib/utils";

export function RecruitmentInviteView({ token }: { token: string }) {
  const snapshot = useSyncExternalStore(subscribeRecruitment, recruitmentSnapshot, () => "pending");
  const stored = snapshot && snapshot !== "pending" ? recruitmentRows(snapshot) : null;
  const storedRecord = stored?.find((item) => item.inviteToken === token) ?? null;
  const [memoryState] = useState(() => inviteState(token));
  const state: "invalid" | "used" | "open" = storedRecord
    ? storedRecord.progress === "Invited"
      ? "open"
      : "used"
    : stored
      ? "invalid"
      : memoryState;
  const record = state === "open" ? (storedRecord ?? getRecruitmentByToken(token)) : null;
  const [knowledge, setKnowledge] = useState<Record<string, number>>({});
  const [scenarioChoiceId, setScenarioChoiceId] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (snapshot === "pending") return null;

  if (done) {
    return (
      <AuthCard contentClassName="p-0">
        <AuthBrandHeader title="Assessment" subtitle="Candidate invite" />
        <div className="space-y-2 p-8">
          <h2 className="text-xl font-bold text-navy">Assessment submitted</h2>
          <p className="text-sm text-slate-500">
            Your knowledge and scenario answers are with the hiring team. You do not need an account.
          </p>
        </div>
      </AuthCard>
    );
  }

  if (state !== "open" || !record) {
    return (
      <AuthCard contentClassName="p-0">
        <AuthBrandHeader title="Assessment" subtitle="Candidate invite" />
        <div className="space-y-2 p-8">
          <h2 className="text-xl font-bold text-navy">This invite is unavailable</h2>
          <p className="text-sm text-slate-500">
            {state === "used"
              ? "This link has already been used."
              : "This link is not a valid recruitment assessment."}
          </p>
        </div>
      </AuthCard>
    );
  }

  const knowledgeComplete = record.rubric.every((row) => knowledge[row.skill] != null);
  const ready = knowledgeComplete && scenarioChoiceId.length > 0;

  return (
    <AuthCard size="lg" contentClassName="p-0">
      <AuthBrandHeader title="Assessment" subtitle={record.roleTitle} />
      <form
        className="space-y-8 p-8"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!ready) return;
          setPending(true);
          try {
            const saved = await submitCandidateInvite(token, {
              knowledge: record.rubric.map((row) => ({ skill: row.skill, score: knowledge[row.skill] ?? 0 })),
              scenarioChoiceId,
            });
            if (!saved) return;
            setDone(true);
          } finally {
            setPending(false);
          }
        }}
      >
        <div>
          <p className="text-sm text-slate-500">
            {record.candidateName} · {record.durationMinutes} minutes · deadline {record.deadline}
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="font-bold text-navy">Knowledge</h2>
          {record.rubric.map((row) => (
            <fieldset key={row.skill} className="space-y-2">
              <legend className="text-sm font-bold text-navy">{row.skill}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {knowledgeLevels.map((level) => (
                  <button
                    key={level.rank}
                    type="button"
                    onClick={() => setKnowledge((current) => ({ ...current, [row.skill]: level.rank }))}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-sm font-bold text-navy",
                      knowledge[row.skill] === level.rank
                        ? "border-navy bg-slate-50"
                        : "border-border-slate hover:bg-slate-50",
                    )}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-bold text-navy">Scenario</h2>
          <p className="text-sm text-slate-500">
            A customer situation requires the standard for {record.roleTitle}. Choose the response that matches what
            you would do.
          </p>
          {scenarioChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => setScenarioChoiceId(choice.id)}
              className={cn(
                "block w-full rounded-xl border px-3 py-3 text-left text-sm text-navy",
                scenarioChoiceId === choice.id ? "border-navy bg-slate-50 font-bold" : "border-border-slate",
              )}
            >
              {choice.label}
            </button>
          ))}
        </section>

        <Button type="submit" disabled={!ready || pending} className="w-full">
          {pending ? "Submitting…" : "Submit assessment"}
        </Button>
      </form>
    </AuthCard>
  );
}
