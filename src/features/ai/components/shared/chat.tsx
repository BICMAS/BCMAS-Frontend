"use client";

import type { CoachMessage } from "@ai/contracts";
import { MicIcon, MicOffIcon, SendIcon, Volume2Icon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useSpeechInput } from "../coaching/coach-voice";

function time(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Conversation history with an optional in-progress (streaming) reply. */
export function ChatThread({
  messages,
  streaming,
  assistantLabel,
  assistantAvatar,
  onListen,
  className,
}: {
  messages: CoachMessage[];
  streaming?: string | null;
  assistantLabel: string;
  /** Portrait shown beside the assistant's messages. */
  assistantAvatar?: ReactNode;
  /** When set, assistant messages get a "Listen" button that reads them aloud. */
  onListen?: (text: string) => void;
  className?: string;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation"
      className={cn("flex max-h-[60vh] min-h-64 flex-col gap-3 overflow-y-auto rounded-xl bg-slate-50 p-4", className)}
    >
      {messages.map((message) => (
        <Bubble
          key={message.message_id}
          role={message.role}
          label={message.role === "user" ? "You" : assistantLabel}
          avatar={message.role === "coach" ? assistantAvatar : undefined}
        >
          {message.text}
          <span className="mt-1 flex items-center gap-2 text-[10px] opacity-60">
            {time(message.created_at)}
            {onListen && message.role === "coach" ? (
              <button
                type="button"
                onClick={() => onListen(message.text)}
                className="inline-flex items-center gap-1 font-bold hover:underline"
                aria-label={`Listen to ${assistantLabel}'s message`}
              >
                <Volume2Icon className="size-3" aria-hidden />
                Listen
              </button>
            ) : null}
          </span>
        </Bubble>
      ))}
      {streaming !== undefined && streaming !== null ? (
        <Bubble role="coach" label={assistantLabel} avatar={assistantAvatar}>
          <span data-testid="streaming-reply">{streaming || "…"}</span>
        </Bubble>
      ) : null}
      <div ref={end} />
    </div>
  );
}

function Bubble({
  role,
  label,
  avatar,
  children,
}: {
  role: "coach" | "user";
  label: string;
  avatar?: ReactNode;
  children: ReactNode;
}) {
  const mine = role === "user";
  const bubble = (
    <div className={cn("flex min-w-0 flex-col", mine ? "items-end" : "items-start")}>
      <span className="mb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</span>
      <div
        className={cn(
          "max-w-full rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
          mine ? "bg-navy text-white" : "border border-border-slate bg-white text-navy",
        )}
      >
        {children}
      </div>
    </div>
  );
  if (!avatar) {
    return <div className={cn("flex max-w-[85%] flex-col", mine ? "self-end" : "self-start")}>{bubble}</div>;
  }
  return (
    <div className="flex max-w-[85%] items-end gap-2 self-start">
      <span className="mb-1 shrink-0">{avatar}</span>
      {bubble}
    </div>
  );
}

/** Message composer: Enter sends, Shift+Enter adds a line. */
export function ChatComposer({
  onSend,
  disabled,
  placeholder = "Type your reply…",
  maxLength = 4000,
  voiceInput = false,
  onListeningChange,
}: {
  onSend: (text: string) => Promise<boolean | void> | void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Show a microphone button (where the browser supports speech recognition). */
  voiceInput?: boolean;
  onListeningChange?: (listening: boolean) => void;
}) {
  const [text, setText] = useState("");
  const mic = useSpeechInput((spoken) =>
    setText((current) => (current ? `${current} ${spoken}` : spoken).slice(0, maxLength)),
  );
  const showMic = voiceInput && mic.supported;

  useEffect(() => {
    onListeningChange?.(mic.listening);
  }, [mic.listening, onListeningChange]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const value = text.trim();
    if (!value || disabled) return;
    setText("");
    const ok = await onSend(value);
    if (ok === false) setText(value); // keep the draft when sending failed
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex items-end gap-2">
      <Textarea
        aria-label="Message"
        value={text}
        maxLength={maxLength}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        className="min-h-12 flex-1 resize-none"
      />
      {showMic ? (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-pressed={mic.listening}
          aria-label={mic.listening ? "Stop speaking" : "Speak your reply"}
          onClick={() => (mic.listening ? mic.stop() : mic.start())}
        >
          {mic.listening ? <MicOffIcon className="size-4" aria-hidden /> : <MicIcon className="size-4" aria-hidden />}
        </Button>
      ) : null}
      <Button type="submit" disabled={disabled || !text.trim()} aria-label="Send message">
        <SendIcon className="size-4" aria-hidden />
        Send
      </Button>
      </div>
      {showMic ? (
        <p className="text-[10px] text-slate-400">
          {mic.listening
            ? "Listening… your words appear in the box so you can check them before sending."
            : "Tip: use the microphone to speak your reply. Your browser's speech service turns it into text."}
        </p>
      ) : null}
    </form>
  );
}
