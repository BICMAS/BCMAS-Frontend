"use client";

import type { CompetencyScore, OrchestratorApprovalDecision, ScoringView } from "@ai/contracts";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useAiAction } from "../../hooks/use-ai-query";
import { CompetencyChart } from "../shared/competency-chart";
import { AiDisclaimer, AiInlineError, StatusBadge } from "../shared/ai-states";

type RowDecision = { decision: "accepted" | "overridden"; value: string; comment: string };

const JUDGEMENT_TONE = { met: "success", partial: "warning", not_met: "error", not_evidenced: "secondary" } as const;

/** Assessment results for the assessor: evidence-based scores, criteria, evidence, and the per-competency review. */
export function ScoringPanel({ view, onChange }: { view: ScoringView; onChange: (view: ScoringView) => void }) {
  const evaluation = view.evaluation;
  const pending = view.review?.status === "pending";
  const [rows, setRows] = useState<Record<string, RowDecision>>(() =>
    Object.fromEntries(
      evaluation.recommendations.map((r) => [
        r.rubric_row_id,
        { decision: r.recommended_score === null ? "overridden" : "accepted", value: "", comment: "" },
      ]),
    ),
  );
  const review = useAiAction((c, decision: OrchestratorApprovalDecision) => c.reviewScoringSet(evaluation.scoring_set_id, decision));
  const report = useAiAction((c) => c.draftAssessmentReport(evaluation.assessment_id));
  const [reportStatus, setReportStatus] = useState<string | null>(null);

  const invalid = evaluation.recommendations.some((r) => {
    const row = rows[r.rubric_row_id]!;
    if (row.decision === "accepted") return r.recommended_score === null;
    const value = Number(row.value);
    return !(value >= 1 && value <= 5) || !row.comment.trim();
  });

  async function submit(decision: "approve" | "reject") {
    const body: OrchestratorApprovalDecision =
      decision === "reject"
        ? { decision: "reject", items: [], comment: "Rejected by the assessor." }
        : {
            decision: "approve",
            items: evaluation.recommendations.map((r) => {
              const row = rows[r.rubric_row_id]!;
              return row.decision === "accepted"
                ? { item_id: r.rubric_row_id, decision: "accepted" }
                : { item_id: r.rubric_row_id, decision: "overridden", value: Number(row.value), comment: row.comment.trim() };
            }),
          };
    const updated = await review.run(body);
    if (updated) onChange(updated);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-navy">
            Results for {evaluation.assessment_id}
            <StatusBadge status={view.review?.status ?? view.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CompetencyChart
            currentLabel="Evidence-based level"
            data={evaluation.recommendations.map((r) => ({ name: r.skill_name, required: r.required_level, current: r.recommended_score }))}
          />
          <AiDisclaimer>
            {evaluation.disclaimer} Scoring rule: {evaluation.scoring_rule}
          </AiDisclaimer>
        </CardContent>
      </Card>
      {evaluation.recommendations.map((r) => (
        <CompetencyCard
          key={r.rubric_row_id}
          score={r}
          editable={pending}
          row={rows[r.rubric_row_id]!}
          onRow={(row) => setRows((current) => ({ ...current, [r.rubric_row_id]: row }))}
        />
      ))}
      {pending ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={review.pending || invalid} onClick={() => submit("approve")}>
            {review.pending ? "Submitting review…" : "Confirm scores"}
          </Button>
          <Button type="button" variant="destructive" disabled={review.pending} onClick={() => submit("reject")}>
            Reject all
          </Button>
          {invalid ? <span className="text-xs text-slate-500">Give a 1–5 score and a reason for every override.</span> : null}
        </div>
      ) : null}
      <AiInlineError error={review.error} />
      {view.review && !pending ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-navy">Review outcome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {view.review.commit_plan.length ? (
              <p className="text-navy">
                Confirmed scores are saved to the assessment record via {view.review.commit_plan.length} update(s) (
                {view.review.commit_plan[0]!.endpoint_id}, {view.review.commit_plan[0]!.endpoint_status}).
              </p>
            ) : (
              <p className="text-slate-500">Nothing to save: the AI scores were rejected.</p>
            )}
            {view.follow_ups.map((f) => (
              <p key={f.capability + (f.subject_employee_id ?? "")} className="text-slate-600">
                Shared with {f.capability.startsWith("dev_plan") ? "the Training Plan Agent" : "the Coaching Agent"}: {f.summary ?? f.status}
              </p>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={report.pending || !view.review.commit_plan.length}
              onClick={async () => {
                const result = await report.run();
                if (result) setReportStatus(`Report draft ${result.draft.draft_id} created; awaiting review.`);
              }}
            >
              Draft assessment report
            </Button>
            {reportStatus ? <p className="text-navy">{reportStatus}</p> : null}
            <AiInlineError error={report.error} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CompetencyCard({
  score,
  editable,
  row,
  onRow,
}: {
  score: CompetencyScore;
  editable: boolean;
  row: RowDecision;
  onRow: (row: RowDecision) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-navy">
          {score.skill_name}
          <span className="text-sm font-normal text-slate-500">
            {score.recommended_score === null ? "No level demonstrated" : `Level ${score.recommended_score}`} · required{" "}
            {score.required_level} · {score.confidence} confidence
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-slate-600">{score.determination}</p>
        <table className="w-full text-left">
          <caption className="sr-only">Criteria for {score.skill_name}</caption>
          <thead className="text-[11px] tracking-wider text-slate-400 uppercase">
            <tr>
              <th className="py-1">Criterion</th>
              <th className="py-1">Level</th>
              <th className="py-1">Judgement</th>
            </tr>
          </thead>
          <tbody>
            {score.criteria.map((c) => (
              <tr key={c.criterion_id} className="border-t border-border-slate align-top">
                <td className="py-2 pr-3 text-navy">
                  {c.text}
                  {c.evidence.map((e) => (
                    <span key={e.response_item_id + (e.quote ?? e.option_key ?? "")} className="mt-1 block text-xs text-slate-500 italic">
                      {e.kind === "quote" ? `“${e.quote}”` : `Chose option ${e.option_key}`}
                      {e.self_reported ? " (self-reported)" : ""}
                    </span>
                  ))}
                </td>
                <td className="py-2 pr-3">{c.level}</td>
                <td className="py-2">
                  <Badge variant={JUDGEMENT_TONE[c.judgement]}>{c.judgement.replace(/_/g, " ")}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {score.rating_claims.length ? (
          <p className="text-xs text-slate-500">
            {score.rating_claims
              .map((r) => `${r.respondent === "subject" ? "Self" : "Manager"} rating ${r.rating}: ${r.alignment.replace(/_/g, " ")}`)
              .join(" · ")}
          </p>
        ) : null}
        <p className="text-slate-600">{score.rationale}</p>
        {editable ? (
          <fieldset className="space-y-3 rounded-xl bg-slate-50 p-4">
            <legend className="sr-only">Your decision for {score.skill_name}</legend>
            <div className="flex flex-wrap gap-4 text-sm text-navy">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`decision-${score.rubric_row_id}`}
                  checked={row.decision === "accepted"}
                  disabled={score.recommended_score === null}
                  onChange={() => onRow({ ...row, decision: "accepted" })}
                />
                Accept AI score
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`decision-${score.rubric_row_id}`}
                  checked={row.decision === "overridden"}
                  onChange={() => onRow({ ...row, decision: "overridden" })}
                />
                {score.recommended_score === null ? "Enter my score" : "Override"}
              </label>
            </div>
            {row.decision === "overridden" ? (
              <div className="flex flex-wrap gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`value-${score.rubric_row_id}`}>Score (1–5)</Label>
                  <Input
                    id={`value-${score.rubric_row_id}`}
                    type="number"
                    min={1}
                    max={5}
                    value={row.value}
                    onChange={(e) => onRow({ ...row, value: e.target.value })}
                    className="w-24"
                  />
                </div>
                <div className="min-w-60 flex-1 space-y-1">
                  <Label htmlFor={`comment-${score.rubric_row_id}`}>Reason</Label>
                  <Input
                    id={`comment-${score.rubric_row_id}`}
                    value={row.comment}
                    maxLength={1000}
                    onChange={(e) => onRow({ ...row, comment: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
          </fieldset>
        ) : null}
      </CardContent>
    </Card>
  );
}
