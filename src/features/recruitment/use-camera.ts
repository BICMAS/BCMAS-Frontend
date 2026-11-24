"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "starting" | "on" | "lost" | "denied" | "missing" | "busy" | "unsupported";

export const CAMERA_HELP: Partial<Record<CameraStatus, string>> = {
  denied: "Your browser is blocking the camera. Choose Allow in the camera icon by the address bar, then try again.",
  missing: "No camera was found. Connect one, then try again.",
  busy: "The camera could not start. Close other apps that use it, then try again.",
  unsupported: "The camera is not available in this browser. Open this link over a secure (https) connection in a current browser.",
  lost: "Your camera has turned off.",
};

function failure(error: unknown): CameraStatus {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  return "busy";
}

/**
 * The candidate's camera, shown only on their own screen: the stream is never recorded, sent or
 * analysed. `onChange` hears when the picture starts and stops.
 */
export function useCamera(onChange: (on: boolean, note?: string) => void) {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const current = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const notify = useRef(onChange);
  useEffect(() => {
    notify.current = onChange;
  });

  /** Turns the camera off without touching React state (safe in cleanup). */
  const release = useCallback((note: string) => {
    request.current += 1;
    const live = current.current;
    current.current = null;
    if (!live) return;
    live.getTracks().forEach((t) => t.stop());
    notify.current(false, note);
  }, []);

  useEffect(() => {
    const leaving = () => {
      const wasLive = current.current !== null;
      release("Page closed or reloaded");
      if (wasLive) {
        setStream(null);
        setStatus("lost");
      }
    };
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("pagehide", leaving);
      release("Page closed or reloaded");
    };
  }, [release]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }
    // A muted stream may still be open: replace it.
    release("Camera restarted");
    const id = (request.current += 1);
    setStatus("starting");
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const track = next.getVideoTracks()[0];
      if (id !== request.current || !track) {
        next.getTracks().forEach((t) => t.stop());
        if (id === request.current) setStatus("missing");
        return;
      }
      current.current = next;
      const isCurrent = () => current.current === next;
      const goOn = () => {
        setStatus("on");
        notify.current(true);
      };
      track.addEventListener("ended", () => {
        if (!isCurrent()) return;
        current.current = null;
        setStream(null);
        setStatus("lost");
        notify.current(false, "Camera disconnected or permission removed");
      });
      // A muted track sends no picture (e.g. a privacy switch, or another app took the camera).
      track.addEventListener("mute", () => {
        if (!isCurrent()) return;
        setStatus("lost");
        notify.current(false, "Camera stopped sending a picture");
      });
      track.addEventListener("unmute", () => {
        if (isCurrent()) goOn();
      });
      setStream(next);
      if (track.muted) setStatus("lost");
      else goOn();
    } catch (error) {
      if (id === request.current) {
        setStream(null);
        setStatus(failure(error));
      }
    }
  }, [release]);

  const stop = useCallback(() => {
    release("Turned off by the candidate");
    setStream(null);
    setStatus("idle");
  }, [release]);

  return { status, stream, on: status === "on", start, stop, release };
}

export type Camera = ReturnType<typeof useCamera>;
