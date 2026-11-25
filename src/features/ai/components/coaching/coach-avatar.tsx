"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

import type { Viseme } from "./coach-voice";

/** The AI development coach used for coaching conversations. */
export const AI_COACH = {
  name: "Amara",
  role: "Your AI development coach",
  /** A still of the video coach's face. Replace it when SIMLI_FACE_ID changes. */
  imageUrl: "/coach/amara.jpg",
} as const;

const SKIN = ["#8d5524", "#c68642", "#e0ac69", "#f1c27d", "#a0662f", "#6b4423"];
const HAIR = ["#1f1a17", "#3b2a20", "#5a3825", "#2c2c2c", "#7a4b2a"];
const SHIRT = ["#0b2545", "#1d4e89", "#2f6f4f", "#6b3f87", "#8a3b3b", "#35506b"];
const BACKDROP = ["#e8f5d6", "#dbeafe", "#fef3c7", "#ede9fe", "#fce7f3", "#e0f2fe"];

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function pick<T>(list: readonly T[], seed: number, salt: number): T {
  return list[(seed >>> salt) % list.length]!;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener?.("change", listener);
  return () => query.removeEventListener?.("change", listener);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REDUCED_MOTION).matches;
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

/** Mouth opening (rx, ry) per viseme; `teeth` shows the upper teeth. */
const MOUTH: Record<Viseme, { rx: number; ry: number; teeth: boolean }> = {
  rest: { rx: 5.5, ry: 0.6, teeth: false },
  closed: { rx: 5, ry: 0.4, teeth: false },
  open: { rx: 5, ry: 4.2, teeth: true },
  wide: { rx: 6.8, ry: 2.2, teeth: true },
  round: { rx: 3, ry: 3.2, teeth: false },
  teeth: { rx: 5.5, ry: 1.8, teeth: true },
  mid: { rx: 4.6, ry: 2.4, teeth: false },
};

function SyncedMouth({ viseme }: { viseme: Viseme }) {
  const shape = MOUTH[viseme];
  return (
    <g data-viseme={viseme}>
      <ellipse
        cx="50"
        cy="59"
        rx={shape.rx}
        ry={shape.ry}
        fill="#7f1d1d"
        className="transition-[rx,ry] duration-75 ease-out"
      />
      {shape.teeth ? (
        <rect x={50 - shape.rx * 0.7} y={59 - shape.ry} width={shape.rx * 1.4} height={Math.min(1.6, shape.ry)} rx="0.6" fill="#ffffff" />
      ) : null}
    </g>
  );
}

/**
 * Illustrated portrait for the coach or a role-play character. The look is derived from the
 * name, so the same person always looks the same. When `speaking`, a ring pulses and the mouth
 * moves: lip-synced to `mouth` when word timings are available, otherwise a generic talking loop.
 * A photo (`imageUrl`) replaces the illustration when the scenario provides one.
 */
export function CoachAvatar({
  name,
  imageUrl,
  speaking = false,
  mouth = null,
  size = 40,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  speaking?: boolean;
  /** Current lip-sync shape; null when the voice gives no word timings. */
  mouth?: Viseme | null;
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const animate = speaking && !reduced;
  const lipSync = animate && mouth !== null;
  const seed = hash(name);
  const skin = pick(SKIN, seed, 0);
  const hair = pick(HAIR, seed, 3);
  const shirt = pick(SHIRT, seed, 6);
  const backdrop = pick(BACKDROP, seed, 9);
  const longHair = (seed >>> 12) % 2 === 0;

  return (
    <span
      className={cn("relative inline-flex shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {speaking ? (
        <span
          aria-hidden
          className="absolute -inset-1 rounded-full border-2 border-green-lime motion-safe:animate-pulse"
        />
      ) : null}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={`${name}'s portrait`}
          width={size}
          height={size}
          className="size-full rounded-full object-cover"
        />
      ) : (
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          role="img"
          aria-label={`${name}'s portrait`}
          className="rounded-full"
        >
          <circle cx="50" cy="50" r="50" fill={backdrop} />
          {longHair ? <path d="M24 52 Q22 18 50 16 Q78 18 76 52 L76 74 L24 74 Z" fill={hair} /> : null}
          <path d="M14 100 Q18 74 50 72 Q82 74 86 100 Z" fill={shirt} />
          <rect x="43" y="60" width="14" height="14" rx="5" fill={skin} />
          <ellipse cx="50" cy="45" rx="20" ry="23" fill={skin} />
          <path
            d={longHair ? "M30 40 Q32 20 50 20 Q68 20 70 40 Q60 30 50 31 Q40 30 30 40 Z" : "M29 42 Q28 20 50 19 Q72 20 71 42 Q66 28 50 28 Q34 28 29 42 Z"}
            fill={hair}
          />
          <path d="M37 38 Q41 35.5 45 38" stroke={hair} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M55 38 Q59 35.5 63 38" stroke={hair} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <g fill="#1f2937">
            <ellipse cx="41" cy="44" rx="2.4" ry="2.6">
              {!reduced ? (
                <animate attributeName="ry" values="2.6;2.6;0.3;2.6" keyTimes="0;0.92;0.96;1" dur="4.5s" repeatCount="indefinite" />
              ) : null}
            </ellipse>
            <ellipse cx="59" cy="44" rx="2.4" ry="2.6">
              {!reduced ? (
                <animate attributeName="ry" values="2.6;2.6;0.3;2.6" keyTimes="0;0.92;0.96;1" dur="4.5s" repeatCount="indefinite" />
              ) : null}
            </ellipse>
          </g>
          <path d="M50 46 Q48 52 50 53" stroke="#00000033" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {lipSync ? (
            <SyncedMouth viseme={mouth!} />
          ) : animate ? (
            <ellipse cx="50" cy="59" rx="5" ry="2" fill="#7f1d1d">
              <animate attributeName="ry" values="1;3.6;1.6;3;1" dur="0.5s" repeatCount="indefinite" />
            </ellipse>
          ) : (
            <path d="M44 58 Q50 62.5 56 58" stroke="#7f1d1d" strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
        </svg>
      )}
    </span>
  );
}
