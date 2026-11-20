"use client";

import type { AgentSummary, ExecutionRecord, Suggestion, WorkflowRecord, WorkflowType } from "@ai/contracts";
import { BotIcon, ClipboardCheckIcon, GraduationCapIcon, SparklesIcon, WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { newClientId } from "../../api";
import { useAi } from "../../hooks/ai-client-context";
import { useAiAction, useAiQuery } from "../../hooks/use-ai-query";
import { CompetencyChart } from "../shared/competency-chart";
import { AiDataRegion, AiDisclaimer, AiInlineError, MockModeBanner, StatusBadge } from "../shared/ai-states";

const AGENT_LINKS: Record<AgentSummary["name"], { href: string; icon: typeof BotIcon; label: string }> = {
  coaching: { href: "/ai/coaching", icon: BotIcon, label: "Open coaching" },
  dev_plan: { href: "/ai/plans", icon: GraduationCapIcon, label: "Open training plans" },
  talent_assessment: { href: "/ai/assessments", icon: ClipboardCheckIcon, label: "Open assessments" },
};

export function AiCentreView() {
  const { client, identity } = useAi();
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="AI Capability Centre"
        description="One place for the AI coaching, training-plan and talent-assessment agents: ask a question, pick an agent, act on recommendations and follow what the agents are doing."
      />
      <MockModeBanner mode={client.mode} />
      <AskPanel />
      <AgentsPanel />
      <div className="grid gap-6 lg:grid-cols-2">
        <SuggestionsPanel />
        {identity.employee_id ? <InsightsPanel employeeId={identity.employee_id} /> : null}
      </div>
      <ActivityPanel />
    </div>
  );
}

