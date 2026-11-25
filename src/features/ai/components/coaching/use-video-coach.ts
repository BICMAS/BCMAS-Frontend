"use client";

import type { SimliClient } from "simli-client";
import { useCallback, useEffect, useRef, useState } from "react";

export type VideoCoachStatus = "off" | "connecting" | "on";

/** Simli plays about 188 ms per chunk of this size. Always whole 16-bit samples. */
const CHUNK_BYTES = 6000;

const MESSAGE = {
  limit: "The video coach has reached its trial limit. Please try again later.",
  start: "The video coach could not start. Your coach is still here in text.",
  ended: "The video coach session ended. You can start it again.",
  voice: "The video coach could not speak that reply. You can read it below.",
} as const;

/**
 * The video coach (Simli trial). It only speaks replies the AI coach has already written.
 * Another avatar provider can replace this hook by keeping the same return shape.
 */
export function useVideoCoach() {
  const [available, setAvailable] = useState(false);
  /** Who makes the voice, named in the on-screen note. */
  const [voice, setVoice] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoCoachStatus>("off");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const client = useRef<SimliClient | null>(null);
  const attempt = useRef(0);
  const speech = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/avatar/session")
      .then((r) => (r.ok ? (r.json() as Promise<{ available?: boolean; voice?: string | null }>) : null))
      .then((body) => {
        if (cancelled) return;
        setAvailable(body?.available === true);
        setVoice(body?.voice ?? null);
      })
      .catch(() => {
        /* Not available: the coach portrait stays. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Ends the session without touching React state (safe in cleanup). */
  const release = useCallback(() => {
    attempt.current += 1;
    speech.current?.abort();
    speech.current = null;
    const live = client.current;
    client.current = null;
    void live?.stop().catch(() => {});
  }, []);

  useEffect(() => {
    // Leaving the page must end the session, so it stops using minutes.
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [release]);

  const stop = useCallback(() => {
    release();
    setStatus("off");
    setSpeaking(false);
  }, [release]);

  const start = useCallback(async () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;
    release();
    const id = attempt.current;
    const isCurrent = () => attempt.current === id;
    setError(null);
    setStatus("connecting");
    try {
      const response = await fetch("/api/avatar/session", { method: "POST" });
      if (!response.ok) throw new Error(response.status === 429 ? "limit" : "start");
      const { token } = (await response.json()) as { token: string };
      const { SimliClient: Client, LogLevel } = await import("simli-client");
      if (!isCurrent()) return;
      const next = new Client(token, video, audio, null, LogLevel.ERROR);
      client.current = next;
      next.on("speaking", () => isCurrent() && setSpeaking(true));
      next.on("silent", () => isCurrent() && setSpeaking(false));
      next.on("stop", () => {
        if (!isCurrent()) return;
        release();
        setStatus("off");
        setSpeaking(false);
        setError(MESSAGE.ended);
      });
      await next.start();
      if (isCurrent()) setStatus("on");
      else void next.stop().catch(() => {});
    } catch (e) {
      if (!isCurrent()) return;
      release();
      setStatus("off");
      setError(e instanceof Error && e.message === "limit" ? MESSAGE.limit : MESSAGE.start);
    }
  }, [release]);

  /** Stops the current sentence, keeping the session. */
  const interrupt = useCallback(() => {
    speech.current?.abort();
    speech.current = null;
    client.current?.ClearBuffer();
    setSpeaking(false);
  }, []);

  /** Speaks a reply. False when nothing could be spoken, so the caller can fall back. */
  const speak = useCallback(async (text: string): Promise<boolean> => {
    const live = client.current;
    if (!live || !text.trim()) return false;
    speech.current?.abort();
    live.ClearBuffer();
    const controller = new AbortController();
    speech.current = controller;
    let sent = false;
    const send = (bytes: Uint8Array) => {
      if (client.current !== live || controller.signal.aborted) return;
      live.sendAudioData(bytes);
      sent = true;
    };
    try {
      const response = await fetch("/api/avatar/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("voice");
      const reader = response.body.getReader();
      let pending = new Uint8Array(0);
      for (;;) {
        const { done, value } = await reader.read();
        if (value) {
          const joined = new Uint8Array(pending.length + value.length);
          joined.set(pending);
          joined.set(value, pending.length);
          let at = 0;
          for (; joined.length - at >= CHUNK_BYTES; at += CHUNK_BYTES) send(joined.slice(at, at + CHUNK_BYTES));
          pending = joined.slice(at);
        }
        if (done) break;
      }
      const whole = pending.length - (pending.length % 2);
      if (whole) send(pending.slice(0, whole));
      return sent;
    } catch {
      // Interrupted on purpose is not a failure.
      if (controller.signal.aborted) return true;
      setError(MESSAGE.voice);
      return sent;
    } finally {
      if (speech.current === controller) speech.current = null;
    }
  }, []);

  return { available, voice, status, speaking, error, videoRef, audioRef, start, stop, speak, interrupt };
}

export type VideoCoach = ReturnType<typeof useVideoCoach>;
