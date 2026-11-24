"use client";

import { CheckCircle2Icon, KeyboardIcon, LifeBuoyIcon, MicIcon, MicOffIcon, RotateCcwIcon, ShieldCheckIcon, WifiIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CoachStage, type CoachPresence } from "@/features/ai/components/coaching/coach-stage";
import { useCoachSpeech, useSpeechInput } from "@/features/ai/components/coaching/coach-voice";
import { cn } from "@/lib/utils";

import {
  MAX_REPEATS,
  declineConsent,
  getCandidateInterview,
  giveConsent,
  repeatQuestion,
  reportTechnicalIssue,
  saveInterviewAnswer,
  setInterviewPosition,
  startInterview,
  submitInterview,
} from "../services/interview";
import { RecruitmentError, recruitmentRevision, subscribeRecruitment } from "../services/vacancies";
import { CameraSetup, CameraStrip, useSessionCamera } from "./candidate-camera";
import { formatDate } from "./recruitment-shared";

export const AI_INTERVIEWER = { name: "Ada", role: "AI interviewer" } as const;

/** AI-avatar competency interview (guide §14). No login: the emailed link is the credential. */
export function CandidateInterviewView({ token }: { token: string }) {
  const revision = useSyncExternalStore(subscribeRecruitment, recruitmentRevision, () => 0);
  const view = useMemo(() => {
    void revision;
    return getCandidateInterview(token);
  }, [token, revision]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"intro" | "equipment">("intro");

  const { camera, blocked } = useSessionCamera("interview", token, view);

  const run = (fn: () => void) => {
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
        <h1 className="text-xl font-bold text-navy">Interview link not found</h1>
        <p className="mt-2 text-sm text-slate-500">Please use the most recent link we emailed you. Older links stop working when a new one is sent.</p>
      </Card>
    );
  }

  const header = (
    <>
      <p className="text-xs font-bold tracking-widest text-green-deep uppercase">{view.organisationName}</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Interview for {view.vacancyTitle}</h1>
    </>
  );

  if (view.status === "expired") {
    return (
      <Card>
        {header}
        <p className="mt-6 rounded-xl bg-warning-soft p-4 text-sm text-warning-soft-foreground">
          This link expired on {formatDate(view.expiresAt)}. Contact {view.supportEmail} to arrange a new time.
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
            Interview complete
          </p>
          <p className="text-sm">Thank you. We have your answers and will email you about the next steps.</p>
        </div>
      </Card>
    );
  }

  if (view.status === "invited") {
    // Step 1: explain and get consent. Step 2: equipment check, then start.
    const showIntro = !view.consentGiven && step === "intro";
    return (
      <Card>
        {header}
        {showIntro ? (
          <Intro view={view} error={error} onContinue={() => setStep("equipment")} onDecline={(m) => run(() => declineConsent(token, m))} />
        ) : (
          <>
            {view.consentGiven ? (
              <p className="mt-4 text-sm text-slate-600">You have agreed to how the interview works. Check your equipment, then start.</p>
            ) : null}
            <CameraSetup stage="interview" token={token} value={view.camera} camera={camera} supportEmail={view.supportEmail} />
            <Equipment
              cameraBlocked={blocked}
              initialMode={view.answerMode ?? "text"}
              onReady={(mode, note) => {
                if (run(() => giveConsent(token, mode, note))) run(() => startInterview(token));
              }}
            />
            {error ? <ErrorText text={error} /> : null}
          </>
        )}
      </Card>
    );
  }

  return (
    <Card wide>
      {header}
      {blocked ? (
        <CameraSetup stage="interview" token={token} value={view.camera} camera={camera} supportEmail={view.supportEmail} paused />
      ) : (
        <CameraStrip value={view.camera} camera={camera} />
      )}
      <Interview token={token} view={view} run={run} paused={blocked} />
      {error ? <ErrorText text={error} /> : null}
    </Card>
  );
}

type View = NonNullable<ReturnType<typeof getCandidateInterview>>;

