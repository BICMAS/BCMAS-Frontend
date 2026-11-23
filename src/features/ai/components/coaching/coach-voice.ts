"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Browser-only voice for the AI coach avatar.
 *
 * - Speech output uses the Web Speech API's speechSynthesis (on-device voices in most browsers).
 * - Speech input uses SpeechRecognition where available (Chrome / Edge). Chrome sends the audio
 *   to Google's speech service to transcribe it, so the UI says so next to the microphone.
 *
 * Both are optional: when a browser lacks support the controls are simply not shown.
 */

const VOICE_PREF_KEY = "bcms-coach-voice";

/** Fallback when storage is unavailable (private mode, blocked): the toggle still works for this page. */
let memoryPref = false;
const prefListeners = new Set<() => void>();

function subscribePref(listener: () => void) {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
}

function readVoicePref(): boolean {
  try {
    const stored = window.localStorage.getItem(VOICE_PREF_KEY);
    return stored === null ? memoryPref : stored === "on";
  } catch {
    return memoryPref;
  }
}

function writeVoicePref(on: boolean) {
  memoryPref = on;
  try {
    window.localStorage.setItem(VOICE_PREF_KEY, on ? "on" : "off");
  } catch {
    /* Storage unavailable: memoryPref keeps the choice for this page. */
  }
  prefListeners.forEach((listener) => listener());
}

const noSubscribe = () => () => {};

/** True only in a browser that has the given capability; false during server rendering. */
function useBrowserSupport(check: () => boolean) {
  return useSyncExternalStore(noSubscribe, check, () => false);
}

const hasSynthesis = () => typeof window !== "undefined" && "speechSynthesis" in window;

function pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  return (
    voices.find((v) => v.lang === "en-GB" && v.localService) ??
    voices.find((v) => v.lang.startsWith("en") && v.localService) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0] ??
    null
  );
}

/* ── Lip sync ─────────────────────────────────────────────────────────────────
 * Browser voices don't expose phonemes or audio, but Chrome / Edge fire a "word" boundary event
 * as each word starts. On each one we play mouth shapes (visemes) derived from that word's
 * spelling, spread over the word's estimated length. Voices that never fire boundaries leave
 * `mouth` null, and the avatar falls back to its generic talking animation.
 * A cloud voice with real viseme timings can later drive the same `mouth` value.
 */

export type Viseme = "rest" | "closed" | "open" | "wide" | "round" | "teeth" | "mid";

const DIGRAPHS: Array<[string, Viseme]> = [
  ["oo", "round"],
  ["ou", "round"],
  ["ow", "round"],
  ["ee", "wide"],
  ["ea", "wide"],
  ["sh", "round"],
  ["ch", "round"],
  ["th", "teeth"],
  ["ph", "teeth"],
];

const LETTER_VISEME: Record<string, Viseme> = {
  a: "open",
  e: "wide",
  i: "wide",
  y: "wide",
  o: "round",
  u: "round",
  w: "round",
  q: "round",
  m: "closed",
  b: "closed",
  p: "closed",
  f: "teeth",
  v: "teeth",
};

/** Mouth shapes for one spoken word, in order, with repeats merged. */
export function visemesForWord(word: string): Viseme[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, "");
  const shapes: Viseme[] = [];
  let i = 0;
  while (i < letters.length) {
    const pair = letters.slice(i, i + 2);
    const digraph = DIGRAPHS.find(([d]) => d === pair);
    const shape = digraph ? digraph[1] : (LETTER_VISEME[letters[i]!] ?? "mid");
    i += digraph ? 2 : 1;
    if (shapes[shapes.length - 1] !== shape) shapes.push(shape);
  }
  if (shapes.length === 0 && /\d/.test(word)) shapes.push("mid", "open"); // numbers are spoken too
  return shapes;
}

/** The word that starts at `charIndex` (charLength is missing in some browsers). */
export function wordAt(text: string, charIndex: number, charLength?: number) {
  if (charLength && charLength > 0) return text.slice(charIndex, charIndex + charLength);
  const match = /^[^\s]+/.exec(text.slice(charIndex));
  return match ? match[0] : "";
}

const MS_PER_LETTER = 65;
const MIN_WORD_MS = 160;

/** Reads coach replies aloud, reports when the coach is speaking, and drives the lip sync. */
export function useCoachSpeech({ pitch = 1, rate = 1 }: { pitch?: number; rate?: number } = {}) {
  const supported = useBrowserSupport(hasSynthesis);
  const storedPref = useSyncExternalStore(subscribePref, readVoicePref, () => false);
  const enabled = supported && storedPref;
  const [speaking, setSpeaking] = useState(false);
  /** Current mouth shape while speaking with word timings; null = no timing data. */
  const [mouth, setMouth] = useState<Viseme | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    if (!supported) return;
    // Never keep talking after leaving the page.
    return () => {
      timers.current.forEach(clearTimeout);
      if (hasSynthesis()) window.speechSynthesis.cancel();
    };
  }, [supported]);

  const playWord = useCallback(
    (word: string) => {
      clearTimers();
      const shapes = visemesForWord(word);
      if (shapes.length === 0) return;
      const duration = Math.max(MIN_WORD_MS, word.length * MS_PER_LETTER) / rate;
      const step = duration / shapes.length;
      setMouth(shapes[0]!);
      shapes.slice(1).forEach((shape, index) => {
        timers.current.push(setTimeout(() => setMouth(shape), step * (index + 1)));
      });
      // Relax the lips between words; the next boundary cancels this if it comes sooner.
      timers.current.push(setTimeout(() => setMouth("rest"), duration));
    },
    [clearTimers, rate],
  );

  const stop = useCallback(() => {
    clearTimers();
    setMouth(null);
    if (!hasSynthesis()) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [clearTimers]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      clearTimers();
      setMouth(null);
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(synth);
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      const finish = () => {
        clearTimers();
        setMouth(null);
        setSpeaking(false);
      };
      utterance.onstart = () => setSpeaking(true);
      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name && event.name !== "word") return;
        playWord(wordAt(text, event.charIndex, event.charLength));
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    },
    [supported, pitch, rate, clearTimers, playWord],
  );

  const setEnabled = useCallback(
    (on: boolean) => {
      writeVoicePref(on);
      if (!on) stop();
    },
    [stop],
  );

  return { supported, enabled, setEnabled, speaking, mouth, speak, stop };
}

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Lets the employee speak a reply; final transcripts are passed to `onText`. */
export function useSpeechInput(onText: (text: string) => void) {
  const supported = useBrowserSupport(() => recognitionConstructor() !== null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(() => () => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = recognitionConstructor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-GB";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) onTextRef.current(result[0].transcript.trim());
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  return { supported, listening, start, stop };
}
