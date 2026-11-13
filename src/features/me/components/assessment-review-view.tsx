"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getRatingLabel,
  isAssessmentSubmitted,
  listAssessmentQuestions,
  saveAssessmentDraft,
  submitAssessment,
} from "@/features/me/services/portal-state";

export function AssessmentReviewView({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const questions = listAssessmentQuestions();
  const [labels, setLabels] = useState(() =>
    Object.fromEntries(questions.map((question) => [question.id, getRatingLabel(question.id)])),
  );
  const [pending, setPending] = useState<"draft" | "submit" | null>(null);
  const [done, setDone] = useState(() => isAssessmentSubmitted());

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Practical Scenario · AI Simulation
        </p>
        <h1 className="mt-2 text-3xl font-bold text-navy">Scenario: Multi-Region Outage</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          You are the lead architect during a critical failover event. The primary
          EU region is unresponsive. What is your first priority?
        </p>
        <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-deep">
          Verify Traffic Manager health probes and auto-failover to US-East-1.
        </p>
      </div>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-navy">Review your answers</h2>
        <ul className="space-y-3">
          {questions.map((question) => (
            <li
              key={question.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border-slate px-4 py-3"
            >
              <div>
                <p className="text-sm font-bold text-navy">{question.name}</p>
                <p className="text-xs text-slate-500">Self-Rating: {labels[question.id]}</p>
              </div>
              <Link
                href={`/me/assessments/${assessmentId}/start`}
                className="text-[10px] font-bold tracking-widest text-navy uppercase hover:underline"
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-400">
          Your answers will be shared with your line manager for verification. You
          can save as draft or submit now.
        </p>
      </section>

      <Button
        type="button"
        className="w-full"
        disabled={pending !== null}
        onClick={async () => {
          setPending("submit");
          try {
            await submitAssessment();
            setDone(true);
            toast.success("Assessment submitted");
            router.push(`/me/assessments/${assessmentId}/results`);
          } finally {
            setPending(null);
          }
        }}
      >
        {done ? "Submit again" : "Submit Assessment"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={pending !== null}
        onClick={async () => {
          setPending("draft");
          try {
            await saveAssessmentDraft();
            setLabels(
              Object.fromEntries(
                questions.map((question) => [question.id, getRatingLabel(question.id)]),
              ),
            );
            toast.success("Draft saved");
          } finally {
            setPending(null);
          }
        }}
      >
        Save as Draft
      </Button>
    </div>
  );
}
