"use client";

import { Volume2Icon, VolumeXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CoachAvatar } from "./coach-avatar";
import type { Viseme } from "./coach-voice";

export type CoachPresence = "ready" | "thinking" | "speaking" | "listening";

const PRESENCE_LABEL: Record<CoachPresence, string> = {
  ready: "Ready when you are",
  thinking: "Thinking…",
  speaking: "Speaking",
  listening: "Listening to you…",
};

/** The coach's "face to face" panel: portrait, name, live presence and the voice switch. */
export function CoachStage({
  name,
  role,
  imageUrl,
  presence,
  voice,
}: {
  name: string;
  role: string;
  imageUrl?: string | null;
  presence: CoachPresence;
  voice?: {
    supported: boolean;
    enabled: boolean;
    setEnabled: (on: boolean) => void;
    /** Lip-sync mouth shape while the voice is speaking. */
    mouth?: Viseme | null;
  };
}) {
  const speaking = presence === "speaking";
  return (
    <section
      aria-label={`${name}, ${role}`}
      className="flex flex-col items-center gap-4 rounded-2xl bg-linear-to-br from-navy to-[#16365f] p-6 text-white shadow-sm sm:flex-row"
    >
      <CoachAvatar name={name} imageUrl={imageUrl} speaking={speaking} mouth={voice?.mouth ?? null} size={96} />
      <div className="flex-1 text-center sm:text-left">
        <p className="text-xl font-bold">{name}</p>
        <p className="text-sm text-white/70">{role}</p>
        <p className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-white/90" aria-live="polite">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              presence === "ready" ? "bg-white/50" : "bg-green-lime motion-safe:animate-pulse",
            )}
          />
          {PRESENCE_LABEL[presence]}
        </p>
      </div>
      {voice?.supported ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-pressed={voice.enabled}
          onClick={() => voice.setEnabled(!voice.enabled)}
        >
          {voice.enabled ? <Volume2Icon className="size-4" aria-hidden /> : <VolumeXIcon className="size-4" aria-hidden />}
          {voice.enabled ? "Voice on" : "Voice off"}
        </Button>
      ) : null}
    </section>
  );
}
