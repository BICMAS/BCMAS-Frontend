"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { allowWithoutCamera, cameraSummary, type CameraStage } from "../services/camera";
import { CAMERA_POLICY_LABEL, type CameraEvent, type CameraLog } from "../types";
import { formatDateTime, runAction } from "./recruitment-shared";

const EVENT_LABEL: Record<CameraEvent["type"], string> = {
  agreed: "Agreed to use the camera",
  on: "Camera on",
  off: "Camera off",
  alternative_requested: "Asked for another arrangement",
  waived: "Allowed without camera",
};

function duration(seconds: number) {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** HR's camera log for one session: on/off times only, read by people and never scored. */
export function CameraLogPanel({
  organisationId,
  applicationId,
  stage,
  actor,
  record,
}: {
  organisationId: string;
  applicationId: string;
  stage: CameraStage;
  actor: string;
  record: { camera: CameraLog; status: string; startedAt: string | null; submittedAt: string | null };
}) {
  const [reason, setReason] = useState("");
  const log = record.camera;
  if (log.policy === "off") return null;
  const summary = cameraSummary(log, record.startedAt, record.submittedAt);
  const requested = log.events.some((e) => e.type === "alternative_requested");
  const canAllow = log.policy === "required" && !log.waived && record.status !== "submitted";
  const text = log.waived
    ? `Allowed without camera by ${log.waived.by}.`
    : !summary
      ? "Not started yet."
      : !summary.everOn
        ? "The camera was not used."
        : summary.timesOff === 0 && summary.offSeconds < 1
          ? "On for the whole session."
          : `Went off ${summary.timesOff} time${summary.timesOff === 1 ? "" : "s"} after starting; off for ${duration(summary.offSeconds)} in total.`;

  return (
    <section className="space-y-3 rounded-2xl border border-border-slate bg-white p-5" aria-label="Camera log">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-navy">Camera log</h2>
        <Badge variant="secondary">{CAMERA_POLICY_LABEL[log.policy]}</Badge>
      </div>
      <p className="text-sm text-navy">{text}</p>
      {requested && canAllow ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          The candidate asked for another arrangement. Contact them, or allow them to continue without a camera.
        </p>
      ) : null}
      {canAllow ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            runAction(
              () => allowWithoutCamera(organisationId, stage, applicationId, reason, actor),
              "Candidate can continue without a camera.",
            );
          }}
        >
          <Input
            aria-label="Reason for allowing without camera"
            placeholder="Reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={!reason.trim()}>
            Allow without camera
          </Button>
        </form>
      ) : null}
      {log.events.length ? (
        <ul className="space-y-1 text-sm text-slate-600">
          {[...log.events].reverse().map((e, i) => (
            <li key={`${e.type}-${e.at}-${i}`}>
              <span className="font-semibold text-navy">{EVENT_LABEL[e.type]}</span> · {formatDateTime(e.at)}
              {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-500">
        No picture or video is kept. Going off can have an ordinary cause, such as a lost connection or a closed page. The log never
        changes a score or outcome.
      </p>
    </section>
  );
}
