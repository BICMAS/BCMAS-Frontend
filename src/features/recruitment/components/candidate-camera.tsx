"use client";

import { CameraIcon, CameraOffIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { agreeToCamera, cameraMustBeOn, recordCamera, requestCameraAlternative, type CameraStage } from "../services/camera";
import { RecruitmentError } from "../services/vacancies";
import type { CameraPolicy } from "../types";
import { CAMERA_HELP, useCamera, type Camera } from "../use-camera";

/** What the candidate's page needs to know about their own camera. */
export type CandidateCamera = { policy: CameraPolicy; waived: boolean; agreed: boolean };

/** The camera for one candidate session; released when the session ends or HR waives it. */
export function useSessionCamera(stage: CameraStage, token: string, view: { status: string; camera: CandidateCamera } | null) {
  const camera = useCamera((on, note) => recordCamera(stage, token, on, note));
  const { release } = camera;
  const ended = view?.status === "submitted" || view?.status === "expired" || view?.camera.waived === true;
  useEffect(() => {
    if (ended) release("Session ended");
  }, [ended, release]);
  return { camera, blocked: !!view && cameraMustBeOn(view.camera) && !camera.on };
}

function Preview({ camera, className }: { camera: Camera; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = camera.stream;
  }, [camera.stream]);
  return <video ref={ref} autoPlay muted playsInline aria-label="Your camera" className={cn("-scale-x-100 bg-slate-900 object-cover", className)} />;
}

/** Explains the camera, gets agreement, turns it on, and offers another arrangement. */
export function CameraSetup({
  stage,
  token,
  value,
  camera,
  supportEmail,
  paused = false,
}: {
  stage: CameraStage;
  token: string;
  value: CandidateCamera;
  camera: Camera;
  supportEmail: string;
  /** Shown in place of the questions because a required camera is off. */
  paused?: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (value.policy === "off") return null;
  if (value.waived) {
    return (
      <p className="mt-4 rounded-lg bg-info-soft p-3 text-sm text-info-soft-foreground" role="status">
        The recruitment team has confirmed you can continue without a camera.
      </p>
    );
  }
  const required = value.policy === "required";
  const help = CAMERA_HELP[camera.status];
  const run = (fn: () => void) => {
    try {
      fn();
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof RecruitmentError ? e.message : "Something went wrong. Please try again.");
      return false;
    }
  };

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-border-slate p-5 text-sm text-navy" aria-label="Camera">
      <h2 className="flex items-center gap-2 font-bold">
        <CameraIcon className="size-4" aria-hidden />
        {paused ? "Turn your camera back on to continue" : required ? "Camera required" : "Camera (optional)"}
      </h2>
      {paused ? (
        <p className="text-slate-600">
          Your questions are hidden until your camera is on. Your answers are safe.
          {stage === "assessment" ? " The timer keeps running." : ""}
        </p>
      ) : null}
      <ul className="list-disc space-y-1 pl-5 text-slate-600">
        <li>
          {required
            ? "Your camera must stay on until you finish, to support a fair process."
            : "You can keep your camera on until you finish, to support a fair process. You can also continue without it, and turn it off at any time."}
        </li>
        <li>You are the only one who sees the picture. Nothing from the camera is recorded, sent or analysed.</li>
        <li>We note when the camera turns on and off, and the recruitment team can read this. It never changes your score.</li>
      </ul>

      {!value.agreed ? (
        <label className="flex items-start gap-2">
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} aria-label="I agree to use my camera" />
          I agree to use my camera as described above.
        </label>
      ) : null}

      {camera.stream ? <Preview camera={camera} className="aspect-video w-full max-w-60 rounded-lg" /> : null}
      <p aria-live="polite" className={help ? "font-semibold text-warning-soft-foreground" : "text-slate-600"}>
        {camera.status === "on"
          ? "Your camera is on."
          : camera.status === "starting"
            ? "Waiting for your browser. Choose Allow."
            : (help ?? "Your camera is off.")}
      </p>
      {error ? (
        <p role="alert" className="rounded-lg bg-error-soft px-3 py-2 text-error-soft-foreground">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!camera.on ? (
          <Button
            type="button"
            disabled={camera.status === "starting" || (!value.agreed && !agreed)}
            onClick={() => {
              if (run(() => agreeToCamera(stage, token))) void camera.start();
            }}
          >
            <CameraIcon aria-hidden />
            {help ? "Try again" : "Turn on camera"}
          </Button>
        ) : required ? null : (
          <Button type="button" variant="secondary" onClick={camera.stop}>
            <CameraOffIcon aria-hidden />
            Turn off camera
          </Button>
        )}
        {required && !sent ? (
          <Button type="button" variant="ghost" aria-expanded={asking} onClick={() => setAsking((v) => !v)}>
            I can&apos;t use a camera
          </Button>
        ) : null}
      </div>
      {sent ? (
        <p className="rounded-lg bg-info-soft p-3 text-info-soft-foreground" role="status">
          Thank you. The recruitment team will contact you. You can also email {supportEmail}. Asking does not affect your score.
        </p>
      ) : asking ? (
        <div className="space-y-2">
          <label className="block text-xs font-bold">
            Tell us what would work for you (for example no camera, a disability, or privacy at home)
            <Textarea className="mt-1 font-normal" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!message.trim()}
            onClick={() => {
              if (run(() => requestCameraAlternative(stage, token, message))) setSent(true);
            }}
          >
            Ask for another arrangement
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Small self-view while the candidate works. */
export function CameraStrip({ value, camera }: { value: CandidateCamera; camera: Camera }) {
  if (value.policy === "off" || value.waived) return null;
  const help = CAMERA_HELP[camera.status];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600" aria-label="Camera status" role="group">
      {camera.stream ? <Preview camera={camera} className="h-14 w-24 rounded-lg" /> : null}
      <span aria-live="polite">{camera.on ? "Camera on. Only you can see this picture." : (help ?? "Camera off (optional).")}</span>
      {value.policy === "optional" && value.agreed ? (
        camera.on ? (
          <Button type="button" variant="ghost" size="sm" onClick={camera.stop}>
            Turn off
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" disabled={camera.status === "starting"} onClick={() => void camera.start()}>
            Turn on
          </Button>
        )
      ) : null}
    </div>
  );
}
