"use client";

import { SparklesIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiDisclaimer, AiInlineError } from "@/features/ai/components/shared/ai-states";
import { useAiAction } from "@/features/ai/hooks/use-ai-query";

import {
  confirmInterviewScores,
  hrInterviewView,
  interviewLink,
  interviewScoringRequest,
  saveInterviewSuggestion,
} from "../services/interview";
import { formatDateTime, runAction } from "./recruitment-shared";

const EVENT_LABEL: Record<string, string> = {
  invited: "Invitation sent",
  resent: "Invitation resent (new link)",
  consented: "Consent given",
  consent_declined: "Asked for an alternative",
  equipment_checked: "Equipment checked",
  started: "Started",
  resumed: "Resumed",
  question_repeated: "Question repeated",
  technical_issue: "Technical problem reported",
  reschedule_requested: "Reschedule requested",
  submitted: "Interview completed",
};

/** HR's view of the AI-avatar interview: status and events, then AI-suggested, person-confirmed scores. */
export function InterviewResults({
  organisationId,
  applicationId,
  actor,
}: {
  organisationId: string;
  applicationId: string;
  actor: string;
}) {
  const view = hrInterviewView(organisationId, applicationId);
  const suggest = useAiAction((client, request: Parameters<typeof client.scoreInterview>[0]) => client.scoreInterview(request));
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  if (!view) {
    return (
      <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">
        Not invited yet. Candidates who meet the approved assessment threshold can be invited to the AI-avatar interview.
      </p>
    );
  }
  const { session, set } = view;
  const ai = session.aiSuggestion;
  const final = session.score;
  const needsHelp = session.events.some((e) => e.type === "reschedule_requested" || e.type === "consent_declined" || e.type === "technical_issue");
  const chosen = (id: string) => choices[id] ?? session.confirmedScores[id]?.score ?? ai?.scores[id]?.score;

  async function runSuggestion() {
    const result = await suggest.run(interviewScoringRequest(organisationId, applicationId));
    if (result) runAction(() => saveInterviewSuggestion(organisationId, applicationId, result, actor), "AI score suggestions ready to review.");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-navy">
              {session.questionSetName} v{session.questionSetVersion}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Invited {formatDateTime(session.invitedAt)} · link expires {formatDateTime(session.expiresAt)} · threshold snapshot v
              {session.thresholdSnapshotVersion}
              {session.answerMode ? ` · answered by ${session.answerMode === "voice" ? "voice" : "typing"}` : ""}
            </p>
          </div>
          <Badge variant={session.status === "submitted" ? "success" : session.status === "expired" ? "warning" : "info"}>
            {session.status === "in_progress" ? "In progress" : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
          </Badge>
        </div>
        {needsHelp && session.status !== "submitted" ? (
          <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            The candidate reported a problem or asked for an alternative (see events). Contact them, and use Resend Interview Invitation
            to give them a fresh link.
          </p>
        ) : null}
        {session.status !== "submitted" ? (
          <p className="mt-3 text-xs text-slate-500">
            Candidate link:{" "}
            <a href={interviewLink(session.token)} target="_blank" rel="noreferrer" className="font-mono text-navy underline">
              {interviewLink(session.token)}
            </a>
            . Answers are visible after the candidate completes the interview.
          </p>
        ) : null}
      </section>

      {final ? (
        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm" aria-label="Interview result">
          <h2 className="font-bold text-navy">Interview result</h2>
          <p className="mt-2 text-sm text-navy">
            <Badge variant={final.outcome === "passed" ? "success" : "error"}>
              {final.outcome === "passed" ? "Met the threshold" : "Below the threshold"}
            </Badge>{" "}
            {final.reason}
          </p>
        </section>
      ) : null}

      {session.status === "submitted" && set ? (
        <section className="space-y-3" aria-label="Interview answers">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-navy">Answers and scores</h2>
            {!final ? (
              <Button type="button" variant="secondary" disabled={suggest.pending} onClick={runSuggestion}>
                <SparklesIcon aria-hidden />
                {suggest.pending ? "Scoring…" : ai ? "Re-run AI scoring" : "Run AI scoring"}
              </Button>
            ) : null}
          </div>
          <AiInlineError error={suggest.error} />
          {ai ? (
            <p className="text-xs text-slate-500">
              AI suggestions by {ai.model} ({ai.promptVersion}), {formatDateTime(ai.generatedAt)}. {ai.summary}
            </p>
          ) : null}
          {set.items.map((item, i) => {
            const answer = session.answers[item.id];
            const suggestion = ai?.scores[item.id];
            const levels = [{ score: 0, descriptor: "No relevant evidence in the answer." }, ...(item.scoring.rubric ?? [])];
            return (
              <article key={item.id} className="rounded-xl border border-border-slate bg-white p-4">
                <p className="text-xs font-semibold text-slate-500">
                  Q{i + 1} · {item.competency}
                  {answer?.repeats ? ` · repeated ${answer.repeats}×` : ""}
                </p>
                <p className="mt-1 text-sm font-semibold text-navy">{item.text}</p>
                <blockquote className="mt-2 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-navy">
                  {answer?.text.trim() || <span className="text-slate-400">No answer given.</span>}
                </blockquote>
                {suggestion ? (
                  <div className="mt-2 rounded-lg border border-info/30 bg-info-soft p-3 text-xs text-info-soft-foreground">
                    <p className="font-semibold">
                      AI suggests {suggestion.score}/{suggestion.maxScore} · {suggestion.confidence} confidence
                    </p>
                    <p className="mt-1">{suggestion.rationale}</p>
                    {suggestion.evidence.map((q) => (
                      <p key={q} className="mt-1 italic">“{q}”</p>
                    ))}
                  </div>
                ) : null}
                <fieldset className="mt-3 space-y-1" disabled={!!final}>
                  <legend className="text-xs font-bold text-navy">Confirmed score</legend>
                  {levels.map((level) => (
                    <label key={level.score} className="flex items-start gap-2 text-sm text-slate-600">
                      <input
                        type="radio"
                        name={`interview-${item.id}`}
                        className="mt-1"
                        checked={chosen(item.id) === level.score}
                        onChange={() => setChoices((c) => ({ ...c, [item.id]: level.score }))}
                        aria-label={`Q${i + 1} score ${level.score}`}
                      />
                      <span>
                        <span className="font-bold text-navy">{level.score}</span> – {level.descriptor}
                      </span>
                    </label>
                  ))}
                  {!final ? (
                    <Textarea
                      className="mt-1"
                      rows={2}
                      aria-label={`Q${i + 1} note`}
                      placeholder="Why this score (optional)"
                      value={comments[item.id] ?? ""}
                      onChange={(e) => setComments((c) => ({ ...c, [item.id]: e.target.value }))}
                    />
                  ) : session.confirmedScores[item.id] ? (
                    <p className="text-xs text-slate-500">
                      Confirmed by {session.confirmedScores[item.id]!.scorer} · {formatDateTime(session.confirmedScores[item.id]!.at)}
                      {session.confirmedScores[item.id]!.comment ? ` — "${session.confirmedScores[item.id]!.comment}"` : ""}
                    </p>
                  ) : null}
                </fieldset>
              </article>
            );
          })}
          {!final ? (
            <Button
              type="button"
              variant="accent"
              disabled={set.items.some((item) => chosen(item.id) === undefined)}
              onClick={() =>
                runAction(
                  () =>
                    confirmInterviewScores(
                      organisationId,
                      applicationId,
                      Object.fromEntries(set.items.map((item) => [item.id, { score: chosen(item.id)!, comment: comments[item.id] }])),
                      actor,
                    ),
                  "Interview scores confirmed.",
                )
              }
            >
              Confirm scores
            </Button>
          ) : null}
          <AiDisclaimer>
            Only the content of answers is scored, against the approved rubric. Appearance, accent, way of speaking and expression are
            never assessed, and every score is confirmed by a person.
          </AiDisclaimer>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Interview events">
        <h2 className="font-bold text-navy">Consent and technical events</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {[...session.events].reverse().map((e, i) => (
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
