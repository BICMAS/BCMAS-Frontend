"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { frameworkLevels } from "@/features/skills/services/mock-skills";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/types/user";

import {
  levelDescription,
  levelLabel,
  myAssessment,
  requestAdjustment,
  saveSelfRating,
  selfAssessmentClosed,
  selfAssessmentEnds,
  submitSelfAssessment,
} from "../services/capability";
import type { CapabilityAssessment } from "../types";
import { formatDay, runCapability, WithCapabilityUser } from "../use-capability";
import { EvidenceSection } from "./evidence";

export function NoAssessment() {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-border-slate bg-white p-8">
      <h1 className="text-xl font-bold text-navy">No assessment is open for you</h1>
      <p className="mt-2 text-sm text-slate-500">
        You are assessed when a cycle is open, your role mapping is approved and your role profile is approved.
      </p>
      <Link href="/me" className={cn(buttonVariants({ variant: "secondary" }), "mt-4")}>
        Back to home
      </Link>
    </div>
  );
}

export function AssessmentStartView({ assessmentId }: { assessmentId: string }) {
  return <WithCapabilityUser>{(user) => <SelfAssessment user={user} routeId={assessmentId} />}</WithCapabilityUser>;
}

function SelfAssessment({ user, routeId }: { user: MockUser; routeId: string }) {
  const router = useRouter();
  const assessment = myAssessment(user);
  const [index, setIndex] = useState(() => Math.max(0, assessment?.items.findIndex((i) => i.self === null) ?? 0));
  if (!assessment) return <NoAssessment />;
  if (assessment.submittedAt) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border-slate bg-white p-8">
        <h1 className="text-xl font-bold text-navy">You have submitted this self-assessment</h1>
        <p className="mt-2 text-sm text-slate-500">Your ratings can no longer be changed.</p>
        <Link href={`/me/assessments/${routeId}/results`} className={cn(buttonVariants(), "mt-4")}>
          View progress
        </Link>
      </div>
    );
  }
  if (selfAssessmentClosed(assessment)) return <Closed user={user} assessment={assessment} />;
  const item = assessment.items[index]!;
  const ends = selfAssessmentEnds(assessment);
  const last = index === assessment.items.length - 1;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Question {index + 1} of {assessment.items.length}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-navy">Let&apos;s assess your current Capabilities</h1>
        <p className="mt-3 max-w-2xl text-slate-500">
          Rate yourself against the {assessment.roleTitle} profile. It takes about <strong>10 minutes</strong>
          {ends ? `, and closes at the end of ${formatDay(ends)}` : ""}.
        </p>
      </div>
      <details className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600" open={index === 0}>
        <summary className="cursor-pointer font-bold text-navy">How it works</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your self-rating is a starting point. Your result comes from your reviewer&apos;s check of your evidence.</li>
          <li>
            {assessment.reviewer.name} reviews your ratings and evidence. HR and your Organisation Admin can see your results.
            Colleagues cannot.
          </li>
          <li>You see your results once every skill has been reviewed and results are released.</li>
          <li>
            The purpose is development. Results are not used alone to decide pay, promotion, discipline or dismissal.
          </li>
        </ul>
      </details>

      <section className="rounded-3xl border border-border-slate bg-white p-8 shadow-sm">
        <p className="text-xs font-bold tracking-widest text-green-deep uppercase">
          {item.category === "technical" ? "Technical" : "Behavioural"}
        </p>
        <h2 className="mt-3 text-xl font-bold text-navy">{item.name}</h2>
        <p className="mt-1 text-sm text-slate-500">Your role requires {levelLabel(item.required)}.</p>
        <fieldset className="mt-6 space-y-3">
          <legend className="sr-only">Your level in {item.name}</legend>
          {frameworkLevels().map((level) => (
            <label
              key={level.rank}
              className={cn(
                "flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3",
                item.self === level.rank ? "border-navy bg-slate-50" : "border-border-slate hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                name={`level-${item.skillId}`}
                className="mt-1"
                checked={item.self === level.rank}
                onChange={() => runCapability(() => saveSelfRating(user, assessment.id, item.skillId, level.rank))}
              />
              <span>
                <span className="block text-sm font-bold text-navy">
                  {level.rank} · {level.label}
                </span>
                <span className="text-sm text-slate-500">{levelDescription(item.skillId, level.rank)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-bold text-navy">Evidence</h3>
          <EvidenceSection key={item.skillId} user={user} assessmentId={assessment.id} item={item} canAdd />
        </div>
        <div className="mt-6 flex gap-3">
          {index > 0 ? (
            <Button type="button" variant="secondary" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          ) : null}
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              if (item.self === null) toast.error("Choose a level");
              else if (last) router.push(`/me/assessments/${routeId}/review`);
              else setIndex(index + 1);
            }}
          >
            {last ? "Review answers" : "Continue"}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function AssessmentReviewView({ assessmentId }: { assessmentId: string }) {
  return <WithCapabilityUser>{(user) => <Review user={user} routeId={assessmentId} />}</WithCapabilityUser>;
}

function Review({ user, routeId }: { user: MockUser; routeId: string }) {
  const router = useRouter();
  const assessment = myAssessment(user);
  if (!assessment) return <NoAssessment />;
  if (selfAssessmentClosed(assessment)) return <Closed user={user} assessment={assessment} />;
  const submitted = !!assessment.submittedAt;
  const missing = assessment.items.filter((i) => i.self === null).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy">Review your self-assessment</h1>
        <p className="mt-2 text-sm text-slate-500">
          {assessment.roleTitle} · profile {assessment.profileVersion}
        </p>
      </div>
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <ul className="divide-y divide-border-slate">
          {assessment.items.map((item) => (
            <li key={item.skillId} className="space-y-2 py-4">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-navy">{item.name}</span>
                <span className="text-sm text-slate-600">{item.self === null ? "Not rated" : levelLabel(item.self)}</span>
              </p>
              <EvidenceSection user={user} assessmentId={assessment.id} item={item} canAdd={!submitted} />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Your answers will be shared with {assessment.reviewer.name} for verification. You can submit once; ratings cannot be
          changed afterwards.
        </p>
      </section>
      {submitted ? (
        <Link href={`/me/assessments/${routeId}/results`} className={cn(buttonVariants())}>
          View progress
        </Link>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={missing > 0}
            onClick={() => {
              if (runCapability(() => submitSelfAssessment(user, assessment.id), "Self-assessment submitted")) {
                router.push(`/me/assessments/${routeId}/results`);
              }
            }}
          >
            Submit Assessment
          </Button>
          <Link href={`/me/assessments/${routeId}/start`} className={cn(buttonVariants({ variant: "secondary" }))}>
            {missing ? `Rate ${missing} more skill${missing === 1 ? "" : "s"}` : "Change ratings"}
          </Link>
          {/* Ratings and evidence save as they are entered. */}
          <Link href="/me" className={cn(buttonVariants({ variant: "ghost" }))}>
            Save as Draft
          </Link>
        </div>
      )}
      <Adjustments user={user} assessment={assessment} />
    </div>
  );
}

function Closed({ user, assessment }: { user: MockUser; assessment: CapabilityAssessment }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-border-slate bg-white p-8">
        <h1 className="text-xl font-bold text-navy">Self-assessment has closed</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your ratings so far are saved. Ask {assessment.reviewer.name} or your Organisation Admin for an extension.
        </p>
      </div>
      <Adjustments user={user} assessment={assessment} />
    </div>
  );
}

/** Extra time, another form of evidence or other support. */
export function Adjustments({ user, assessment }: { user: MockUser; assessment: CapabilityAssessment }) {
  const [text, setText] = useState("");
  return (
    <section className="space-y-3 rounded-2xl border border-border-slate bg-white p-6" aria-label="Adjustments">
      <h2 className="font-bold text-navy">Need an adjustment?</h2>
      <p className="text-sm text-slate-500">Ask for extra time, another form of evidence or other support.</p>
      {assessment.adjustments.map((a) => (
        <p key={a.at} className="rounded-lg bg-slate-50 p-3 text-sm text-navy">
          {a.request}
          <span className="block text-xs text-slate-500">
            {a.response ? `${a.response.by}: ${a.response.text}` : "Waiting for a response"}
          </span>
        </p>
      ))}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (runCapability(() => requestAdjustment(user, assessment.id, text), "Request sent")) setText("");
        }}
      >
        <Textarea aria-label="Adjustment request" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}>
          Send request
        </Button>
      </form>
    </section>
  );
}
