"use client";

import type { ConversationMode, ModeInfo } from "@ai/contracts";
import { MessageSquareTextIcon, TheaterIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useAi } from "../../hooks/ai-client-context";
import { useAiAction, useAiQuery } from "../../hooks/use-ai-query";
import { AiDataRegion, AiDisclaimer, AiInlineError, MockModeBanner, StatusBadge } from "../shared/ai-states";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function CoachingHubView() {
  const { client } = useAi();
  const metrics = useAiQuery((c) => c.getCoachMetrics(), []);
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="AI Coaching"
        description="Guided coaching conversations and realistic role-play practice. The coach asks questions to help you find your own way forward; practice never changes your verified levels."
      />
      <MockModeBanner mode={client.mode} />
      {metrics.data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Practice sessions" value={String(metrics.data.total_sessions)} />
          <StatCard label="This month" value={String(metrics.data.sessions_this_month)} />
          <StatCard label="Skills practised" value={String(metrics.data.skills_targeted)} />
          <StatCard
            label="Avg. practice score"
            value={metrics.data.average_practice_score === null ? "—" : `${metrics.data.average_practice_score}%`}
          />
        </div>
      ) : null}
      <Tabs defaultValue="conversations">
        <TabsList>
          <TabsTrigger value="conversations">Coaching conversations</TabsTrigger>
          <TabsTrigger value="roleplay">Interactive role-play</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="mt-6">
          <ModesPanel />
        </TabsContent>
        <TabsContent value="roleplay" className="mt-6">
          <ScenariosPanel />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ModesPanel() {
  const router = useRouter();
  const modes = useAiQuery((c) => c.listModes(), []);
  const [selected, setSelected] = useState<ModeInfo | null>(null);
  const [topic, setTopic] = useState("");
  const [useMemory, setUseMemory] = useState(true);
  const start = useAiAction((c, mode: ConversationMode) =>
    c.startConversation({ mode, topic: topic.trim() || null, use_memory: useMemory }),
  );

  return (
    <AiDataRegion {...modes} onRetry={modes.reload}>
      {(list) => (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {list
              .filter((m) => m.interaction === "conversation")
              .map((mode) => (
                <button
                  key={mode.mode}
                  type="button"
                  aria-pressed={selected?.mode === mode.mode}
                  onClick={() => setSelected(mode)}
                  className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition ${
                    selected?.mode === mode.mode ? "border-navy ring-2 ring-navy/20" : "border-border-slate hover:border-navy/40"
                  }`}
                >
                  <MessageSquareTextIcon className="mb-2 size-4 text-blue-600" aria-hidden />
                  <p className="font-bold text-navy">{mode.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{mode.description}</p>
                  <p className="mt-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">{mode.method}</p>
                </button>
              ))}
          </div>
          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-navy">Start {selected.title.toLowerCase()}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="coach-topic">What would you like to talk about? (optional)</Label>
                  <Input id="coach-topic" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-navy">
                  <Checkbox checked={useMemory} onCheckedChange={(value) => setUseMemory(value === true)} />
                  Let the coach remember goals and preferences from this conversation
                </label>
                <AiInlineError error={start.error} />
                <Button
                  type="button"
                  disabled={start.pending}
                  onClick={async () => {
                    const conversation = await start.run(selected.mode as ConversationMode);
                    if (conversation) router.push(`/ai/coaching/conversations/${conversation.conversation_id}`);
                  }}
                >
                  {start.pending ? "Starting…" : "Start conversation"}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </AiDataRegion>
  );
}

function ScenariosPanel() {
  const router = useRouter();
  const recommended = useAiQuery((c) => c.recommendedScenarios(), []);
  const all = useAiQuery((c) => c.listScenarios(), []);
  const start = useAiAction((c, scenarioId: string) => c.startSession(scenarioId));

  async function launch(scenarioId: string) {
    const session = await start.run(scenarioId);
    if (session) router.push(`/ai/coaching/sessions/${session.session_id}`);
  }

  return (
    <div className="space-y-6">
      <AiInlineError error={start.error} />
      <section className="space-y-3">
        <h3 className="font-bold text-navy">Recommended for your gaps</h3>
        <AiDataRegion
          {...recommended}
          onRetry={recommended.reload}
          isEmpty={(r) => r.recommendations.length === 0}
          empty={{ title: "No recommendations yet", description: "Browse all scenarios below.", icon: TheaterIcon }}
        >
          {(r) => (
            <div className="grid gap-4 md:grid-cols-2">
              {r.recommendations.map((rec) => (
                <article key={rec.scenario.scenario_id} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
                  <p className="font-bold text-navy">{rec.scenario.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{rec.reason}</p>
                  <p className="mt-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                    {rec.scenario.estimated_minutes} min · {rec.scenario.difficulty} · with {rec.scenario.persona.role}
                  </p>
                  <Button type="button" size="sm" className="mt-4" disabled={start.pending} onClick={() => launch(rec.scenario.scenario_id)}>
                    Start role-play
                  </Button>
                </article>
              ))}
            </div>
          )}
        </AiDataRegion>
      </section>
      <section className="space-y-3">
        <h3 className="font-bold text-navy">All scenarios</h3>
        <AiDataRegion
          {...all}
          onRetry={all.reload}
          isEmpty={(list) => list.length === 0}
          empty={{ title: "No published scenarios", description: "Your L&D team publishes role-play scenarios here." }}
        >
          {(list) => (
            <ul className="divide-y divide-border-slate rounded-xl border border-border-slate bg-white">
              {list.map((s) => (
                <li key={s.scenario_id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold text-navy">{s.title}</p>
                    <p className="text-sm text-slate-500">{s.description}</p>
                  </div>
                  <Button type="button" size="sm" variant="secondary" disabled={start.pending} onClick={() => launch(s.scenario_id)}>
                    Start
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </AiDataRegion>
      </section>
    </div>
  );
}

function HistoryPanel() {
  const conversations = useAiQuery((c) => c.listConversations(), []);
  const sessions = useAiQuery((c) => c.listSessions(), []);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-navy">Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <AiDataRegion
            {...conversations}
            onRetry={conversations.reload}
            isEmpty={(list) => list.length === 0}
            empty={{ title: "No conversations yet", description: "Start one from Coaching conversations." }}
          >
            {(list) => (
              <ul className="space-y-2">
                {list.map((c) => (
                  <li key={c.conversation_id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/ai/coaching/conversations/${c.conversation_id}`} className="font-semibold text-navy hover:underline">
                      {c.topic ?? c.mode.replace(/_/g, " ")} · {formatDate(c.created_at)}
                    </Link>
                    <StatusBadge status={c.status} label={c.has_summary ? "summary ready" : undefined} />
                  </li>
                ))}
              </ul>
            )}
          </AiDataRegion>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-navy">Role-play sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <AiDataRegion
            {...sessions}
            onRetry={sessions.reload}
            isEmpty={(list) => list.length === 0}
            empty={{ title: "No role-play sessions yet", description: "Start one from Interactive role-play." }}
          >
            {(list) => (
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.session_id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/ai/coaching/sessions/${s.session_id}`} className="font-semibold text-navy hover:underline">
                      {s.title} · {formatDate(s.started_at)}
                    </Link>
                    <span className="flex items-center gap-2">
                      {s.practice_score !== null ? <span className="font-bold text-navy">{s.practice_score}%</span> : null}
                      <StatusBadge status={s.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AiDataRegion>
          <div className="mt-4">
            <AiDisclaimer>Practice scores are feedback for you; they are not capability verification.</AiDisclaimer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
