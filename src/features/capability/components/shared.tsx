import { Badge } from "@/components/ui/badge";

import { priorityOf } from "../services/scoring";
import { PRIORITY_LABEL, STAGE_LABEL, type AssessmentItem, type AssessmentStage, type CapabilityEvent, type GapPriority } from "../types";
import { formatDay } from "../use-capability";

const PRIORITY_VARIANT: Record<GapPriority, "success" | "warning" | "error" | "secondary"> = {
  met: "success",
  moderate: "warning",
  critical: "error",
  not_verified: "secondary",
};

export function PriorityBadge({ item }: { item: AssessmentItem }) {
  const p = priorityOf(item);
  return <Badge variant={PRIORITY_VARIANT[p]}>{PRIORITY_LABEL[p]}</Badge>;
}

const STAGE_VARIANT: Record<AssessmentStage, "success" | "warning" | "info" | "secondary"> = {
  not_started: "secondary",
  in_progress: "secondary",
  awaiting_verification: "warning",
  more_evidence: "warning",
  reviewed: "info",
  released: "success",
};

export function StageBadge({ stage }: { stage: AssessmentStage }) {
  return <Badge variant={STAGE_VARIANT[stage]}>{STAGE_LABEL[stage]}</Badge>;
}

export function AuditTrail({ events }: { events: CapabilityEvent[] }) {
  return (
    <section className="rounded-2xl border border-border-slate bg-white p-6" aria-label="Audit trail">
      <h2 className="font-bold text-navy">Audit trail</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {[...events].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="border-l-2 border-green-lime pl-3">
            <span className="font-bold text-navy">{e.action}</span> <span className="text-slate-600">{e.detail}</span>
            <span className="block text-xs text-slate-400">
              {e.actor} · {formatDay(e.at)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
