"use client";

import { CheckCircle2Icon, ClockIcon, FlagIcon, LifeBuoyIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  RecruitmentError,
  recruitmentRevision,
  subscribeRecruitment,
} from "../services/vacancies";
import {
  getCandidateAssessment,
  requestSupport,
  saveAnswer,
  setPosition,
  startAssessment,
  submitAssessment,
  toggleFlag,
} from "../services/delivery";
import { formatDate } from "./recruitment-shared";

/** Candidate assessment experience (guide §13). No login: the emailed link is the credential. */
export function CandidateAssessmentView({ token }: { token: string }) {
  const revision = useSyncExternalStore(subscribeRecruitment, recruitmentRevision, () => 0);
  const [tick, setTick] = useState(0);
  const view = useMemo(() => {
    void revision;
    void tick;
    return getCandidateAssessment(token);
  }, [token, revision, tick]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [support, setSupport] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Countdown: refresh once a second while the candidate is working.
  useEffect(() => {
    if (view?.status !== "in_progress") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [view?.status]);

  const attempt = (fn: () => void) => {
    try {
      fn();
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof RecruitmentError ? e.message : "Something went wrong. Your saved answers are safe; please try again.");
      return false;
    }
  };

  if (!view) {
    return (
      <Card>
        <h1 className="text-xl font-bold text-navy">Assessment link not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          Please use the most recent link we emailed you. If you were sent a new link, older links no longer work.
        </p>
      </Card>
    );
  }

  const header = (
    <>
      <p className="text-xs font-bold tracking-widest text-green-deep uppercase">{view.organisationName}</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">{view.assessmentName}</h1>
      <p className="mt-1 text-sm text-slate-500">Role-based assessment for {view.vacancyTitle}</p>
    </>
  );

  if (view.status === "expired") {
    return (
      <Card>
        {header}
        <p className="mt-6 rounded-xl bg-warning-soft p-4 text-sm text-warning-soft-foreground">
          This link expired on {formatDate(view.expiresAt)}. Contact {view.supportEmail} and we can send you a new link.
        </p>
      </Card>
    );
  }

  if (view.status === "submitted") {
    return (
      <Card>
        {header}
        <div className="mt-6 space-y-2 rounded-xl bg-success-soft p-5 text-success-soft-foreground" role="status">
          <p className="flex items-center gap-2 text-lg font-bold">
            <CheckCircle2Icon className="size-5" aria-hidden />
            Assessment submitted
          </p>
          <p className="text-sm">Thank you. Your answers have been received and we will email you about the next steps.</p>
        </div>
      </Card>
    );
  }

  if (view.status === "invited") {
    return (
      <Card>
        {header}
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Time allowed", `${view.durationMinutes} minutes`],
            ["Questions", String(view.items.length)],
            ["Attempts", "1"],
          ].map(([label, value]) => (
            <li key={label} className="rounded-xl border border-border-slate p-4">
              <p className="text-lg font-bold text-navy">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </li>
          ))}
        </ul>
        <section className="mt-6 space-y-2 text-sm text-navy">
          <h2 className="font-bold">Before you start</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>This assessment checks the skills the role needs. Answer on your own, based on how you would act at work.</li>
            <li>You see one question at a time and can move back and forth. Your answers save automatically.</li>
            <li>The timer starts when you press Start and keeps running if you leave. If your connection drops, open the same link to carry on.</li>
            <li>When time runs out, the answers you have saved are submitted.</li>
          </ul>
          <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-green-deep" aria-hidden />
            Your answers are used only to assess this application and are reviewed by people. If you need an adjustment
            (for example more time), contact {view.supportEmail} before you start.
          </p>
          <p className="text-xs text-slate-500">This link is personal to you and expires on {formatDate(view.expiresAt)}.</p>
        </section>
        {error ? <ErrorText text={error} /> : null}
        <Button type="button" className="mt-6 w-full sm:w-auto" onClick={() => attempt(() => startAssessment(token))}>
          Start Assessment
        </Button>
      </Card>
    );
  }

  // In progress
  const index = Math.min(view.position, view.items.length - 1);
  const item = view.items[index]!;
  const answered = view.items.filter((i) => isAnswered(view.answers[i.id], drafts[i.id])).length;
  const unanswered = view.items.length - answered;
  const flagged = view.flagged.includes(item.id);
  const minutes = Math.floor((view.remainingSeconds ?? 0) / 60);
  const seconds = (view.remainingSeconds ?? 0) % 60;
  const textValue = drafts[item.id] ?? view.answers[item.id]?.text ?? "";

  function flushText(itemId: string) {
    if (textTimer.current) clearTimeout(textTimer.current);
    const text = drafts[itemId];
    if (text === undefined) return;
    if (attempt(() => saveAnswer(token, itemId, { text }))) setSaved("Saved");
  }

  function go(to: number) {
    if (item.responseType === "case_response") flushText(item.id);
    attempt(() => setPosition(token, to));
  }

  return (
    <Card wide>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>{header}</div>
        <p
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold",
            (view.remainingSeconds ?? 0) < 300 ? "bg-warning-soft text-warning-soft-foreground" : "bg-slate-100 text-navy",
          )}
          aria-label="Time remaining"
        >
          <ClockIcon className="size-4" aria-hidden />
          {minutes}:{String(seconds).padStart(2, "0")}
        </p>
      </div>

      <div className="mt-6" aria-label="Progress">
        <p className="text-xs font-semibold text-slate-500">
          Question {index + 1} of {view.items.length} · {answered} answered
        </p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-green-lime" style={{ width: `${(answered / view.items.length) * 100}%` }} />
        </div>
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Questions">
          {view.items.map((q, i) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Question ${i + 1}${isAnswered(view.answers[q.id], drafts[q.id]) ? ", answered" : ""}${view.flagged.includes(q.id) ? ", flagged" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "size-8 rounded-lg border text-xs font-bold",
                  i === index ? "border-navy bg-navy text-white" : isAnswered(view.answers[q.id], drafts[q.id]) ? "border-green-lime bg-green-lime/20 text-navy" : "border-border-slate bg-white text-slate-500",
                  view.flagged.includes(q.id) && "ring-2 ring-amber-400",
                )}
              >
                {i + 1}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <section className="mt-6 rounded-xl border border-border-slate p-5" aria-label={`Question ${index + 1}`}>
        <p className="text-base font-semibold text-navy">{item.text}</p>
        {item.responseType === "case_response" ? (
          <label className="mt-4 block text-xs font-bold text-navy">
            Your answer
            <Textarea
              className="mt-1 font-normal"
              rows={8}
              maxLength={5000}
              value={textValue}
              onChange={(e) => {
                const text = e.target.value;
                setDrafts((d) => ({ ...d, [item.id]: text }));
                setSaved("Saving…");
                if (textTimer.current) clearTimeout(textTimer.current);
                textTimer.current = setTimeout(() => {
                  if (attempt(() => saveAnswer(token, item.id, { text }))) setSaved("Saved");
                }, 800);
              }}
              onBlur={() => flushText(item.id)}
            />
          </label>
        ) : (
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Choose one answer</legend>
            {item.options.map((o) => {
              const checked = view.answers[item.id]?.optionId === o.id;
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm",
                    checked ? "border-navy bg-navy/5 text-navy" : "border-border-slate text-navy hover:bg-slate-50",
                  )}
                >
                  <input
                    type="radio"
                    name={`q-${item.id}`}
                    className="mt-1"
                    checked={checked}
                    onChange={() => {
                      if (attempt(() => saveAnswer(token, item.id, { optionId: o.id }))) setSaved("Saved");
                    }}
                  />
                  {o.text}
                </label>
              );
            })}
          </fieldset>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span aria-live="polite">{saved ?? "Answers save automatically."}</span>
          <Button type="button" variant="ghost" size="sm" aria-pressed={flagged} onClick={() => attempt(() => toggleFlag(token, item.id))}>
            <FlagIcon aria-hidden />
            {flagged ? "Flagged to revisit" : "Flag to revisit"}
          </Button>
        </div>
      </section>

      {error ? <ErrorText text={error} /> : null}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={() => setSupport(true)}>
          <LifeBuoyIcon aria-hidden />
          Request Support
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
            Previous
          </Button>
          {index < view.items.length - 1 ? (
            <Button type="button" onClick={() => go(index + 1)}>
              Next
            </Button>
          ) : (
            <Button
              type="button"
              variant="accent"
              onClick={() => {
                if (item.responseType === "case_response") flushText(item.id);
                setConfirming(true);
              }}
            >
              Submit Assessment
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit your assessment?</DialogTitle>
            <DialogDescription>
              {unanswered
                ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. You cannot change your answers after submitting.`
                : "You cannot change your answers after submitting."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Keep working
            </Button>
            <Button
              type="button"
              variant="accent"
              onClick={() => {
                if (attempt(() => submitAssessment(token))) setConfirming(false);
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SupportDialog
        open={support}
        email={view.supportEmail}
        onClose={() => setSupport(false)}
        onSend={(message) => attempt(() => requestSupport(token, message))}
      />
    </Card>
  );
}

function isAnswered(answer: { optionId?: string; text?: string } | undefined, draft?: string) {
  if (draft !== undefined) return draft.trim().length > 0;
  return Boolean(answer?.optionId || answer?.text?.trim());
}

function Card({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={cn("w-full rounded-2xl border border-border-slate bg-white p-6 shadow-sm sm:p-8", wide ? "max-w-3xl" : "max-w-xl")}>
      {children}
    </main>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-4 rounded-lg bg-error-soft px-3 py-2 text-sm text-error-soft-foreground">
      {text}
    </p>
  );
}

function SupportDialog({
  open,
  email,
  onClose,
  onSend,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  onSend: (message: string) => boolean;
}) {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const close = () => {
    setMessage("");
    setSent(false);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request support</DialogTitle>
          <DialogDescription>
            Tell us what is wrong. Your answers are saved and the timer keeps running. You can also email {email}.
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <p className="text-sm text-navy" role="status">
            Thank you. The recruitment team has your message and will contact you.
          </p>
        ) : (
          <label className="text-xs font-bold text-navy">
            What do you need help with?
            <Textarea className="mt-1 font-normal" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close}>
            Close
          </Button>
          {!sent ? (
            <Button type="button" disabled={!message.trim()} onClick={() => onSend(message) && setSent(true)}>
              Send
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
