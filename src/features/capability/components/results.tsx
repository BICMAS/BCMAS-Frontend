"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createGoal } from "@/features/me/services/portal-state";
import { cn } from "@/lib/utils";
import type { MockUser } from "@/types/user";

import { canDisagree, cycleOf, disagree, levelLabel, myAssessment, myLatestResults, stageOf } from "../services/capability";
import { capabilityMatch, disagreeBy, gapOf, priorityOf, verifiedLevel } from "../services/scoring";
import { DECISION_LABEL, type AssessmentItem, type CapabilityAssessment } from "../types";
import { formatDay, runCapability, WithCapabilityUser } from "../use-capability";
import { EvidenceSection } from "./evidence";
import { Adjustments, NoAssessment } from "./self-assessment";
import { AuditTrail, PriorityBadge, StageBadge } from "./shared";

/** Progress until results are released, then the results. "latest" shows the last released results. */
export function AssessmentResultsView({ assessmentId = "current" }: { assessmentId?: string }) {
  return (
    <WithCapabilityUser>
      {(user) => {
        const latest = myLatestResults(user);
        const assessment = assessmentId === "latest" ? latest : (myAssessment(user) ?? latest);
        if (!assessment) return <NoAssessment />;
        return assessment.releasedAt ? (
          <Results user={user} assessment={assessment} />
        ) : (
          <Progress user={user} assessment={assessment} />
        );
      }}
    </WithCapabilityUser>
  );
}

function Progress({ user, assessment }: { user: MockUser; assessment: CapabilityAssessment }) {
  const requested = assessment.items.filter((i) => i.verification?.decision === "more_evidence");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-navy">{cycleOf(assessment)?.name}</h1>
        {/* Decisions are hidden until release, so a fully reviewed assessment also reads as awaiting. */}
        <StageBadge stage={stageOf(assessment)} />
        <p className="text-sm text-slate-500">
          {assessment.submittedAt
            ? `${assessment.reviewer.name} is reviewing your evidence. You will see your results when they are released.`
            : "You have not submitted your self-assessment yet."}
        </p>
      </div>
      {assessment.submittedAt ? null : (
        <Link href={`/me/assessments/${assessment.cycleId}/start`} className={cn(buttonVariants())}>
          Continue self-assessment
        </Link>
      )}
      {requested.map((item) => (
        <section
          key={item.skillId}
          className="space-y-3 rounded-2xl border border-warning/40 bg-white p-6"
          aria-label={`More evidence: ${item.name}`}
        >
          <h2 className="font-bold text-navy">More evidence needed: {item.name}</h2>
          <p className="text-sm text-slate-600">
            {item.verification!.by}: {item.verification!.feedback}
          </p>
          <EvidenceSection user={user} assessmentId={assessment.id} item={item} canAdd />
        </section>
      ))}
      <section className="rounded-2xl border border-border-slate bg-white p-6">
        <h2 className="font-bold text-navy">Your self-ratings</h2>
        <ul className="mt-3 divide-y divide-border-slate text-sm">
          {assessment.items.map((item) => (
            <li key={item.skillId} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="font-semibold text-navy">{item.name}</span>
              <span className="text-slate-600">{item.self === null ? "Not rated" : levelLabel(item.self)}</span>
            </li>
          ))}
        </ul>
      </section>
      <Adjustments user={user} assessment={assessment} />
    </div>
  );
}

/** Match, skills met and gaps. */
export function MatchCards({ items }: { items: AssessmentItem[] }) {
  const match = capabilityMatch(items);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[
        ["Capability match", match.percent === null ? "—" : `${match.percent}%`, `${match.counted} of ${match.total} skills counted`],
        ["Skills met", `${match.met} of ${match.total}`, "At or above the required level"],
        ["Gaps to close", String(match.gaps), `${match.critical} critical`],
      ].map(([label, value, note]) => (
        <div key={label} className="rounded-2xl border border-border-slate bg-white p-5">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
          <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
          <p className="text-xs text-slate-500">{note}</p>
        </div>
      ))}
    </div>
  );
}

function Results({ user, assessment }: { user: MockUser; assessment: CapabilityAssessment }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy">Your results</h1>
        <p className="mt-2 text-slate-500">
          {cycleOf(assessment)?.name} · {assessment.roleTitle} · released {formatDay(assessment.releasedAt!)}
        </p>
      </div>
      <MatchCards items={assessment.items} />
      {assessment.items.map((item) => (
        <SkillResult key={item.skillId} user={user} assessment={assessment} item={item} />
      ))}
      <p className="text-xs text-slate-500">
        Capability match is the average of verified ÷ required level, up to 100% for each skill. Skills not yet verified are left
        out. The last day to ask for a second review is {formatDay(disagreeBy(assessment.releasedAt!).toISOString())}. These
        results are for development and are not used alone to decide pay, promotion, discipline or dismissal.
      </p>
      <AuditTrail events={assessment.events} />
    </div>
  );
}

function SkillResult({ user, assessment, item }: { user: MockUser; assessment: CapabilityAssessment; item: AssessmentItem }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const v = item.verification;
  const gap = gapOf(item) ?? 0;
  const disputed = !!item.disagreement && !item.disagreement.outcome;
  return (
    <section className="space-y-3 rounded-2xl border border-border-slate bg-white p-5" aria-label={item.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold text-navy">{item.name}</h2>
          <p className="text-xs text-slate-500">{item.category === "technical" ? "Technical" : "Behavioural"}</p>
        </div>
        <PriorityBadge item={item} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Verified", levelLabel(verifiedLevel(item))],
          ["Required", levelLabel(item.required)],
          ["Self-rated", item.self === null ? "Not rated" : levelLabel(item.self)],
          ["Gap", priorityOf(item) === "not_verified" ? "—" : `${gap} level${gap === 1 ? "" : "s"}`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="font-semibold text-navy">{value}</dd>
          </div>
        ))}
      </dl>
      {v ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <span className="font-bold text-navy">{DECISION_LABEL[v.decision]}</span> by {v.by}. {v.feedback}
        </p>
      ) : null}
      {item.disagreement ? (
        <p className="rounded-lg bg-info-soft p-3 text-sm text-info-soft-foreground" role="status">
          {item.disagreement.outcome
            ? `Second review finished by ${item.disagreement.outcome.by}: the level was ${item.disagreement.outcome.changed ? "changed" : "not changed"}.`
            : item.disagreement.reviewer
              ? `${item.disagreement.reviewer.name} is reviewing this again.`
              : "Second review requested. A reviewer will be assigned."}
        </p>
      ) : null}
      {disputed || v?.decision === "more_evidence" ? (
        <EvidenceSection user={user} assessmentId={assessment.id} item={item} canAdd />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {gap > 0 ? (
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              const goal = await createGoal(item.name, { current: verifiedLevel(item)!, target: item.required });
              router.push(`/me/growth/${goal.id}`);
            }}
          >
            Add to development plan
          </Button>
        ) : null}
        {canDisagree(assessment, item) && !asking ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(true)}>
            I disagree with this result
          </Button>
        ) : null}
      </div>
      {asking ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (runCapability(() => disagree(user, assessment.id, item.skillId, reason), "Second review requested")) setAsking(false);
          }}
        >
          <label className="block text-xs font-bold text-navy">
            Why do you disagree? You can add evidence afterwards.
            <Textarea className="mt-1 font-normal" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button type="submit" size="sm" disabled={reason.trim().length < 15}>
            Ask for a second review
          </Button>
        </form>
      ) : null}
    </section>
  );
}