function AskPanel() {
  const [message, setMessage] = useState("");
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const ask = useAiAction((client, text: string) => client.runOrchestration({ message: text }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    const result = await ask.run(message.trim());
    if (result) setRecord(result);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-navy">
          <SparklesIcon className="size-4 text-blue-600" aria-hidden /> Ask the AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="space-y-3">
          <Textarea
            aria-label="What do you need help with?"
            placeholder="e.g. Which skills should I develop next for my role?"
            value={message}
            maxLength={2000}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={ask.pending || !message.trim()}>
              {ask.pending ? "Working…" : "Ask"}
            </Button>
            <span className="text-xs text-slate-500">The orchestrator picks the right agent and checks your access.</span>
          </div>
        </form>
        <AiInlineError error={ask.error} />
        {record ? <ExecutionSummary record={record} /> : null}
      </CardContent>
    </Card>
  );
}

export function ExecutionSummary({ record }: { record: ExecutionRecord }) {
  return (
    <section aria-label="Execution status" className="space-y-3 rounded-xl border border-border-slate p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={record.status} />
        {record.routing ? <span className="text-xs text-slate-500">Routed by {record.routing.method}</span> : null}
      </div>
      {record.clarification ? <p className="text-sm text-navy">{record.clarification}</p> : null}
      <ol className="space-y-2">
        {record.steps.map((step) => (
          <li key={step.step_id} className="flex items-start justify-between gap-3 text-sm">
            <div>
              <p className="font-semibold text-navy">{step.capability}</p>
              <p className="text-slate-500">{step.error?.message ?? step.summary ?? "—"}</p>
            </div>
            <StatusBadge status={step.status} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AgentsPanel() {
  const agents = useAiQuery((client) => client.listAgents(), []);
  return (
    <section aria-labelledby="agents-heading" className="space-y-4">
      <h2 id="agents-heading" className="text-lg font-bold text-navy">
        Choose an agent
      </h2>
      <AiDataRegion
        {...agents}
        onRetry={agents.reload}
        isEmpty={(list) => list.length === 0}
        empty={{ title: "No AI agents are available to you", description: "Ask your administrator about AI access." }}
      >
        {(list) => (
          <div className="grid gap-4 md:grid-cols-3">
            {list.map((agent) => {
              const link = AGENT_LINKS[agent.name];
              const available = agent.capabilities.filter((c) => c.availability !== "unavailable").length;
              const Icon = link.icon;
              return (
                <article key={agent.name} className="flex flex-col rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
                  <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <h3 className="font-bold text-navy">{agent.title}</h3>
                  <p className="mt-1 flex-1 text-sm text-slate-500">{agent.description}</p>
                  <p className="mt-3 text-xs text-slate-500">
                    {available} of {agent.capabilities.length} capabilities available to you
                  </p>
                  <Link
                    href={link.href}
                    aria-disabled={available === 0}
                    className={cn(buttonVariants({ size: "sm", variant: available ? "default" : "secondary" }), "mt-4")}
                  >
                    {link.label}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </AiDataRegion>
    </section>
  );
}

function suggestionHref(s: Suggestion): string {
  return s.kind === "practice_scenario" ? "/ai/coaching" : "/ai/plans";
}

function SuggestionsPanel() {
  const suggestions = useAiQuery((client) => client.listSuggestions(), []);
  const dismiss = useAiAction((client, id: string) => client.dismissSuggestion(id));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-navy">Recommended actions</CardTitle>
      </CardHeader>
      <CardContent>
        <AiDataRegion
          {...suggestions}
          onRetry={suggestions.reload}
          isEmpty={(page) => page.items.length === 0}
          empty={{ title: "Nothing to act on right now", description: "Recommendations appear here when an agent has a next step for you." }}
        >
          {(page) => (
            <ul className="space-y-3">
              {page.items.map((s) => (
                <li key={s.suggestion_id} className="rounded-xl border border-border-slate p-4">
                  <p className="font-semibold text-navy">{s.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{s.detail}</p>
                  <div className="mt-3 flex gap-2">
                    <Link href={suggestionHref(s)} className={buttonVariants({ size: "sm" })}>
                      Open
                    </Link>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={dismiss.pending}
                      onClick={async () => {
                        if (await dismiss.run(s.suggestion_id)) {
                          suggestions.setData((page) => ({
                            items: (page?.items ?? []).filter((x) => x.suggestion_id !== s.suggestion_id),
                            next_cursor: null,
                          }));
                        }
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AiDataRegion>
        <AiInlineError error={dismiss.error} />
      </CardContent>
    </Card>
  );
}

function InsightsPanel({ employeeId }: { employeeId: string }) {
  const gaps = useAiQuery((client) => client.getGaps(employeeId), [employeeId]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-navy">Development insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AiDataRegion
          {...gaps}
          onRetry={gaps.reload}
          isEmpty={(r) => r.gaps.length === 0}
          empty={{ title: "No capability gaps", description: "You meet every requirement of your role." }}
        >
          {(r) => (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Gaps to close" value={String(r.gaps.filter((g) => g.gap > 0).length)} />
                <StatCard
                  label="Critical"
                  value={String(r.gaps.filter((g) => g.priority === "critical").length)}
                  deltaTone="warning"
                />
              </div>
              <CompetencyChart
                currentLabel="Verified"
                data={r.gaps.map((g) => ({ name: g.skill_name, required: g.required_level, current: g.verified_level }))}
              />
              <AiDisclaimer>Gaps compare your verified levels with your role profile. Unverified skills show as not determined.</AiDisclaimer>
            </>
          )}
        </AiDataRegion>
      </CardContent>
    </Card>
  );
}

const STARTABLE: Array<{ type: WorkflowType; label: string }> = [
  { type: "personal_development", label: "Start personal development" },
  { type: "continuous_development", label: "Run a development check-in" },
];

function ActivityPanel() {
  const executions = useAiQuery((client) => client.listExecutions(), []);
  const workflows = useAiQuery((client) => client.listWorkflows(), []);
  const action = useAiAction(
    async (client, kind: "start" | "advance" | "retry" | "cancel", arg: string) => {
      if (kind === "start") return client.startWorkflow({ type: arg as WorkflowType }, newClientId("wf"));
      if (kind === "advance") return client.advanceWorkflow(arg);
      if (kind === "retry") return client.retryWorkflow(arg);
      return client.cancelWorkflow(arg);
    },
  );

  async function act(kind: "start" | "advance" | "retry" | "cancel", arg: string) {
    const updated = await action.run(kind, arg);
    if (updated) {
      workflows.setData((list) => [updated, ...(list ?? []).filter((w) => w.workflow_id !== updated.workflow_id)]);
    }
  }

  return (
    <section aria-labelledby="activity-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity-heading" className="flex items-center gap-2 text-lg font-bold text-navy">
          <WorkflowIcon className="size-4" aria-hidden /> Agent activity
        </h2>
        <div className="flex flex-wrap gap-2">
          {STARTABLE.map((s) => (
            <Button key={s.type} type="button" size="sm" variant="secondary" disabled={action.pending} onClick={() => act("start", s.type)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <AiInlineError error={action.error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-navy">Workflows</CardTitle>
          </CardHeader>
          <CardContent>
            <AiDataRegion
              {...workflows}
              onRetry={workflows.reload}
              isEmpty={(list) => list.length === 0}
              empty={{ title: "No workflows yet", description: "Start one above to have the agents work through it with you." }}
            >
              {(list) => (
                <ul className="space-y-3">
                  {list.map((w) => (
                    <WorkflowRow key={w.workflow_id} workflow={w} busy={action.pending} onAct={act} />
                  ))}
                </ul>
              )}
            </AiDataRegion>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-navy">Recent requests</CardTitle>
          </CardHeader>
          <CardContent>
            <AiDataRegion
              {...executions}
              onRetry={executions.reload}
              isEmpty={(page) => page.items.length === 0}
              empty={{ title: "No requests yet", description: "Ask the AI above and your requests will appear here." }}
            >
              {(page) => (
                <ul className="space-y-2">
                  {page.items.slice(0, 8).map((e) => (
                    <li key={e.execution_id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-navy">
                        {e.request.message ?? e.request.capability ?? e.steps[0]?.capability ?? "Request"}
                      </span>
                      <StatusBadge status={e.status} />
                    </li>
                  ))}
                </ul>
              )}
            </AiDataRegion>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function WorkflowRow({
  workflow,
  busy,
  onAct,
}: {
  workflow: WorkflowRecord;
  busy: boolean;
  onAct: (kind: "advance" | "retry" | "cancel", id: string) => void;
}) {
  const done = workflow.stages.filter((s) => s.status === "succeeded" || s.status === "skipped").length;
  return (
    <li className="rounded-xl border border-border-slate p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-navy capitalize">{workflow.title}</p>
        <StatusBadge status={workflow.status} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {done} of {workflow.stages.length} stages complete
      </p>
      {workflow.awaiting ? (
        <p className="mt-2 text-sm text-navy">
          Waiting for {workflow.awaiting.actor.replace(/_/g, " ")}: {workflow.awaiting.action}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        {workflow.status === "awaiting_input" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => onAct("advance", workflow.workflow_id)}>
            Continue
          </Button>
        ) : null}
        {workflow.status === "failed" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => onAct("retry", workflow.workflow_id)}>
            Retry
          </Button>
        ) : null}
        {["running", "awaiting_input", "failed"].includes(workflow.status) ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onAct("cancel", workflow.workflow_id)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </li>
  );
}
