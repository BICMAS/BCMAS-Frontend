"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import {
  getRating,
  listAssessmentQuestions,
  listRatingLevels,
  saveRating,
} from "@/features/me/services/portal-state";
import { cn } from "@/lib/utils";

export function AssessmentStartView({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const firstName = useSessionStore((state) => state.user.name.split(" ")[0]);
  const questions = listAssessmentQuestions();
  const levels = listRatingLevels();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(
    () => getRating(questions[0]?.id ?? "") ,
  );
  const [pending, setPending] = useState(false);
  const question = questions[index];

  if (!question) return null;

  const choose = (levelId: string) => {
    setSelected(levelId);
  };

  const next = async () => {
    if (!selected) {
      toast.error("Choose a confidence level");
      return;
    }
    setPending(true);
    try {
      await saveRating(question.id, selected);
      if (index < questions.length - 1) {
        const nextIndex = index + 1;
        setIndex(nextIndex);
        setSelected(getRating(questions[nextIndex]!.id));
        return;
      }
      router.push(`/me/assessments/${assessmentId}/review`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Question {index + 1} of {questions.length}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-navy">
          Help us understand your skills, {firstName}!
        </h1>
        <p className="mt-3 max-w-2xl text-slate-500">
          This assessment helps us match your current strengths with your role
          requirements. It takes about <strong>10 minutes</strong>.
        </p>
      </div>

      <section className="rounded-3xl border border-border-slate bg-white p-8 shadow-sm">
        <p className="text-xs font-bold tracking-widest text-green-deep uppercase">
          {question.name}
        </p>
        <h2 className="mt-3 text-xl font-bold text-navy">{question.prompt}</h2>
        <div className="mt-6 space-y-3">
          {levels.map((level) => (
            <button
              key={level.id}
              type="button"
              onClick={() => choose(level.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left",
                selected === level.id
                  ? "border-navy bg-slate-50"
                  : "border-border-slate hover:bg-slate-50",
              )}
            >
              <span className="text-sm font-bold text-navy">{level.label}</span>
              <span className="text-sm text-slate-500">{level.detail}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Why it matters for your role
          </p>
          <p className="mt-2 text-sm text-slate-600">{question.why}</p>
        </div>
        <div className="mt-6 flex gap-3">
          {index > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const previous = index - 1;
                setIndex(previous);
                setSelected(getRating(questions[previous]!.id));
              }}
            >
              Back
            </Button>
          ) : null}
          <Button type="button" className="flex-1" disabled={pending} onClick={next}>
            {index === questions.length - 1 ? "Review answers" : "Continue"}
          </Button>
        </div>
      </section>
    </div>
  );
}
