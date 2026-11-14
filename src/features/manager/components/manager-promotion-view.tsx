"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listDirectReportPromotions,
  saveManagerReview,
  type ManagerDecision,
  type PromotionAssessment,
} from "@/features/talent/services/mock-promotion";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

const decisions: ManagerDecision[] = ["Support", "Defer", "Do not support"];

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

export function ManagerPromotionView() {
  const user = useHydratedUser();
  const [rows, setRows] = useState<PromotionAssessment[]>(() => listDirectReportPromotions());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<ManagerDecision | "">("");
  const [saving, setSaving] = useState(false);
  const active = rows.find((row) => row.id === activeId) ?? null;

  if (!user) return null;
  if (user.portal !== "line_manager") {
    return <p className="text-sm text-slate-500">Promotion review is for the line manager of these direct reports.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Promotion Review"
        description="Direct reports only. External candidates are not included."
      />
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-navy">{row.employeeName}</p>
                <p className="text-sm text-slate-500">
                  {row.currentRole} → {row.roleTitle}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="info">{row.status}</Badge>
                {row.readiness ? <Badge variant={readinessVariant[row.readiness]}>{row.readiness}</Badge> : null}
              </div>
            </div>
            <div className="mt-3 flex gap-4">
              <Link href={`/talent/promotion/${row.id}`} className="text-sm font-bold text-navy">
                View report
              </Link>
              <button
                type="button"
                className="text-sm font-bold text-navy"
                onClick={() => {
                  setActiveId(row.id);
                  setComment(row.managerComment ?? "");
                  setDecision(row.managerDecision ?? "");
                }}
              >
                Manager Review
              </button>
            </div>
          </li>
        ))}
      </ul>
      {active ? (
        <form
          className="space-y-4 rounded-2xl border border-border-slate bg-white p-6 shadow-sm"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!decision || comment.trim().length < 3) {
              toast.error("Add a decision and a comment.");
              return;
            }
            setSaving(true);
            try {
              await saveManagerReview(active.id, {
                reviewer: user.name,
                comment,
                decision,
              });
              setRows(listDirectReportPromotions());
              toast.success("Manager review saved");
            } finally {
              setSaving(false);
            }
          }}
        >
          <h2 className="font-bold text-navy">Manager Review · {active.employeeName}</h2>
          <label className="block text-xs font-bold tracking-widest text-slate-400 uppercase" htmlFor="decision">
            Decision
          </label>
          <select
            id="decision"
            className="h-11 w-full rounded-lg border border-border-slate bg-slate-50 px-4 text-sm text-navy"
            value={decision}
            onChange={(event) => setDecision(event.target.value as ManagerDecision | "")}
          >
            <option value="">Select a decision</option>
            {decisions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label className="block text-xs font-bold tracking-widest text-slate-400 uppercase" htmlFor="comment">
            Comment
          </label>
          <textarea
            id="comment"
            className="min-h-28 w-full rounded-lg border border-border-slate bg-slate-50 px-4 py-3 text-sm text-navy"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <Button type="submit" disabled={saving}>
            Save review
          </Button>
        </form>
      ) : null}
    </div>
  );
}
