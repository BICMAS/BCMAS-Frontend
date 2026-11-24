/**
 * Camera presence during the role-based assessment and the AI-avatar interview.
 *
 * Rules the backend must keep:
 *  - The vacancy's camera policy (Off, Optional, Required) is fixed on each invitation.
 *  - Only on/off events are kept. No picture, video or audio from the camera leaves the candidate's
 *    device, and nothing is analysed (no face, identity, emotion or attention detection).
 *  - The camera is used only after the candidate agrees; agreement is recorded.
 *  - Required: the candidate cannot start without the camera, unless HR allows it for them. Anyone
 *    can ask for another arrangement.
 *  - The log is for people to read in context. It never changes a score, threshold result or stage.
 *  - On/off is reported by the candidate's browser, so it is a signal and not proof.
 */
import { recruitmentStore, RecruitmentError } from "./vacancies";
import type { CameraEvent, CameraLog, CameraPolicy } from "../types";

export type CameraStage = "assessment" | "interview";

export function newCameraLog(policy: CameraPolicy): CameraLog {
  return { policy, agreedAt: null, waived: null, on: false, events: [] };
}

/** True when the candidate may not start or see questions until the camera is on. */
export function cameraMustBeOn(camera: { policy: CameraPolicy; waived: unknown }) {
  return camera.policy === "required" && !camera.waived;
}

export function requireCameraToStart(log: CameraLog) {
  if (cameraMustBeOn(log) && !log.on) throw new RecruitmentError("Turn on your camera before you start.");
}

function records(stage: CameraStage) {
  const data = recruitmentStore.data();
  return stage === "assessment" ? data.attempts : data.interviews;
}

function byToken(stage: CameraStage, token: string) {
  const found = records(stage).find((r) => r.token === token);
  if (!found) throw new RecruitmentError("This link is not valid. Please use the latest link we emailed you.");
  return found;
}

const isOpen = (status: string) => status === "invited" || status === "in_progress";

function add(log: CameraLog, type: CameraEvent["type"], note?: string) {
  log.events.push({ type, at: new Date().toISOString(), note });
}

export function agreeToCamera(stage: CameraStage, token: string) {
  const record = byToken(stage, token);
  if (!isOpen(record.status) || record.camera.policy === "off") throw new RecruitmentError("The camera is not used here.");
  if (record.camera.agreedAt) return;
  record.camera.agreedAt = new Date().toISOString();
  add(record.camera, "agreed");
  recruitmentStore.save();
}

/** Reported by the candidate's browser. Ignored when nothing changed or the session has ended. */
export function recordCamera(stage: CameraStage, token: string, on: boolean, note?: string) {
  const record = records(stage).find((r) => r.token === token);
  if (!record || !isOpen(record.status) || record.camera.on === on) return;
  if (on && !record.camera.agreedAt) throw new RecruitmentError("Agree to use the camera first.");
  record.camera.on = on;
  add(record.camera, on ? "on" : "off", note);
  recruitmentStore.save();
}

export function requestCameraAlternative(stage: CameraStage, token: string, message: string) {
  const record = byToken(stage, token);
  if (!message.trim()) throw new RecruitmentError("Tell us what you need so we can help.");
  add(record.camera, "alternative_requested", message.trim().slice(0, 500));
  recruitmentStore.save();
}

/** HR lets one candidate continue without the camera. The reason is recorded. */
export function allowWithoutCamera(
  organisationId: string,
  stage: CameraStage,
  applicationId: string,
  reason: string,
  actor: string,
) {
  const record = records(stage).find((r) => r.applicationId === applicationId && r.organisationId === organisationId);
  if (!record) throw new RecruitmentError("This candidate has not been invited yet.");
  if (record.camera.policy !== "required") throw new RecruitmentError("The camera is not required for this candidate.");
  if (record.status === "submitted") throw new RecruitmentError("The candidate has already finished.");
  const why = reason.trim().slice(0, 500);
  if (!why) throw new RecruitmentError("Give a reason.");
  if (record.camera.waived) return;
  record.camera.waived = { by: actor, at: new Date().toISOString(), reason: why };
  add(record.camera, "waived", `by ${actor}: ${why}`);
  recruitmentStore.save();
}

/** Times the camera went off, and for how long, between the start and the end of the session. */
export function cameraSummary(log: CameraLog, startedAt: string | null, endedAt: string | null) {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  let on = false;
  let offSince = start;
  let offMs = 0;
  let timesOff = 0;
  for (const e of log.events) {
    if (e.type !== "on" && e.type !== "off") continue;
    const t = Date.parse(e.at);
    if (t > end) break;
    if (e.type === "on") {
      if (!on && t > start) offMs += t - offSince;
      on = true;
    } else {
      if (on && t >= start) timesOff += 1;
      on = false;
      offSince = Math.max(t, start);
    }
  }
  if (!on) offMs += Math.max(0, end - offSince);
  return { everOn: log.events.some((e) => e.type === "on"), timesOff, offSeconds: Math.round(offMs / 1000) };
}

/** For invitation emails, so nobody is surprised by the camera. */
export function cameraEmailNote(policy: CameraPolicy) {
  if (policy === "off") return "";
  return policy === "required"
    ? "\n\nYour camera must be on while you take part. Nothing from it is recorded. If you cannot use a camera, open the link and choose \"I can't use a camera\", or contact us."
    : "\n\nUsing your camera is optional. Nothing from it is recorded.";
}
