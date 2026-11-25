"use client";

import { VideoIcon, VideoOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { VideoCoach } from "./use-video-coach";

/** Offers the video coach, explains it, and shows the video while it runs. */
export function VideoCoachPanel({
  name,
  voice,
  status,
  error,
  videoRef,
  audioRef,
  start,
  stop,
}: Pick<VideoCoach, "voice" | "status" | "error" | "videoRef" | "audioRef" | "start" | "stop"> & { name: string }) {
  const on = status === "on";
  return (
    <section aria-label="Video coach" className="space-y-3 rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
      {/* Always in the page: the connection needs the elements before the first picture. */}
      <div className={cn("overflow-hidden rounded-xl bg-navy", status === "off" && "hidden")}>
        <video ref={videoRef} autoPlay playsInline aria-label={`${name}, video coach`} className="mx-auto aspect-square w-full max-w-sm object-cover" />
      </div>
      <audio ref={audioRef} autoPlay className="hidden" />
      {status === "off" ? (
        <p className="text-xs leading-relaxed text-slate-500">
          See and hear {name} on video (trial). The AI coach&apos;s replies are sent to {voice ?? "a voice service"} to make the voice, and that audio to
          Simli to make the video. A reply can repeat things you said. Your own messages and camera are not sent to them.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={on ? "secondary" : "default"} size="sm" onClick={() => (status === "off" ? void start() : stop())}>
          {status === "off" ? <VideoIcon aria-hidden /> : <VideoOffIcon aria-hidden />}
          {status === "off" ? "Start video coach" : status === "connecting" ? "Cancel" : "Stop video coach"}
        </Button>
        <span aria-live="polite" className="text-xs text-slate-500">
          {status === "connecting" ? "Connecting…" : (error ?? "")}
        </span>
      </div>
    </section>
  );
}
