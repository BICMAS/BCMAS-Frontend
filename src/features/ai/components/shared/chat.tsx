"use client";

import type { CoachMessage } from "@ai/contracts";
import { SendIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function time(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Conversation history with an optional in-progress (streaming) reply. */
export function ChatThread({
  messages,
  streaming,
  assistantLabel,
  className,
}: {
  messages: CoachMessage[];
  streaming?: string | null;
  assistantLabel: string;
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
        <Bubble key={message.message_id} role={message.role} label={message.role === "user" ? "You" : assistantLabel}>
          {message.text}
          <span className="mt-1 block text-[10px] opacity-60">{time(message.created_at)}</span>
        </Bubble>
      ))}
      {streaming !== undefined && streaming !== null ? (
        <Bubble role="coach" label={assistantLabel}>
          <span data-testid="streaming-reply">{streaming || "…"}</span>
        </Bubble>
      ) : null}
      <div ref={end} />
    </div>
  );
}

function Bubble({ role, label, children }: { role: "coach" | "user"; label: string; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <span className="mb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">{label}</span>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
          mine ? "bg-navy text-white" : "border border-border-slate bg-white text-navy",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Message composer: Enter sends, Shift+Enter adds a line. */
export function ChatComposer({
  onSend,
  disabled,
  placeholder = "Type your reply…",
  maxLength = 4000,
}: {
  onSend: (text: string) => Promise<boolean | void> | void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const [text, setText] = useState("");

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
    <form onSubmit={submit} className="flex items-end gap-2">
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
      <Button type="submit" disabled={disabled || !text.trim()} aria-label="Send message">
        <SendIcon className="size-4" aria-hidden />
        Send
      </Button>
    </form>
  );
}
