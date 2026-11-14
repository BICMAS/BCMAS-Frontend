"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { getOwnPromotion } from "@/features/talent/services/mock-promotion";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

export function PromotionResultsView({ assessmentId }: { assessmentId: string }) {
  const user = useHydratedUser();
  if (!user) return null;
  const record = getOwnPromotion(assessmentId, user.id);
  if (!record) {
    return <p className="text-sm text-slate-500">This promotion assignment is not available to you.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Your readiness report</p>
        <h1 className="mt-2 text-3xl font-bold text-navy">{record.roleTitle}</h1>
        <p className="mt-2 text-sm text-slate-500">This report is only for your assignment.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {record.readiness ? (
          <Badge variant={readinessVariant[record.readiness]}>{record.readiness}</Badge>
        ) : (
          <Badge variant="outline">Not scored</Badge>
        )}
        <Badge variant="secondary">{record.score == null ? "No score" : `${record.score}%`}</Badge>
      </div>
      <ul className="space-y-3">
        {record.rubric.map((row) => (
          <li key={row.skill} className="rounded-2xl border border-border-slate bg-white p-4">
            <p className="font-bold text-navy">{row.skill}</p>
            <p className="text-sm text-slate-500">
              Required {row.requiredLevel} · score {row.score ?? "—"} · {row.readiness ?? "Not scored"}
            </p>
          </li>
        ))}
      </ul>
      {record.managerDecision ? (
        <section className="rounded-2xl border border-border-slate bg-white p-4">
          <p className="font-bold text-navy">Manager decision: {record.managerDecision}</p>
          <p className="mt-1 text-sm text-slate-500">{record.managerComment}</p>
        </section>
      ) : null}
      <Link href="/me/promotion" className="inline-block text-sm font-bold text-navy">
        Back to my promotion
      </Link>
    </div>
  );
}
