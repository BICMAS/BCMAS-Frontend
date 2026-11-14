"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getOwnPromotion, submitPromotionAnswers } from "@/features/talent/services/mock-promotion";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { cn } from "@/lib/utils";

const levels = [
  { rank: 1, label: "Foundation" },
  { rank: 2, label: "Intermediate" },
  { rank: 3, label: "Proficient" },
  { rank: 4, label: "Advanced" },
  { rank: 5, label: "Expert" },
];

export function PromotionStartView({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const user = useHydratedUser();
  const record = user ? getOwnPromotion(assessmentId, user.id) : null;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);

  if (!user) return null;
  if (!record) {
    return <p className="text-sm text-slate-500">This promotion assignment is not available to you.</p>;
  }
  if (record.status === "Submitted" || record.status === "Reviewed") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-3xl font-bold text-navy">Assessment submitted</h1>
        <Button type="button" onClick={() => router.push(`/me/promotion/${record.id}/results`)}>
          View readiness report
        </Button>
      </div>
    );
  }

  const question = record.rubric[index];
  if (!question) return null;
  const selected = answers[question.skill] ?? null;

  const next = async () => {
    if (!selected) {
      toast.error("Choose a level");
      return;
    }
    if (index < record.rubric.length - 1) {
      setIndex(index + 1);
      return;
    }
    setPending(true);
    try {
      await submitPromotionAnswers(
        record.id,
        user.id,
        record.rubric.map((row) => ({
          skill: row.skill,
          score: row.skill === question.skill ? selected : (answers[row.skill] ?? 0),
        })),
      );
      router.push(`/me/promotion/${record.id}/results`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Question {index + 1} of {record.rubric.length}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-navy">{record.roleTitle}</h1>
        <p className="mt-3 text-slate-500">
          Rate yourself against the approved profile for this prospective role. Your result uses the fixed rubric.
        </p>
      </div>
      <section className="rounded-3xl border border-border-slate bg-white p-8 shadow-sm">
        <p className="text-xs font-bold tracking-widest text-green-deep uppercase">Required {question.requiredLevel}</p>
        <h2 className="mt-3 text-xl font-bold text-navy">{question.skill}</h2>
        <div className="mt-6 space-y-3">
          {levels.map((level) => (
            <button
              key={level.rank}
              type="button"
              onClick={() => setAnswers((current) => ({ ...current, [question.skill]: level.rank }))}
              className={cn(
                "flex w-full items-center rounded-2xl border px-4 py-3 text-left text-sm font-bold text-navy",
                selected === level.rank ? "border-navy bg-slate-50" : "border-border-slate hover:bg-slate-50",
              )}
            >
              {level.label}
            </button>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          {index > 0 ? (
            <Button type="button" variant="secondary" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          ) : null}
          <Button type="button" className="flex-1" disabled={pending} onClick={() => void next()}>
            {index === record.rubric.length - 1 ? "Submit answers" : "Continue"}
          </Button>
        </div>
      </section>
    </div>
  );
}
