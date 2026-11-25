"use client";

import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { frameworkLevels } from "@/features/skills/services/mock-skills";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/types/user";

import {
  assessmentsInCycle,
  activeCycle,
  assignSecondReviewer,
  cycleOf,
  cycleStats,
  decide,
  decideSecondReview,
  getAssessment,
  grantExtension,
  latestResults,
  levelDescription,
  levelLabel,
  openDisagreements,
  reassignReviewer,
  respondToAdjustment,
  reviewerOptions,
  reviewQueue,
  selfAssessmentClosed,
  stageOf,
  type DecisionInput,
} from "../services/capability";
import { capabilityMatch, evidenceWarnings, gapOf, isRecent, verifiedLevel } from "../services/scoring";
import { DECISION_LABEL, STAGE_LABEL, type AssessmentItem, type CapabilityAssessment, type VerificationDecision } from "../types";
import { downloadText, formatDay, runCapability, WithCapabilityUser } from "../use-capability";
import { EvidenceList } from "./evidence";
import { MatchCards } from "./results";
import { AuditTrail, PriorityBadge, StageBadge } from "./shared";

const selectClass = "h-10 rounded-lg border border-border-slate bg-white px-3 text-sm text-navy";

const DETAIL: Record<VerificationDecision, string> = {
  verified: "The evidence meets the capability requirements. Records the required level, or a higher one it supports.",
  more_evidence: "Ask the employee to provide further evidence. Nothing is scored yet.",
  not_verified: "The evidence does not meet the requirements yet. Choose the level it supports.",
};

const GUIDANCE =
  "Provide feedback on the evidence submitted, observed strengths, areas requiring improvement and recommended next steps.";

/* ── Review one employee's assessment ─────────────────────────────────── */

export function EvidenceReviewView({ evidenceId }: { evidenceId: string }) {
  return <WithCapabilityUser>{(user) => <ReviewAssessment user={user} id={evidenceId} />}</WithCapabilityUser>;
}

function ReviewAssessment({ user, id }: { user: MockUser; id: string }) {
  const a = getAssessment(user, id);
  if (!a || a.employeeEmail.toLowerCase() === user.email.toLowerCase()) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">This assessment is not in your queue.</p>
        <Link href="/verification/team" className="text-sm font-bold text-navy">
          Back to the queue
        </Link>
      </div>
    );
  }
  const isReviewer = a.reviewer.userId === user.id;
  const decided = a.items.filter((i) => i.verification).length;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={a.employeeName}
        description={`${a.roleTitle} · profile ${a.profileVersion} · ${cycleOf(a)?.name ?? ""} · reviewer ${a.reviewer.name}`}
        actions={<StageBadge stage={stageOf(a)} />}
      />
      {a.releasedAt ? <MatchCards items={a.items} /> : null}
      {!a.submittedAt ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          {selfAssessmentClosed(a)
            ? "Self-assessment closed before the employee submitted. Agree an extension if there is a good reason."
            : "The employee has not submitted this self-assessment yet, so nothing can be decided."}
        </p>
      ) : (
        <p className="text-sm text-slate-500" aria-live="polite">
          {decided} of {a.items.length} skills decided
        </p>
      )}
      {!a.submittedAt && (isReviewer || user.portal === "organisation_admin") ? <Extension user={user} assessment={a} /> : null}
      <AdjustmentRequests user={user} assessment={a} />
      {a.items.map((item) => (
        <SkillReview key={item.skillId} user={user} assessment={a} item={item} isReviewer={isReviewer} />
      ))}
      {!a.releasedAt && (isReviewer || user.portal === "organisation_admin") ? <HandOver user={user} assessment={a} /> : null}
      <AuditTrail events={a.events} />
    </div>
  );
}

