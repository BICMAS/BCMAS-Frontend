"use client";

import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  isComplete,
  type AssessmentDelivery,
  type DeliveryAssessment,
  type DeliveryItem,
  type ItemResponse,
} from "../../delivery";
import { AiDisclaimer, AiErrorState, AiInlineError } from "../shared/ai-states";
import { useAssessmentDelivery } from "./use-delivery";

const blank = (item_id: string): ItemResponse => ({ item_id, response_text: null, selected_option_key: null, rating: null });
const draftKey = (id: string) => `cfp-ai-assessment-draft:${id}`;

/** Interactive assessment: one question at a time, free navigation, answers kept as a local draft until submitted. */
export function TakeAssessmentView({ assessmentId, delivery: injected }: { assessmentId: string; delivery?: AssessmentDelivery }) {
  const delivery = useAssessmentDelivery(injected);
  const [assessment, setAssessment] = useState<DeliveryAssessment | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!delivery) return;
    let cancelled = false;
    delivery
      .getAssessment(assessmentId)
      .then((a) => !cancelled && setAssessment(a))
      .catch((error: unknown) => !cancelled && setLoadError(error));
    return () => {
      cancelled = true;
    };
  }, [delivery, assessmentId, attempt]);

  if (loadError) {
    return (
      <AiErrorState
        error={loadError}
        onRetry={() => {
          setLoadError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!delivery || !assessment) return <LoadingSkeleton rows={4} />;
  return <AssessmentPlayer assessment={assessment} delivery={delivery} />;
}

function AssessmentPlayer({ assessment, delivery }: { assessment: DeliveryAssessment; delivery: AssessmentDelivery }) {
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, ItemResponse>>(() => {
    try {
      const saved = sessionStorage.getItem(draftKey(assessment.assessment_id));
      if (saved) return JSON.parse(saved) as Record<string, ItemResponse>;
    } catch {
      // storage unavailable: start empty
    }
    return {};
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(assessment.status === "submitted" ? "earlier" : null);

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey(assessment.assessment_id), JSON.stringify(responses));
    } catch {
      // storage unavailable: answers stay in memory only
    }
  }, [assessment.assessment_id, responses]);

  const items = assessment.items;
  const item = items[index]!;
  const answered = useMemo(() => items.filter((i) => isComplete(i, responses[i.item_id])).length, [items, responses]);
  const update = (patch: Partial<ItemResponse>) =>
    setResponses((current) => ({ ...current, [item.item_id]: { ...(current[item.item_id] ?? blank(item.item_id)), ...patch } }));

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await delivery.submit(
        assessment.assessment_id,
        items.map((i) => responses[i.item_id] ?? blank(i.item_id)),
      );
      setSubmittedAt(result.submitted_at);
      try {
        sessionStorage.removeItem(draftKey(assessment.assessment_id));
      } catch {
        // ignore
      }
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedAt) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title={assessment.title} />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2Icon className="size-10 text-green-deep" aria-hidden />
            <h2 className="text-xl font-bold text-navy">Responses submitted</h2>
            <p className="max-w-md text-sm text-slate-500">
              An assessor reviews your responses with AI support. Your results and feedback appear once the review is complete.
            </p>
            <Link href="/ai/assessments" className={buttonVariants({ variant: "secondary" })}>
              Back to assessments
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={assessment.title}
        description={assessment.objectives.join(" ")}
        breadcrumbs={
          <Link href="/ai/assessments" className="text-xs font-bold text-slate-500 hover:underline">
            ← AI Talent Assessment
          </Link>
        }
      />
      <nav aria-label="Questions" className="flex flex-wrap items-center gap-2">
        {items.map((i, n) => (
          <button
            key={i.item_id}
            type="button"
            aria-label={`Question ${n + 1}${isComplete(i, responses[i.item_id]) ? " (answered)" : ""}`}
            aria-current={n === index ? "step" : undefined}
            onClick={() => setIndex(n)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full border text-xs font-bold",
              n === index ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy",
              isComplete(i, responses[i.item_id]) && n !== index && "border-green-deep text-green-deep",
            )}
          >
            {n + 1}
          </button>
        ))}
        <span className="ml-2 text-xs text-slate-500">
          {answered} of {items.length} answered
        </span>
      </nav>
      <Card>
        <CardHeader>
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Question {index + 1} of {items.length} · {item.competency} · ~{item.estimated_minutes} min
          </p>
          <CardTitle className="text-navy">{item.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-navy">{item.stem}</p>
          <ItemInput item={item} response={responses[item.item_id] ?? blank(item.item_id)} onChange={update} />
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" disabled={index === 0} onClick={() => setIndex((n) => n - 1)}>
          <ChevronLeftIcon className="size-4" aria-hidden /> Previous
        </Button>
        {index < items.length - 1 ? (
          <Button type="button" onClick={() => setIndex((n) => n + 1)}>
            Next <ChevronRightIcon className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button type="button" disabled={submitting || answered < items.length} onClick={submit}>
            {submitting ? "Submitting…" : "Submit responses"}
          </Button>
        )}
      </div>
      {answered < items.length && index === items.length - 1 ? (
        <p className="text-right text-xs text-slate-500">Answer every question to submit.</p>
      ) : null}
      <AiInlineError error={submitError} />
      <AiDisclaimer>Only what you write counts as evidence. Ratings you give yourself are compared with your evidence, not scored directly.</AiDisclaimer>
    </div>
  );
}

function ItemInput({
  item,
  response,
  onChange,
}: {
  item: DeliveryItem;
  response: ItemResponse;
  onChange: (patch: Partial<ItemResponse>) => void;
}) {
  if (item.type === "situational_judgement" && item.options) {
    return (
      <RadioGroup
        aria-label="Choose one option"
        value={response.selected_option_key ?? ""}
        onValueChange={(value) => onChange({ selected_option_key: String(value) })}
        className="space-y-2"
      >
        {item.options.map((o) => (
          <label key={o.option_key} className="flex items-start gap-3 rounded-lg border border-border-slate p-3 text-sm text-navy">
            <RadioGroupItem value={o.option_key} aria-label={o.text} />
            <span>{o.text}</span>
          </label>
        ))}
      </RadioGroup>
    );
  }
  const rating = item.rating_scale;
  return (
    <div className="space-y-4">
      {rating ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-navy">Rating</legend>
          <div className="flex flex-wrap gap-2">
            {rating.map((r) => (
              <button
                key={r.level}
                type="button"
                aria-pressed={response.rating === r.level}
                onClick={() => onChange({ rating: r.level })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-semibold",
                  response.rating === r.level ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy",
                )}
              >
                {r.level} · {r.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor={`answer-${item.item_id}`}>{rating ? "Work example" : "Your answer"}</Label>
        <Textarea
          id={`answer-${item.item_id}`}
          rows={6}
          maxLength={8000}
          value={response.response_text ?? ""}
          onChange={(e) => onChange({ response_text: e.target.value })}
        />
      </div>
    </div>
  );
}
