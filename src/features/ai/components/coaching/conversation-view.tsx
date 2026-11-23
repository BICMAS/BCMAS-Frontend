"use client";

import type { CoachingConversation, CoachingSummary, CoachingTurnResult } from "@ai/contracts";
import Link from "next/link";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { newClientId } from "../../api";
import { useAiAction, useAiQuery } from "../../hooks/use-ai-query";
import { ChatComposer, ChatThread } from "../shared/chat";
import { AiDataRegion, AiDisclaimer, AiInlineError, StatusBadge } from "../shared/ai-states";
import { AI_COACH, CoachAvatar } from "./coach-avatar";
import { CoachStage, type CoachPresence } from "./coach-stage";
import { useCoachSpeech } from "./coach-voice";

export function ConversationView({ conversationId }: { conversationId: string }) {
  const conversation = useAiQuery((c) => c.getConversation(conversationId), [conversationId]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AiDataRegion {...conversation} onRetry={conversation.reload}>
        {(data) => <ConversationPanel initial={data} onChange={conversation.setData} />}
      </AiDataRegion>
    </div>
  );
}

function ConversationPanel({
  initial,
  onChange,
}: {
  initial: CoachingConversation;
  onChange: (c: CoachingConversation) => void;
}) {
  const [streaming, setStreaming] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<CoachingTurnResult | null>(null);
  const summary = useAiQuery((c) => c.getConversationSummary(initial.conversation_id), [initial.conversation_id], {
    enabled: initial.has_summary,
  });
  const send = useAiAction((c, text: string) =>
    c.sendConversationMessage(initial.conversation_id, text, newClientId(), (delta) =>
      setStreaming((current) => (current ?? "") + delta),
    ),
  );
  const end = useAiAction((c) => c.endConversation(initial.conversation_id));
  const ended = initial.status === "ended";
  const speech = useCoachSpeech();
  const [listening, setListening] = useState(false);
  const stopSpeech = speech.stop;
  const onListeningChange = useCallback(
    (on: boolean) => {
      setListening(on);
      if (on) stopSpeech(); // the coach stops talking when the employee starts
    },
    [stopSpeech],
  );
  const presence: CoachPresence = listening
    ? "listening"
    : send.pending && !streaming
      ? "thinking"
      : speech.speaking || (send.pending && streaming)
        ? "speaking"
        : "ready";

  async function onSend(text: string) {
    speech.stop();
    setStreaming("");
    const result = await send.run(text);
    setStreaming(null);
    if (!result) return false;
    if (speech.enabled) speech.speak(result.assistant_message.text);
    setLastTurn(result);
    onChange({
      ...initial,
      messages: [...initial.messages, result.user_message, result.assistant_message],
      turn_count: initial.turn_count + 1,
      stage: result.coaching.stage,
      status: result.conversation_status,
    });
    return true;
  }

  async function onEnd() {
    const result = await end.run();
    if (result) {
      summary.setData(result);
      onChange({ ...initial, status: "ended", has_summary: true });
    }
  }

  return (
    <>
      <PageHeader
        title={initial.topic ?? `${initial.mode.replace(/_/g, " ")} coaching`}
        description="Your coach asks questions to help you think it through. Your conversation is private to you."
        breadcrumbs={
          <Link href="/ai/coaching" className="text-xs font-bold text-slate-500 hover:underline">
            ← AI Coaching
          </Link>
        }
        actions={
          <>
            <StatusBadge status={initial.status} />
            {!ended ? (
              <Button type="button" variant="secondary" disabled={end.pending || initial.messages.length < 2} onClick={onEnd}>
                {end.pending ? "Summarising…" : "End & summarise"}
              </Button>
            ) : null}
          </>
        }
      />
      <CoachStage name={AI_COACH.name} role={AI_COACH.role} presence={presence} voice={speech} />
      <ChatThread
        messages={initial.messages}
        streaming={streaming}
        assistantLabel={AI_COACH.name}
        assistantAvatar={<CoachAvatar name={AI_COACH.name} size={32} />}
        onListen={speech.supported ? speech.speak : undefined}
      />
      {lastTurn && !ended ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Stage: {lastTurn.coaching.stage.replace(/_/g, " ")}</span>
          <span>· {lastTurn.turns_remaining} turns left</span>
          {lastTurn.suggested_actions.map((a) => (
            <Link key={a.label} href={a.type === "open_scenario" ? "/ai/coaching" : "/ai/plans"} className="font-bold text-navy hover:underline">
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
      <AiInlineError error={send.error ?? end.error} />
      {!ended ? (
        <ChatComposer
          onSend={onSend}
          disabled={send.pending}
          voiceInput
          onListeningChange={onListeningChange}
        />
      ) : null}
      {ended ? (
        <AiDataRegion {...summary} onRetry={summary.reload}>
          {(s) => <SummaryCard summary={s} />}
        </AiDataRegion>
      ) : null}
    </>
  );
}

export function SummaryCard({ summary }: { summary: CoachingSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-navy">Session summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-navy">{summary.summary}</p>
        {summary.key_themes.length ? (
          <div>
            <h4 className="font-bold text-navy">Key themes</h4>
            <ul className="mt-1 list-disc pl-5 text-slate-600">
              {summary.key_themes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {summary.agreed_actions.length ? (
          <div>
            <h4 className="font-bold text-navy">Agreed actions</h4>
            <ul className="mt-1 space-y-1 text-slate-600">
              {summary.agreed_actions.map((a) => (
                <li key={a.action}>
                  <span className="font-semibold text-navy">{a.action}</span> · {a.timeframe} · {a.success_measure}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {summary.learning_recommendations.length ? (
          <div>
            <h4 className="font-bold text-navy">Suggested learning</h4>
            <ul className="mt-1 space-y-1 text-slate-600">
              {summary.learning_recommendations.map((l) => (
                <li key={l.catalogue_item_id}>
                  {l.title} — {l.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link href="/ai/plans" className={buttonVariants({ size: "sm", variant: "secondary" })}>
          Turn this into a development plan
        </Link>
        <AiDisclaimer>{summary.disclaimer}</AiDisclaimer>
      </CardContent>
    </Card>
  );
}
