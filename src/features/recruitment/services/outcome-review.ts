/**
 * A score below the pass mark never ends an application on its own: a person confirms it.
 *
 * Rules the backend must keep:
 *  - Below the pass mark, the candidate moves to Human Review with a proposed outcome.
 *  - HR either confirms Not Progressed, with a reason, or refers the candidate to the Hiring Manager,
 *    who can override with a reason. HR cannot pass a candidate below the mark.
 *  - The score, reason and pass mark stay as recorded; confirming never changes them.
 */
import { recruitmentStore, RecruitmentError } from "./vacancies";
import type { Application } from "../types";

const nowIso = () => new Date().toISOString();

/** Called by scoring when a result is below the pass mark. */
export function proposeNotProgressed(app: Application, stage: "assessment" | "interview", reason: string, actor: string) {
  app.proposedOutcome = { stage, reason, at: nowIso(), referral: null };
  app.stage = "human_review";
  app.stageHistory.push({ stage: "human_review", at: nowIso(), actor, note: `${reason} HR to confirm the outcome.` });
}

function pending(organisationId: string, id: string) {
  const app = recruitmentStore.data().applications.find((a) => a.id === id && a.organisationId === organisationId);
  if (!app) throw new RecruitmentError("Candidate not found in your organisation.");
  if (!app.proposedOutcome) throw new RecruitmentError("There is no outcome to confirm for this candidate.");
  return { app, proposed: app.proposedOutcome };
}

export function confirmNotProgressed(organisationId: string, id: string, reason: string, actor: string) {
  const { app } = pending(organisationId, id);
  if (!reason.trim()) throw new RecruitmentError("Say what you checked before confirming.");
  app.proposedOutcome = null;
  app.stage = "not_progressed";
  app.stageHistory.push({ stage: "not_progressed", at: nowIso(), actor, note: `Confirmed by HR: ${reason.trim()}` });
  recruitmentStore.save();
}

export function referToHiringManager(organisationId: string, id: string, reason: string, actor: string) {
  const { app, proposed } = pending(organisationId, id);
  if (!reason.trim()) throw new RecruitmentError("Say why the Hiring Manager should look at this.");
  if (proposed.referral) throw new RecruitmentError("This candidate has already been referred.");
  proposed.referral = { by: actor, at: nowIso(), reason: reason.trim() };
  app.stageHistory.push({ stage: "human_review", at: nowIso(), actor, note: `Referred to the Hiring Manager: ${reason.trim()}` });
  recruitmentStore.save();
}