function SkillReview({
  user,
  assessment: a,
  item,
  isReviewer,
}: {
  user: MockUser;
  assessment: CapabilityAssessment;
  item: AssessmentItem;
  isReviewer: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const v = item.verification;
  const secondReviewer = !!item.disagreement && !item.disagreement.outcome && item.disagreement.reviewer?.userId === user.id;
  const canDecide = isReviewer && !!a.submittedAt && (a.releasedAt ? !v : true);
  const showForm = secondReviewer || (canDecide && (!v || editing));
  return (
    <section className="space-y-4 rounded-2xl border border-border-slate bg-white p-6" aria-label={item.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-bold text-navy">{item.name}</h2>
        {v ? <PriorityBadge item={item} /> : <Badge variant="secondary">Not decided</Badge>}
      </div>
      <div className="grid gap-3 text-sm text-navy sm:grid-cols-2">
        <p>Required: {levelLabel(item.required)}</p>
        <p>Self-rated: {item.self === null ? "Not rated" : levelLabel(item.self)}</p>
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <span className="font-bold text-navy">What the required level looks like:</span> {levelDescription(item.skillId, item.required)}
      </p>
      <EvidenceList item={item} />
      {showForm
        ? evidenceWarnings(item).map((w) => (
            <p key={w} className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              {w}
            </p>
          ))
        : null}
      {v ? (
        <p className="text-sm text-slate-600">
          <span className="font-bold text-navy">{DECISION_LABEL[v.decision]}</span>
          {v.level === null ? "" : ` · ${levelLabel(v.level)}`}
          {v.late ? " · after the deadline" : ""} · {v.by}, {formatDay(v.at)}. {v.feedback}
        </p>
      ) : null}
      {item.disagreement ? <DisagreementNote user={user} assessment={a} item={item} /> : null}
      {canDecide && v && !editing && !secondReviewer ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Change decision
        </Button>
      ) : null}
      {showForm ? (
        <DecisionForm
          key={`${item.skillId}-${secondReviewer}`}
          item={item}
          second={secondReviewer}
          onSubmit={(input) => {
            const act = () =>
              secondReviewer ? decideSecondReview(user, a.id, item.skillId, input) : decide(user, a.id, item.skillId, input);
            if (runCapability(act, "Verification submitted")) setEditing(false);
          }}
        />
      ) : null}
    </section>
  );
}

function DecisionForm({ item, second, onSubmit }: { item: AssessmentItem; second: boolean; onSubmit: (input: DecisionInput) => void }) {
  const [decision, setDecision] = useState<VerificationDecision | "">("");
  const [level, setLevel] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const options: VerificationDecision[] = second ? ["verified", "not_verified"] : ["verified", "more_evidence", "not_verified"];
  const canVerify = item.evidence.some((e) => isRecent(e));
  const levels = Array.from({ length: item.required }, (_, i) => i);
  const higher = frameworkLevels().map((l) => l.rank).filter((l) => l >= item.required);
  const id = `feedback-${item.skillId}`;
  return (
    <form
      className="space-y-3 border-t border-border-slate pt-4"
      aria-label={`Decision for ${item.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (decision) onSubmit({ decision, level, feedback });
      }}
    >
      <h3 className="text-sm font-bold text-navy">{second ? "Second review" : "Manager Validation"}</h3>
      {options.map((option) => (
        <label
          key={option}
          className={cn(
            "flex cursor-pointer gap-3 rounded-xl border p-3",
            decision === option ? "border-navy bg-slate-50" : "border-border-slate",
            option === "verified" && !canVerify && "opacity-60",
          )}
        >
          <input
            type="radio"
            name={`decision-${item.skillId}`}
            className="mt-1"
            disabled={option === "verified" && !canVerify}
            checked={decision === option}
            onChange={() => {
              setDecision(option);
              setLevel(option === "verified" ? item.required : null);
            }}
          />
          <span>
            <span className="block text-sm font-bold text-navy">{DECISION_LABEL[option]}</span>
            <span className="text-xs text-slate-500">
              {option === "verified" && !canVerify ? "Needs evidence from the last 12 months." : DETAIL[option]}
            </span>
          </span>
        </label>
      ))}
      {decision === "not_verified" || decision === "verified" ? (
        <label className="block text-xs font-bold text-navy">
          Level the evidence supports
          <select className={cn(selectClass, "mt-1 block font-normal")} value={level ?? ""} onChange={(e) => setLevel(e.target.value === "" ? null : Number(e.target.value))}>
            {decision === "verified" ? null : <option value="">Choose…</option>}
            {(decision === "verified" ? higher : levels).map((l) => (
              <option key={l} value={l}>
                {levelLabel(l)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block text-xs font-bold text-navy" htmlFor={id}>
        Feedback for Employee *
      </label>
      <Textarea id={id} rows={3} required value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={GUIDANCE} />
      <Button type="submit" disabled={!decision || !feedback.trim() || (decision === "not_verified" && level === null)}>
        Submit Verification
      </Button>
    </form>
  );
}

function DisagreementNote({ user, assessment: a, item }: { user: MockUser; assessment: CapabilityAssessment; item: AssessmentItem }) {
  const [reviewer, setReviewer] = useState("");
  const d = item.disagreement!;
  const options = reviewerOptions(a, item.verification ? [item.verification.byUserId] : []);
  return (
    <div className="space-y-2 rounded-xl bg-info-soft p-4 text-sm text-info-soft-foreground">
      <p>
        <span className="font-bold">Employee disagrees:</span> {d.reason}
      </p>
      <p>
        {d.outcome
          ? `Second review by ${d.outcome.by}: ${d.outcome.changed ? "level changed" : "level unchanged"}.`
          : d.reviewer
            ? `Second reviewer: ${d.reviewer.name}.`
            : "No second reviewer yet."}
      </p>
      {user.portal === "organisation_admin" && !d.outcome ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runCapability(() => assignSecondReviewer(user, a.id, item.skillId, reviewer), "Second reviewer assigned");
          }}
        >
          <select className={selectClass} aria-label={`Second reviewer for ${item.name}`} value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
            <option value="">Choose reviewer…</option>
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.roleLabel})
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary" disabled={!reviewer}>
            Assign
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function AdjustmentRequests({ user, assessment: a }: { user: MockUser; assessment: CapabilityAssessment }) {
  const [text, setText] = useState("");
  const canAnswer = a.reviewer.userId === user.id || user.portal === "organisation_admin";
  if (!a.adjustments.length) return null;
  return (
    <section className="space-y-2 rounded-2xl border border-border-slate bg-white p-6" aria-label="Adjustment requests">
      <h2 className="font-bold text-navy">Adjustment requests</h2>
      {a.adjustments.map((r, i) => (
        <div key={r.at} className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-navy">
          <p>{r.request}</p>
          {r.response ? (
            <p className="text-xs text-slate-500">
              {r.response.by}: {r.response.text}
            </p>
          ) : canAnswer ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (runCapability(() => respondToAdjustment(user, a.id, i, text), "Response sent")) setText("");
              }}
            >
              <Input aria-label="Response" value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()}>
                Respond
              </Button>
            </form>
          ) : null}
        </div>
      ))}
    </section>
  );
}

/** More time to self-assess, up to the verification deadline. */
function Extension({ user, assessment: a }: { user: MockUser; assessment: CapabilityAssessment }) {
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3 rounded-2xl border border-border-slate bg-white p-6"
      aria-label="Extension"
      onSubmit={(e) => {
        e.preventDefault();
        if (runCapability(() => grantExtension(user, a.id, until, reason), "Extension agreed")) setReason("");
      }}
    >
      <h2 className="font-bold text-navy">Extension</h2>
      {a.extension ? (
        <p className="text-sm text-slate-600">
          Until {formatDay(a.extension.until)}, agreed by {a.extension.by}: {a.extension.reason}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-44" type="date" aria-label="Extend until" value={until} onChange={(e) => setUntil(e.target.value)} />
        <Input className="max-w-sm" aria-label="Reason for extension" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!until || !reason.trim()}>
          Agree extension
        </Button>
      </div>
    </form>
  );
}

/** Conflict of interest, or a reviewer who is absent. */
function HandOver({ user, assessment: a }: { user: MockUser; assessment: CapabilityAssessment }) {
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3 rounded-2xl border border-border-slate bg-white p-6"
      aria-label="Change reviewer"
      onSubmit={(e) => {
        e.preventDefault();
        runCapability(() => reassignReviewer(user, a.id, to, reason), "Reviewer changed");
      }}
    >
      <h2 className="font-bold text-navy">Change reviewer</h2>
      <p className="text-sm text-slate-500">
        Use this for a conflict of interest, for example a close connection to the employee or the evidence, or if the reviewer is away.
      </p>
      <div className="flex flex-wrap gap-2">
        <select className={selectClass} aria-label="New reviewer" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose reviewer…</option>
          {reviewerOptions(a, [a.reviewer.userId]).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.roleLabel})
            </option>
          ))}
        </select>
        <Input className="max-w-sm" aria-label="Reason for change" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={!to || !reason.trim()}>
          Change reviewer
        </Button>
      </div>
    </form>
  );
}

/* ── Queues and results ───────────────────────────────────────────────── */

function Row({ a, label }: { a: CapabilityAssessment; label: string }) {
  const decided = a.items.filter((i) => i.verification).length;
  return (
    <article className="rounded-2xl border border-border-slate bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-navy">{a.employeeName}</h2>
          <p className="text-sm text-slate-500">
            {a.roleTitle} · {a.department}
          </p>
        </div>
        <StageBadge stage={stageOf(a)} />
      </div>
      <p className="mt-3 text-sm text-slate-600">
        {a.items.filter((i) => i.self !== null).length} of {a.items.length} skills self-rated · {decided} decided
        {a.adjustments.some((r) => !r.response) ? " · adjustment requested" : ""}
      </p>
      <Link href={`/verification/evidence/${a.id}`} className={cn(buttonVariants({ variant: a.submittedAt ? "default" : "secondary" }), "mt-4")}>
        {label}
      </Link>
    </article>
  );
}

export function TeamVerificationView() {
  return (
    <WithCapabilityUser>
      {(user) => {
        const queue = reviewQueue(user);
        const second = openDisagreements(user).filter((d) => d.item.disagreement?.reviewer?.userId === user.id);
        return (
          <div className="mx-auto max-w-5xl space-y-6">
            <PageHeader
              breadcrumbs={
                <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">Assessment Hub / Team Verification</p>
              }
              title="Team Verification Hub"
              description="Review the self-assessments and evidence your team members have submitted."
              actions={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => downloadText("team-verification.txt", queue.map((a) => `${a.employeeName},${STAGE_LABEL[stageOf(a)]}`))}
                >
                  Export Team Status
                </Button>
              }
            />
            {second.map(({ assessment, item }) => (
              <p key={`${assessment.id}-${item.skillId}`} className="rounded-xl bg-info-soft p-4 text-sm text-info-soft-foreground">
                Second review for {assessment.employeeName}: {item.name}.{" "}
                <Link href={`/verification/evidence/${assessment.id}`} className="font-bold underline">
                  Open
                </Link>
              </p>
            ))}
            {queue.length ? (
              queue.map((a) => <Row key={a.id} a={a} label={a.submittedAt ? "Start Verification" : "View progress"} />)
            ) : (
              <p className="rounded-2xl border border-dashed border-border-slate p-8 text-center text-sm text-slate-500">
                You have no assessments to review in an active cycle.
              </p>
            )}
          </div>
        );
      }}
    </WithCapabilityUser>
  );
}

export function VerificationOverviewView() {
  return (
    <WithCapabilityUser>
      {(user) => {
        const cycle = activeCycle(user.organisationId);
        const list = cycle ? assessmentsInCycle(user, cycle.id) : [];
        const stats = cycle ? cycleStats(user, cycle.id).overall : null;
        const disputes = openDisagreements(user);
        return (
          <div className="mx-auto max-w-6xl space-y-8">
            <PageHeader
              title="Capability Verification Hub"
              description={cycle ? `${cycle.name} · verification due ${cycle.verifyBy ? formatDay(cycle.verifyBy) : cycle.verificationDeadline}` : "No cycle is active."}
              actions={
                <Link href="/verification/results" className={cn(buttonVariants({ variant: "secondary" }))}>
                  Released results
                </Link>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Pending Verification", String(stats?.selfAssessed ?? 0)],
                ["Verified Employees", String(stats?.verified ?? 0)],
                ["Not yet submitted", String(stats?.remaining ?? 0)],
                ["Open disagreements", String(disputes.length)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
                  <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
                  <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
                </div>
              ))}
            </div>
            {disputes.length ? (
              <section className="space-y-2 rounded-2xl border border-border-slate bg-white p-6">
                <h2 className="font-bold text-navy">Disagreements</h2>
                {disputes.map(({ assessment, item }) => (
                  <p key={`${assessment.id}-${item.skillId}`} className="text-sm text-navy">
                    <Link href={`/verification/evidence/${assessment.id}`} className="font-bold underline">
                      {assessment.employeeName}: {item.name}
                    </Link>{" "}
                    · {item.disagreement?.reviewer ? `with ${item.disagreement.reviewer.name}` : "needs a second reviewer"}
                  </p>
                ))}
              </section>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              {list.map((a) => (
                <Row key={a.id} a={a} label="Open" />
              ))}
            </div>
          </div>
        );
      }}
    </WithCapabilityUser>
  );
}

export function VerificationResultsView() {
  return (
    <WithCapabilityUser>
      {(user) => {
        const results = latestResults(user);
        return (
          <div className="mx-auto max-w-5xl space-y-6">
            <PageHeader
              title="Verification results"
              description="Latest released results. Use them for development; they are not used alone to decide pay, promotion, discipline or dismissal."
              actions={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    downloadText(
                      "verification-audit.txt",
                      results.flatMap((a) => [
                        `${a.employeeName} (${a.roleTitle})`,
                        ...a.events.map((e) => `  ${e.at}  ${e.actor}  ${e.action}  ${e.detail}`),
                      ]),
                    )
                  }
                >
                  Export Full Audit
                </Button>
              }
            />
            {results.map((a) => {
              const match = capabilityMatch(a.items);
              const gaps = a.items.filter((i) => (gapOf(i) ?? 0) > 0);
              return (
                <article key={a.id} className="space-y-3 rounded-2xl border border-border-slate bg-white p-6">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h2 className="font-bold text-navy">
                      <Link href={`/verification/evidence/${a.id}`} className="hover:underline">
                        {a.employeeName}
                      </Link>
                    </h2>
                    <p className="text-sm text-slate-600">
                      {match.percent}% match · {match.met} of {match.total} skills met · {match.counted} counted · {cycleOf(a)?.name}
                    </p>
                  </div>
                  {gaps.map((i) => (
                    <p key={i.skillId} className="flex flex-wrap items-center gap-2 text-sm text-navy">
                      <PriorityBadge item={i} /> {i.name}: Level {verifiedLevel(i)} of {i.required}
                    </p>
                  ))}
                </article>
              );
            })}
            {results.length ? null : <p className="text-sm text-slate-500">No results have been released.</p>}
          </div>
        );
      }}
    </WithCapabilityUser>
  );
}
