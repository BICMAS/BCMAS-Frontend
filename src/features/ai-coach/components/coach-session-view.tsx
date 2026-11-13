"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BotIcon, Maximize2Icon, MicIcon, Minimize2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionStore } from "@/stores/session-store";
import {
  endSession,
  getSession,
  sendCoachMessage,
  startSession,
} from "@/features/ai-coach/services/mock-coach";
import { cn } from "@/lib/utils";

export function CoachSessionView({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState(() => getSession(sessionId) ?? startSession(sessionId));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const userAvatar = useSessionStore((state) => state.user.avatarUrl);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setPending(true);
    try {
      const next = await sendCoachMessage(session.id, text);
      if (next) setSession(next);
      setDraft("");
      setListening(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-4xl flex-col">
      <div
        className={cn(
          "absolute top-0 right-0 z-10 overflow-hidden rounded-2xl border border-border-slate bg-navy shadow-xl",
          expanded ? "size-96" : "size-36 sm:size-48",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            session.avatarUrl ??
            "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg"
          }
          alt=""
          className="size-full object-cover opacity-80 mix-blend-luminosity"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="size-2 rounded-full bg-green-lime" />
          <span className="text-[10px] font-bold tracking-widest text-white uppercase">
            AI Persona: {session.persona}
          </span>
        </div>
        <button
          type="button"
          className="absolute top-2 right-2 flex size-6 items-center justify-center rounded bg-white/20 text-white hover:bg-white/40"
          aria-label={expanded ? "Shrink persona" : "Expand persona"}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <Minimize2Icon className="size-3" />
          ) : (
            <Maximize2Icon className="size-3" />
          )}
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 pr-40 sm:pr-52">
        <div>
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            AI Persona: {session.persona}
          </p>
          <h1 className="text-xl font-bold text-navy">{session.title}</h1>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try {
              await endSession(session.id);
              toast.success("Session complete");
              router.push(`/ai-coach/sessions/${session.id}`);
            } finally {
              setPending(false);
            }
          }}
        >
          End Session
        </Button>
      </div>

      <div className="flex-1 space-y-6 rounded-2xl border border-border-slate bg-white p-6 pr-40 shadow-sm sm:pr-52">
        {session.messages.map((message) => {
          const coach = message.role === "coach";
          return (
            <div
              key={message.id}
              className={cn("flex items-start gap-3", !coach && "flex-row-reverse")}
            >
              {coach ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-navy shadow-sm">
                  <BotIcon className="size-3.5 text-green-lime" aria-hidden />
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatar}
                  alt=""
                  className="size-8 shrink-0 rounded-full border-2 border-border-slate object-cover shadow-sm"
                />
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  coach ? "bg-slate-50 text-navy" : "bg-navy text-white",
                )}
              >
                <p>{message.text}</p>
                <p
                  className={cn(
                    "mt-2 text-[10px] font-bold uppercase",
                    coach ? "text-slate-400" : "text-white/60",
                  )}
                >
                  {coach ? `Persona: ${session.persona}` : "You"} · {message.time}
                </p>
              </div>
            </div>
          );
        })}
        {pending ? (
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-navy">
              <BotIcon className="size-3.5 text-green-lime" aria-hidden />
            </span>
            <span className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold tracking-widest text-slate-400 uppercase">
              Thinking…
            </span>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase">
        {listening ? "Listening… speak, then send" : "Press send to reply. Microphone is a practice cue."}
      </p>
      <form
        className="mt-3 flex items-center gap-2 rounded-2xl border border-border-slate bg-white p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={listening ? "Stop microphone" : "Start microphone"}
          onClick={() => {
            setListening((value) => !value);
            toast.message(listening ? "Microphone off" : "Microphone on (mock)");
          }}
        >
          <MicIcon className="size-4" />
        </Button>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type your response or click the microphone to speak..."
          className="border-0 shadow-none focus-visible:ring-0"
          aria-label="Your response"
        />
        <Button type="submit" size="icon" variant="accent" disabled={pending} aria-label="Send response">
          <SendIcon className="size-4" />
        </Button>
      </form>
    </div>
  );
}
