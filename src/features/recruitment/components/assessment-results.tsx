"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { assessmentLink, hrAttemptView, scoreWrittenAnswer } from "../services/delivery";
import { formatDateTime, runAction } from "./recruitment-shared";

const EVENT_LABEL: Record<string, string> = {
  invited: "Invitation sent",
  resent: "Invitation resent (new link)",
  opened: "Link opened",
  started: "Started",
  resumed: "Resumed",
  autosaved: "Autosaved",
  support_requested: "Support requested",
  time_expired: "Time allowed ended",
  submitted: "Submitted",
};

/** HR's view of a candidate's assessment (guide §13). Answers appear only after submission. */
export function AssessmentResults({
  organisationId,
  applicationId,
  actor,
}: {
  organisationId: string;
  applicationId: string;
  actor: string;
}) {
  const view = hrAttemptView(organisationId, applicationId);
  if (!view) {
    return (
      <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">
        Not invited yet. Use Send Assessment Invitation once you have reviewed the CV evidence.
      </p>
    );
  }
  const { attempt, version } = view;
  const score = attempt.score;
  const link = assessmentLink(attempt.token);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-navy">
              {attempt.assessmentName} v{attempt.assessmentVersion}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Invited {formatDateTime(attempt.invitedAt)} · link expires {formatDateTime(attempt.expiresAt)} · threshold snapshot v
              {attempt.thresholdSnapshotVersion}
              {attempt.resentCount ? ` · resent ${attempt.resentCount}×` : ""}
            </p>
          </div>
          <Badge variant={attempt.status === "submitted" ? "success" : attempt.status === "expired" ? "warning" : "info"}>
            {attempt.status === "in_progress" ? "In progress" : attempt.status.charAt(0).toUpperCase() + attempt.status.slice(1)}
          </Badge>
        </div>
        {attempt.status !== "submitted" ? (
          <p className="mt-3 text-xs text-slate-500">
            Candidate link (sent to their confirmed email):{" "}
            <a href={link} target="_blank" rel="noreferrer" className="font-mono text-navy underline">
              {link}
            </a>
            . You cannot see or change answers until the candidate submits.
          </p>
        ) : null}
      </section>

      {score ? (
        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm" aria-label="Assessment result">
          <h2 className="font-bold text-navy">Result</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Score", score.percent === null ? "Pending" : `${score.percent}%`],
              ["Pass threshold", `${score.threshold}%`],
              ["Objective", `${score.objectivePoints}/${score.objectiveMax}`],
              ["Written", score.writtenMax ? `${score.writtenPoints}/${score.writtenMax}` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border-slate p-3">
                <p className="text-lg font-bold text-navy">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-navy">
            <Badge variant={score.outcome === "passed" ? "success" : score.outcome === "not_passed" ? "error" : "warning"}>
              {score.outcome === "passed" ? "Met the threshold" : score.outcome === "not_passed" ? "Below the threshold" : "Awaiting written scoring"}
            </Badge>{" "}
            {score.reason}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Scoring rule {score.scoringRuleVersion} · scored {formatDateTime(score.scoredAt)}. The Hiring Manager can override
            progression with a recorded reason.
          </p>
        </section>
      ) : null}

      {attempt.status === "submitted" && version ? (
        <section className="space-y-3" aria-label="Answers">
          <h2 className="font-bold text-navy">Answers</h2>
          {version.items.map((item, i) => {
            const answer = attempt.answers[item.id];
            if (item.responseType !== "case_response") {
              const chosen = item.options.find((o) => o.id === answer?.optionId);
              const correct = answer?.optionId === item.scoring.correctOptionId;
              return (
                <article key={item.id} className="rounded-xl border border-border-slate bg-white p-4">
                  <p className="text-xs font-semibold text-slate-500">
                    Q{i + 1} · {item.competency}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-navy">{item.text}</p>
                  <p className="mt-2 text-sm">
                    {chosen ? chosen.text : <span className="text-slate-400">Not answered</span>}{" "}
                    <Badge variant={correct ? "success" : "secondary"}>{correct ? `+${item.scoring.points}` : "0"}</Badge>
                  </p>
                </article>
              );
            }
            return (
              <WrittenAnswer
                key={item.id}
                index={i}
                item={item}
                text={answer?.text ?? ""}
                scored={attempt.writtenScores[item.id]}
                locked={!!score && score.outcome !== "awaiting_written_scoring"}
                onScore={(value, comment) =>
                  runAction(
                    () => scoreWrittenAnswer(organisationId, applicationId, item.id, value, comment, actor),
                    "Written answer scored.",
                  )
                }
              />
            );
          })}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Attempt events">
        <h2 className="font-bold text-navy">Attempt and technical events</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {[...attempt.events].reverse().map((e, i) => (
            <li key={`${e.type}-${e.at}-${i}`}>
              <span className="font-semibold text-navy">{EVENT_LABEL[e.type] ?? e.type}</span> · {formatDateTime(e.at)}
              {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WrittenAnswer({
  index,
  item,
  text,
  scored,
  locked,
  onScore,
}: {
  index: number;
  item: { id: string; text: string; competency: string; scoring: { rubric?: Array<{ score: number; descriptor: string }> } };
  text: string;
  scored?: { score: number; maxScore: number; scorer: string; at: string; comment?: string };
  locked: boolean;
  onScore: (score: number, comment: string) => boolean;
}) {
  const [value, setValue] = useState<number | null>(scored?.score ?? null);
  const [comment, setComment] = useState(scored?.comment ?? "");
  const rubric = item.scoring.rubric ?? [];
  return (
    <article className="rounded-xl border border-border-slate bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">
        Q{index + 1} · {item.competency} · written answer
      </p>
      <p className="mt-1 text-sm font-semibold text-navy">{item.text}</p>
      <blockquote className="mt-2 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-navy">
        {text.trim() || <span className="text-slate-400">No answer given (scores 0).</span>}
      </blockquote>
      {text.trim() ? (
        <fieldset className="mt-3 space-y-1" disabled={locked}>
          <legend className="text-xs font-bold text-navy">Score against the approved rubric</legend>
          {[{ score: 0, descriptor: "No relevant evidence in the answer." }, ...rubric].map((level) => (
            <label key={level.score} className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="radio"
                name={`score-${item.id}`}
                className="mt-1"
                checked={value === level.score}
                onChange={() => setValue(level.score)}
                aria-label={`Score ${level.score}`}
              />
              <span>
                <span className="font-bold text-navy">{level.score}</span> – {level.descriptor}
              </span>
            </label>
          ))}
          <label className="mt-2 block text-xs font-bold text-navy">
            Evidence for this score (optional)
            <Textarea className="mt-1 font-normal" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {!locked ? (
            <Button type="button" size="sm" className="mt-2" disabled={value === null} onClick={() => value !== null && onScore(value, comment)}>
              Save score
            </Button>
          ) : null}
        </fieldset>
      ) : null}
      {scored ? (
        <p className="mt-2 text-xs text-slate-500">
          Scored {scored.score}/{scored.maxScore} by {scored.scorer} · {formatDateTime(scored.at)}
          {scored.comment ? ` — "${scored.comment}"` : ""}
        </p>
      ) : null}
    </article>
  );
}
