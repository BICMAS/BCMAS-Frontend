"use client";

import type { ScoringView } from "@ai/contracts";
import { ClipboardCheckIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { AssessmentDelivery, AssignedAssessment } from "../../delivery";
import { useAi } from "../../hooks/ai-client-context";
import { useAiAction } from "../../hooks/use-ai-query";
import { AiErrorState, AiInlineError, MockModeBanner, StatusBadge } from "../shared/ai-states";
import { ScoringPanel } from "./scoring-panel";
import { useAssessmentDelivery } from "./use-delivery";

export function AssessmentsHubView({ delivery: injected }: { delivery?: AssessmentDelivery }) {
  const { client, identity } = useAi();
  const assessor = identity.roles.includes("hr_ld_admin");
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="AI Talent Assessment"
        description={
          assessor
            ? "Evaluate submitted assessments with evidence-based AI scoring. Every score traces to your framework's criteria and needs your decision."
            : "Take the capability assessments assigned to you. Your responses are reviewed by an assessor with AI support."
        }
      />
      <MockModeBanner mode={client.mode} />
      <MyAssessments injected={injected} />
      {assessor ? <EvaluatePanel /> : null}
    </div>
  );
}

function MyAssessments({ injected }: { injected?: AssessmentDelivery }) {
  const delivery = useAssessmentDelivery(injected);
  const [list, setList] = useState<AssignedAssessment[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!delivery) return;
    let cancelled = false;
    delivery
      .listAssigned()
      .then((rows) => !cancelled && setList(rows))
      .catch((caught: unknown) => !cancelled && setError(caught));
    return () => {
      cancelled = true;
    };
  }, [delivery, attempt]);

  return (
    <section aria-labelledby="my-assessments" className="space-y-4">
      <h2 id="my-assessments" className="text-lg font-bold text-navy">
        My assessments
      </h2>
      {error ? (
        <AiErrorState
          error={error}
          onRetry={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
      ) : !list ? (
        <LoadingSkeleton rows={2} />
      ) : list.length === 0 ? (
        <EmptyState title="No assessments assigned" description="Assessments assigned to you appear here." icon={ClipboardCheckIcon} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((a) => (
            <li key={a.assessment_id} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-navy">{a.title}</p>
                <StatusBadge status={a.status === "submitted" ? "completed" : a.status === "in_progress" ? "running" : "open"} label={a.status.replace("_", " ")} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {a.item_count} questions{a.due_at ? ` · due ${new Date(a.due_at).toLocaleDateString()}` : ""}
              </p>
              {a.status !== "submitted" ? (
                <Link href={`/ai/assessments/${a.assessment_id}/take`} className={buttonVariants({ size: "sm", className: "mt-4" })}>
                  {a.status === "in_progress" ? "Continue" : "Start assessment"}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EvaluatePanel() {
  const [assessmentId, setAssessmentId] = useState("");
  const [view, setView] = useState<ScoringView | null>(null);
  const score = useAiAction((c, id: string) => c.scoreAssessment(id, { rubric_row_ids: null }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!assessmentId.trim()) return;
    setView(null);
    const result = await score.run(assessmentId.trim());
    if (result) setView(result);
  }

  return (
    <section aria-labelledby="evaluate-heading" className="space-y-4">
      <h2 id="evaluate-heading" className="text-lg font-bold text-navy">
        Evaluate an assessment
      </h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-navy">Run evidence-based scoring on submitted responses</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="assessment-id">Assessment ID</Label>
              <Input id="assessment-id" value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} placeholder="e.g. dev-james" />
            </div>
            <Button type="submit" disabled={score.pending || !assessmentId.trim()}>
              {score.pending ? "Evaluating responses…" : "Evaluate"}
            </Button>
          </form>
          <div className="mt-3">
            <AiInlineError error={score.error} />
          </div>
        </CardContent>
      </Card>
      {view ? <ScoringPanel view={view} onChange={setView} /> : null}
    </section>
  );
}
