"use client";

import type {
  CoachSessionSummary,
  CoachingConversation,
  CoachingSummary,
  SessionEvaluation,
} from "@ai/contracts";
import { ArrowRightIcon, LightbulbIcon, SparklesIcon, TrendingUpIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useAiAction, useAiQuery } from "../../hooks/use-ai-query";
import { AiDataRegion, AiDisclaimer, AiInlineError } from "../shared/ai-states";
import { AI_COACH, CoachAvatar } from "./coach-avatar";

const TREND_SIZE = 5;
const INSIGHT_LIMIT = 5;
const DISCLAIMER =
  "AI coaching results provide development insights. They do not constitute formal capability verification or competency sign-off.";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Scored role-play sessions in date order (oldest first), latest five. */
export function trendPoints(sessions: CoachSessionSummary[]) {
  return sessions
    .filter((s): s is CoachSessionSummary & { practice_score: number } => s.practice_score !== null)
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .slice(-TREND_SIZE);
}

/** The coach greets the employee by name, so the page opens like a conversation. */
export function CoachWelcome({ firstName }: { firstName?: string }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-border-slate bg-white p-6 shadow-sm sm:flex-row">
      <CoachAvatar name={AI_COACH.name} size={72} />
      <div className="text-center sm:text-left">
        <p className="text-lg font-bold text-navy">
          Hi{firstName ? ` ${firstName}` : ""}, I&apos;m {AI_COACH.name}.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          I&apos;m your AI development coach. Talk a challenge through with me, or practise a real workplace
          conversation in role-play. Turn on my voice in a session to hear me speak, and use the microphone to
          reply out loud.
        </p>
      </div>
    </section>
  );
}

export function NextActionCard() {
  const router = useRouter();
  const recommended = useAiQuery((c) => c.recommendedScenarios(), []);
  const start = useAiAction((c, scenarioId: string) => c.startSession(scenarioId));
  const next = recommended.data?.recommendations[0];
  if (!next) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-navy p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <SparklesIcon className="size-5 text-green-lime" aria-hidden />
        </span>
        <div>
          <p className="text-[10px] font-bold tracking-widest text-white/60 uppercase">Recommended next action</p>
          <h2 className="mt-1 font-bold">Practise: {next.scenario.title}</h2>
          <p className="mt-1 text-sm text-white/70">
            {next.reason} {next.scenario.estimated_minutes} min role-play with {next.scenario.persona.name},{" "}
            {next.scenario.persona.role}.
          </p>
          <AiInlineError error={start.error} />
        </div>
      </div>
      <Button
        type="button"
        variant="accent"
        className="shrink-0 rounded-xl"
        disabled={start.pending}
        onClick={async () => {
          const session = await start.run(next.scenario.scenario_id);
          if (session) router.push(`/ai/coaching/sessions/${session.session_id}`);
        }}
      >
        {start.pending ? "Starting…" : "Start role-play"}
        <ArrowRightIcon className="size-3.5" aria-hidden />
      </Button>
    </section>
  );
}

export function ImpactTrend() {
  const sessions = useAiQuery((c) => c.listSessions(), []);
  return (
    <section className="rounded-2xl border border-dashed border-border-slate bg-white p-6">
      <AiDataRegion {...sessions} onRetry={sessions.reload}>
        {(list) => {
          const points = trendPoints(list);
          const first = points[0];
          const last = points[points.length - 1];
          const change = first && last && points.length > 1 ? last.practice_score - first.practice_score : null;
          return (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-navy">Coaching Impact Trend</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {points.length
                      ? `Practice score in your last ${points.length} role-play sessions. Select a session to see its feedback.`
                      : "Your practice scores appear here after you finish a role-play session."}
                  </p>
                </div>
                {change !== null ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                      change >= 0 ? "bg-green-50 text-green-deep" : "bg-amber-50 text-amber-700",
                    )}
                  >
                    <TrendingUpIcon className="size-3.5" aria-hidden />
                    {change >= 0 ? "+" : ""}
                    {change} pts since {shortDate(first!.started_at)}
                  </span>
                ) : null}
              </div>
              {points.length ? (
                <ol
                  aria-label="Practice score by session"
                  className="mt-6 grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
                >
                  {points.map((point) => (
                    <li key={point.session_id}>
                      <Link
                        href={`/ai/coaching/sessions/${point.session_id}`}
                        className="group block rounded-lg p-1 hover:bg-slate-50"
                        title={`${point.title} · ${shortDate(point.started_at)} · ${point.practice_score}%`}
                      >
                        <p className="mb-1 text-center text-xs font-bold text-navy">{point.practice_score}%</p>
                        <div className="flex h-24 items-end">
                          <div
                            className="w-full rounded-t bg-green-lime transition-colors group-hover:bg-green-deep"
                            style={{ height: `${point.practice_score}%` }}
                          />
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-tight font-bold text-navy">{point.title}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{shortDate(point.started_at)}</p>
                        <p className="truncate text-[10px] text-slate-500">
                          {point.target_skills.map((t) => t.skill_name).join(", ")}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : null}
              <p className="mt-4 text-xs leading-relaxed text-slate-500">{DISCLAIMER}</p>
            </>
          );
        }}
      </AiDataRegion>
    </section>
  );
}