function Intro({
  view,
  error,
  onContinue,
  onDecline,
}: {
  view: View;
  error: string | null;
  onContinue: () => void;
  onDecline: (message: string) => boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [message, setMessage] = useState("");
  const [declined, setDeclined] = useState(false);
  return (
    <section className="mt-6 space-y-4 text-sm text-navy">
      <ul className="grid gap-3 sm:grid-cols-3">
        {[
          ["Questions", String(view.questions.length)],
          ["About", `${view.durationMinutes} minutes`],
          ["Answer by", "Voice or text"],
        ].map(([label, value]) => (
          <li key={label} className="rounded-xl border border-border-slate p-4">
            <p className="text-lg font-bold">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <h2 className="font-bold">How this interview works</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          <li>
            An AI interviewer, {AI_INTERVIEWER.name}, asks the same job-related questions that every candidate for this role is asked. You can
            hear each question read aloud and repeat it up to {MAX_REPEATS} times.
          </li>
          <li>You can speak your answers (turned into text in your browser) or type them. You can switch at any time.</li>
          <li>
            Only the content of your answers is assessed, against an approved scoring guide. Your appearance, accent, way of speaking,
            expressions and emotions are never assessed. No video is recorded; if a camera is used, its picture stays on your device.
          </li>
          <li>AI suggests scores and a person from the recruitment team checks and confirms every score.</li>
          <li>If something goes wrong you can report a problem or ask to reschedule; your answers are kept.</li>
        </ul>
      </div>
      <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-green-deep" aria-hidden />
        Your answers are used only to assess this application. If you need an adjustment or a different way to take part, contact{" "}
        {view.supportEmail}.
      </p>
      <label className="flex items-start gap-2">
        <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} aria-label="I agree to take part in the AI-avatar interview" />
        I understand how the interview works and agree to take part, including the use of AI to suggest scores for a person to confirm.
      </label>
      {error ? <ErrorText text={error} /> : null}
      {declined ? (
        <p className="rounded-lg bg-info-soft p-3 text-sm text-info-soft-foreground" role="status">
          Thank you. The recruitment team will contact you about an alternative.
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={() => setDeclining(true)}>
          I would prefer another way to take part
        </Button>
        <Button type="button" disabled={!agreed} onClick={onContinue}>
          Continue to equipment check
        </Button>
      </div>
      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask for an alternative</DialogTitle>
            <DialogDescription>Tell us what would work better for you. Nothing is recorded from the interview.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} aria-label="Your message" value={message} onChange={(e) => setMessage(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (onDecline(message)) {
                  setDeclined(true);
                  setDeclining(false);
                }
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Equipment({
  initialMode = "text",
  cameraBlocked,
  onReady,
}: {
  initialMode?: "voice" | "text";
  /** A required camera is not on yet. */
  cameraBlocked: boolean;
  onReady: (mode: "voice" | "text", note: string) => void;
}) {
  const [mode, setMode] = useState<"voice" | "text">(initialMode);
  const [heard, setHeard] = useState("");
  const mic = useSpeechInput((text) => setHeard((h) => `${h} ${text}`.trim()));
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const voiceReady = mode === "text" || (mic.supported && heard.length > 0);

  return (
    <section className="mt-6 space-y-4" aria-label="Equipment check">
      <h2 className="font-bold text-navy">Equipment check</h2>
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <WifiIcon className="size-4" aria-hidden />
        {online ? "Your connection is working." : "You appear to be offline. Reconnect before starting."}
      </p>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-2 text-xs font-bold text-navy">How would you like to answer?</legend>
        <label className={cn("flex cursor-pointer items-start gap-2 rounded-xl border p-4 text-sm", mode === "voice" ? "border-navy" : "border-border-slate", !mic.supported && "opacity-60")}>
          <input type="radio" name="mode" checked={mode === "voice"} disabled={!mic.supported} onChange={() => setMode("voice")} className="mt-1" />
          <span>
            <span className="flex items-center gap-1 font-bold text-navy">
              <MicIcon className="size-4" aria-hidden /> Speak my answers
            </span>
            <span className="text-xs text-slate-500">
              {mic.supported ? "Your speech is turned into text that you can check and edit." : "Not available in this browser. Please type your answers."}
            </span>
          </span>
        </label>
        <label className={cn("flex cursor-pointer items-start gap-2 rounded-xl border p-4 text-sm", mode === "text" ? "border-navy" : "border-border-slate")}>
          <input type="radio" name="mode" checked={mode === "text"} onChange={() => setMode("text")} className="mt-1" />
          <span>
            <span className="flex items-center gap-1 font-bold text-navy">
              <KeyboardIcon className="size-4" aria-hidden /> Type my answers
            </span>
            <span className="text-xs text-slate-500">Always available.</span>
          </span>
        </label>
      </fieldset>
      {mode === "voice" ? (
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <p className="text-navy">Test your microphone: press the button and say a short sentence.</p>
          <Button type="button" variant="secondary" className="mt-2" onClick={() => (mic.listening ? mic.stop() : mic.start())}>
            {mic.listening ? <MicOffIcon aria-hidden /> : <MicIcon aria-hidden />}
            {mic.listening ? "Stop" : "Test microphone"}
          </Button>
          <p className="mt-2 text-xs text-slate-600" aria-live="polite">
            {heard ? `We heard: "${heard}"` : mic.listening ? "Listening…" : "Nothing heard yet."}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Your browser&apos;s speech service turns your voice into text.</p>
        </div>
      ) : null}
      <Button
        type="button"
        disabled={!online || !voiceReady || cameraBlocked}
        onClick={() => onReady(mode, mode === "voice" ? "Microphone tested." : "Typing chosen.")}
      >
        Start Interview
      </Button>
    </section>
  );
}

function Interview({
  token,
  view,
  run,
  paused,
}: {
  token: string;
  view: View;
  run: (fn: () => void) => boolean;
  /** Hidden because a required camera is off; typed text is kept. */
  paused: boolean;
}) {
  const index = Math.min(view.position, view.questions.length - 1);
  const question = view.questions[index]!;
  const speech = useCoachSpeech();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spokenFor = useRef<string | null>(null);
  const text = drafts[question.id] ?? view.answers[question.id]?.text ?? "";
  const repeats = view.answers[question.id]?.repeats ?? 0;
  const mode = view.answerMode ?? "text";

  const save = (id: string, value: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (run(() => saveInterviewAnswer(token, id, value, mode))) setSaved("Saved");
  };
  const mic = useSpeechInput((spoken) => {
    const next = `${drafts[question.id] ?? view.answers[question.id]?.text ?? ""} ${spoken}`.trim();
    setDrafts((d) => ({ ...d, [question.id]: next }));
    save(question.id, next);
  });

  // The interviewer reads each new question aloud once (when voice is on).
  useEffect(() => {
    if (paused || !speech.enabled || spokenFor.current === question.id) return;
    spokenFor.current = question.id;
    speech.speak(question.text);
  }, [paused, question.id, question.text, speech]);

  // Nothing is asked or heard while the interview is paused.
  useEffect(() => {
    if (!paused) return;
    if (speech.speaking) speech.stop();
    if (mic.listening) mic.stop();
  }, [paused, speech, mic]);

  const presence: CoachPresence = mic.listening ? "listening" : speech.speaking ? "speaking" : "ready";

  function go(to: number) {
    save(question.id, text);
    speech.stop();
    run(() => setInterviewPosition(token, to));
  }

  return (
    <div hidden={paused} className="mt-6 space-y-5">
      <CoachStage name={AI_INTERVIEWER.name} role={`${AI_INTERVIEWER.role} · ${view.vacancyTitle}`} presence={presence} voice={speech} />
      <div>
        <p className="text-xs font-semibold text-slate-500">
          Question {index + 1} of {view.questions.length} · {question.competency}
        </p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-green-lime" style={{ width: `${((index + 1) / view.questions.length) * 100}%` }} />
        </div>
      </div>
      <section aria-label={`Question ${index + 1}`} className="rounded-xl border border-border-slate p-5">
        <p className="text-base font-semibold text-navy">{question.text}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={repeats >= MAX_REPEATS}
          onClick={() => {
            if (run(() => repeatQuestion(token, question.id)) && speech.supported) speech.speak(question.text);
          }}
        >
          <RotateCcwIcon aria-hidden />
          Repeat question ({MAX_REPEATS - repeats} left)
        </Button>
        <label className="mt-3 block text-xs font-bold text-navy">
          Your answer
          <Textarea
            className="mt-1 font-normal"
            rows={7}
            maxLength={6000}
            value={text}
            onChange={(e) => {
              const value = e.target.value;
              setDrafts((d) => ({ ...d, [question.id]: value }));
              setSaved("Saving…");
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => save(question.id, value), 800);
            }}
            onBlur={() => save(question.id, text)}
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          {mic.supported ? (
            <Button type="button" variant="secondary" size="sm" aria-pressed={mic.listening} onClick={() => {
              speech.stop();
              if (mic.listening) mic.stop();
              else mic.start();
            }}>
              {mic.listening ? <MicOffIcon aria-hidden /> : <MicIcon aria-hidden />}
              {mic.listening ? "Stop speaking" : "Speak your answer"}
            </Button>
          ) : (
            <span>Type your answer.</span>
          )}
          <span aria-live="polite">{saved ?? "Answers save automatically."}</span>
        </div>
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={() => setProblem(true)}>
          <LifeBuoyIcon aria-hidden />
          Report a problem
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>
            Previous
          </Button>
          {index < view.questions.length - 1 ? (
            <Button type="button" onClick={() => go(index + 1)}>
              Next question
            </Button>
          ) : (
            <Button type="button" variant="accent" onClick={() => { save(question.id, text); setConfirming(true); }}>
              End Interview
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirming && !paused} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End the interview?</DialogTitle>
            <DialogDescription>
              {(() => {
                const blank = view.questions.filter((q) => !(drafts[q.id] ?? view.answers[q.id]?.text ?? "").trim()).length;
                return blank
                  ? `${blank} question${blank === 1 ? " has" : "s have"} no answer. You cannot change your answers after ending.`
                  : "You cannot change your answers after ending.";
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
              Keep going
            </Button>
            <Button type="button" variant="accent" onClick={() => {
              speech.stop();
              if (run(() => submitInterview(token))) setConfirming(false);
            }}>
              End Interview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProblemDialog
        open={problem}
        onClose={() => setProblem(false)}
        onSend={(message, reschedule) => run(() => reportTechnicalIssue(token, message, reschedule))}
      />
    </div>
  );
}

function ProblemDialog({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (message: string, reschedule: boolean) => boolean }) {
  const [message, setMessage] = useState("");
  const [reschedule, setReschedule] = useState(false);
  const [sent, setSent] = useState(false);
  const close = () => {
    setMessage("");
    setReschedule(false);
    setSent(false);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>Your answers are saved. Tell us what happened; you can also ask to do the interview another time.</DialogDescription>
        </DialogHeader>
        {sent ? (
          <p className="text-sm text-navy" role="status">
            Thank you. The recruitment team will contact you{reschedule ? " with a new link" : ""}.
          </p>
        ) : (
          <>
            <Textarea rows={3} aria-label="What happened?" value={message} onChange={(e) => setMessage(e.target.value)} />
            <label className="flex items-center gap-2 text-sm text-navy">
              <Checkbox checked={reschedule} onCheckedChange={(v) => setReschedule(v === true)} aria-label="I would like to reschedule" />
              I would like to reschedule
            </label>
          </>
        )}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close}>
            Close
          </Button>
          {!sent ? (
            <Button type="button" disabled={!message.trim()} onClick={() => onSend(message, reschedule) && setSent(true)}>
              Send
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Card({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <main className={cn("w-full rounded-2xl border border-border-slate bg-white p-6 shadow-sm sm:p-8", wide ? "max-w-3xl" : "max-w-xl")}>{children}</main>;
}

function ErrorText({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-4 rounded-lg bg-error-soft px-3 py-2 text-sm text-error-soft-foreground">
      {text}
    </p>
  );
}
