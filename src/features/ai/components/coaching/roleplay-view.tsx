"use client";

import type { CoachSession, SessionEvaluation } from "@ai/contracts";
import { TimerIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { newClientId } from "../../api";
import { useAiAction, useAiQuery } from "../../hooks/use-ai-query";
import { ChatComposer, ChatThread } from "../shared/chat";
import { AiDataRegion, AiDisclaimer, AiInlineError, StatusBadge } from "../shared/ai-states";

export function RoleplayView({ sessionId }: { sessionId: string }) {
  const session = useAiQuery((c) => c.getSession(sessionId), [sessionId]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AiDataRegion {...session} onRetry={session.reload}>
        {(data) => <RoleplayPanel initial={data} onChange={session.setData} />}
      </AiDataRegion>
    </div>
  );
}

function RoleplayPanel({ initial, onChange }: { initial: CoachSession; onChange: (s: CoachSession) => void }) {
  const [streaming, setStreaming] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [suggestEnd, setSuggestEnd] = useState(false);
  const evaluation = useAiQuery((c) => c.getEvaluation(initial.session_id), [initial.session_id], {
    enabled: initial.evaluation_status === "ready",
  });
  const send = useAiAction((c, text: string) =>
    c.sendSessionMessage(initial.session_id, text, newClientId(), (delta) => setStreaming((cur) => (cur ?? "") + delta)),
  );
  const end = useAiAction((c) => c.endSession(initial.session_id));
  const active = initial.status === "active";

  async function onSend(text: string) {
    setStreaming("");
    const result = await send.run(text);
    setStreaming(null);
    if (!result) return false;
    setRemaining(result.remaining_s);
    setSuggestEnd(result.suggest_end);
    onChange({ ...initial, messages: [...initial.messages, result.user_message, result.coach_message], status: result.session_status });
    return true;
  }

  async function onEnd() {
    const result = await end.run();
    if (result) {
      evaluation.setData(result);
      onChange({ ...initial, status: "evaluated", evaluation_status: "ready" });
    }
  }

  return (
    <>
      <PageHeader
        title={initial.title}
        description={`Role-play with ${initial.persona.name}, ${initial.persona.role}. Stay in the conversation as you would at work.`}
        breadcrumbs={
          <Link href="/ai/coaching" className="text-xs font-bold text-slate-500 hover:underline">
            ← AI Coaching
          </Link>
        }
        actions={
          <>
            <StatusBadge status={initial.status} />
            {active ? (
              <Button type="button" variant="secondary" disabled={end.pending} onClick={onEnd}>
                {end.pending ? "Evaluating…" : "End & get feedback"}
              </Button>
            ) : null}
          </>
        }
      />
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        {initial.target_skills.map((t) => (
          <span key={t.skill_id} className="rounded-full bg-slate-100 px-3 py-1">
            Practising {t.skill_name} (level {t.target_level})
          </span>
        ))}
        {remaining !== null && active ? (
          <span className="flex items-center gap-1">
            <TimerIcon className="size-3.5" aria-hidden /> {Math.ceil(remaining / 60)} min left
          </span>
        ) : null}
      </div>
      <ChatThread messages={initial.messages} streaming={streaming} assistantLabel={initial.persona.name} />
      {suggestEnd && active ? (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-sm text-info-soft-foreground">
          The conversation has reached a natural end. End the session to get your feedback.
        </p>
      ) : null}
      <AiInlineError error={send.error ?? end.error} />
      {active ? <ChatComposer onSend={onSend} disabled={send.pending} placeholder="Your response…" /> : null}
      {!active ? (
        <AiDataRegion {...evaluation} onRetry={evaluation.reload}>
          {(e) => <EvaluationCard evaluation={e} />}
        </AiDataRegion>
      ) : null}
    </>
  );
}

export function EvaluationCard({ evaluation }: { evaluation: SessionEvaluation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-navy">
          Practice feedback
          <span className="text-2xl font-bold">{evaluation.overall_practice_score}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section>
          <h4 className="font-bold text-navy">Skills observed</h4>
          <ul className="mt-2 space-y-2">
            {evaluation.skill_observations.map((o) => (
              <li key={o.skill_id} className="rounded-lg border border-border-slate p-3">
                <p className="font-semibold text-navy">
                  {o.skill_name}: {o.observed_level === null ? "not enough evidence" : `practice level ${o.observed_level}`} (target{" "}
                  {o.target_level})
                </p>
                {o.evidence.map((q) => (
                  <blockquote key={q.message_id + q.quote} className="mt-1 border-l-2 border-green-lime pl-2 text-slate-600 italic">
                    “{q.quote}”
                  </blockquote>
                ))}
              </li>
            ))}
          </ul>
        </section>
        {evaluation.strengths.length ? (
          <section>
            <h4 className="font-bold text-navy">Strengths</h4>
            <ul className="mt-1 list-disc pl-5 text-slate-600">
              {evaluation.strengths.map((s) => (
                <li key={s.text}>{s.text}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {evaluation.growth_areas.length ? (
          <section>
            <h4 className="font-bold text-navy">To work on</h4>
            <ul className="mt-1 space-y-1 text-slate-600">
              {evaluation.growth_areas.map((g) => (
                <li key={g.text}>
                  {g.text} <span className="text-navy">Tip: {g.tip}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {evaluation.next_steps.length ? (
          <section>
            <h4 className="font-bold text-navy">Next steps</h4>
            <ul className="mt-1 space-y-1 text-slate-600">
              {evaluation.next_steps.map((n) => (
                <li key={n.ref_id}>
                  {n.title} — {n.reason}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <AiDisclaimer>{evaluation.disclaimer}</AiDisclaimer>
      </CardContent>
    </Card>
  );
}