type Insights = {
  roleplays: Array<{ session: CoachSessionSummary; evaluation: SessionEvaluation }>;
  conversations: Array<{ conversation: CoachingConversation; summary: CoachingSummary }>;
};

export function CoachingInsightsPanel() {
  const insights = useAiQuery<Insights>(async (c) => {
    const [sessions, conversations] = await Promise.all([c.listSessions(), c.listConversations()]);
    const evaluated = sessions
      .filter((s) => s.evaluation_status === "ready")
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, INSIGHT_LIMIT);
    const summarised = conversations
      .filter((cv) => cv.has_summary)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, INSIGHT_LIMIT);
    // One failed lookup should not hide the rest of the insights.
    const [roleplays, summaries] = await Promise.all([
      Promise.all(
        evaluated.map((session) =>
          c.getEvaluation(session.session_id).then(
            (evaluation) => ({ session, evaluation }),
            () => null,
          ),
        ),
      ),
      Promise.all(
        summarised.map((conversation) =>
          c.getConversationSummary(conversation.conversation_id).then(
            (summary) => ({ conversation, summary }),
            () => null,
          ),
        ),
      ),
    ]);
    return {
      roleplays: roleplays.filter((r) => r !== null),
      conversations: summaries.filter((s) => s !== null),
    };
  }, []);

  return (
    <AiDataRegion
      {...insights}
      onRetry={insights.reload}
      isEmpty={(i) => i.roleplays.length === 0 && i.conversations.length === 0}
      empty={{
        title: "No coaching insights yet",
        description: "Finish a role-play or end a coaching conversation to see feedback and agreed actions here.",
        icon: LightbulbIcon,
      }}
    >
      {(data) => (
        <div className="space-y-8">
          {data.roleplays.length ? (
            <section className="space-y-4">
              <h3 className="font-bold text-navy">Role-play feedback</h3>
              {data.roleplays.map(({ session, evaluation }) => (
                <article key={session.session_id} className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-navy">{session.title}</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        {shortDate(session.started_at)} · with {session.persona.name}, {session.persona.role}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-navy">{evaluation.overall_practice_score}%</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-green-50 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-green-deep">
                        <TrendingUpIcon className="size-3.5" aria-hidden />
                        Strengths
                      </p>
                      {evaluation.strengths.length ? (
                        <ul className="mt-2 space-y-1 text-sm text-navy">
                          {evaluation.strengths.slice(0, 2).map((s) => (
                            <li key={s.text}>{s.text}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">No strengths recorded for this session.</p>
                      )}
                    </div>
                    <div className="rounded-xl bg-amber-50 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <LightbulbIcon className="size-3.5" aria-hidden />
                        To work on
                      </p>
                      {evaluation.growth_areas.length ? (
                        <ul className="mt-2 space-y-1 text-sm text-navy">
                          {evaluation.growth_areas.slice(0, 2).map((g) => (
                            <li key={g.text}>
                              {g.text} <span className="text-slate-600">Tip: {g.tip}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">No growth areas recorded for this session.</p>
                      )}
                    </div>
                  </div>
                  {evaluation.next_steps[0] ? (
                    <p className="mt-3 text-sm text-slate-600">
                      <span className="font-bold text-navy">Next step:</span> {evaluation.next_steps[0].title}.{" "}
                      {evaluation.next_steps[0].reason}
                    </p>
                  ) : null}
                  <Link
                    href={`/ai/coaching/sessions/${session.session_id}`}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-navy hover:underline"
                  >
                    View full feedback
                    <ArrowRightIcon className="size-3" aria-hidden />
                  </Link>
                </article>
              ))}
            </section>
          ) : null}

          {data.conversations.length ? (
            <section className="space-y-4">
              <h3 className="font-bold text-navy">Coaching conversation takeaways</h3>
              {data.conversations.map(({ conversation, summary }) => (
                <article
                  key={conversation.conversation_id}
                  className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <CoachAvatar name={AI_COACH.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-navy">
                        {conversation.topic ?? `${conversation.mode.replace(/_/g, " ")} coaching`}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">{shortDate(conversation.created_at)}</p>
                      <p className="mt-3 text-sm text-navy">{summary.summary}</p>
                      {summary.key_themes.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {summary.key_themes.map((theme) => (
                            <span key={theme} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                              {theme}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {summary.agreed_actions.length ? (
                        <div className="mt-3">
                          <p className="text-xs font-bold text-navy">Agreed actions</p>
                          <ul className="mt-1 space-y-1 text-sm text-slate-600">
                            {summary.agreed_actions.map((a) => (
                              <li key={a.action}>
                                <span className="font-semibold text-navy">{a.action}</span> · {a.timeframe}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <Link
                        href={`/ai/coaching/conversations/${conversation.conversation_id}`}
                        className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-navy hover:underline"
                      >
                        Open conversation
                        <ArrowRightIcon className="size-3" aria-hidden />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
          <AiDisclaimer>{DISCLAIMER}</AiDisclaimer>
        </div>
      )}
    </AiDataRegion>
  );
}
