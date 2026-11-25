"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { grantExtraTime, MAX_EXTRA_MINUTES } from "../services/delivery";
import { confirmNotProgressed, referToHiringManager } from "../services/outcome-review";
import type { Application, AssessmentAttempt } from "../types";
import { formatDateTime, runAction } from "./recruitment-shared";

/** HR confirms a below-pass-mark result before it becomes final. */
export function ProposedOutcome({ candidate, organisationId, actor }: { candidate: Application; organisationId: string; actor: string }) {
  const [reason, setReason] = useState("");
  const p = candidate.proposedOutcome;
  if (!p) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-warning/40 bg-white p-6" aria-label="Outcome to confirm">
      <h2 className="font-bold text-navy">Outcome to confirm: Not Progressed</h2>
      <p className="text-sm text-slate-600">{p.reason}</p>
      <p className="text-xs text-slate-500">
        Check the answers, any adjustment or technical problem, and the written scores. Nothing is sent to the candidate until you decide.
      </p>
      {p.referral ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
          Referred to the Hiring Manager by {p.referral.by}, {formatDateTime(p.referral.at)}: {p.referral.reason}
        </p>
      ) : null}
      <label className="block text-xs font-bold text-navy">
        What you checked, or why you are referring
        <Textarea className="mt-1 font-normal" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={!reason.trim()}
          onClick={() => runAction(() => confirmNotProgressed(organisationId, candidate.id, reason, actor), "Outcome confirmed: Not Progressed.")}
        >
          Confirm Not Progressed
        </Button>
        {p.referral ? null : (
          <Button
            type="button"
            variant="secondary"
            disabled={!reason.trim()}
            onClick={() => {
              if (runAction(() => referToHiringManager(organisationId, candidate.id, reason, actor), "Referred to the Hiring Manager.")) setReason("");
            }}
          >
            Refer to Hiring Manager
          </Button>
        )}
      </div>
    </section>
  );
}

/** Extra time as an adjustment. */
export function ExtraTime({ attempt, organisationId, actor }: { attempt: AssessmentAttempt; organisationId: string; actor: string }) {
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const open = attempt.status === "invited" || attempt.status === "in_progress" || attempt.status === "expired";
  if (!open && !attempt.extraTime.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-border-slate bg-white p-5" aria-label="Extra time">
      <h2 className="font-bold text-navy">Extra time</h2>
      {attempt.extraTime.map((x) => (
        <p key={x.at} className="text-sm text-slate-600">
          {x.minutes} minutes by {x.by}, {formatDateTime(x.at)}: {x.reason}
        </p>
      ))}
      {open ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (runAction(() => grantExtraTime(organisationId, attempt.applicationId, Number(minutes), reason, actor), "Extra time added.")) {
              setMinutes("");
              setReason("");
            }
          }}
        >
          <Input className="sm:w-28" type="number" min={1} max={MAX_EXTRA_MINUTES} aria-label="Extra minutes" placeholder="Minutes" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          <Input aria-label="Reason for extra time" placeholder="Reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!minutes || !reason.trim()}>
            Add time
          </Button>
        </form>
      ) : null}
    </section>
  );
}
