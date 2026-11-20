"use client";

import type { DraftEnvelope, IndividualDevelopmentPlan, PlanProgressReport } from "@ai/contracts";
import { useState, type FormEvent } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { useAi } from "../../hooks/ai-client-context";
import { useAiAction, useAiQuery } from "../../hooks/use-ai-query";
import { CompetencyChart } from "../shared/competency-chart";
import { AiDataRegion, AiDisclaimer, AiInlineError, MockModeBanner, StatusBadge } from "../shared/ai-states";
import { IdpView } from "./idp-view";

export function PlansHubView() {
  const { client, identity } = useAi();
  const canReview = identity.roles.some((r) => r === "line_manager" || r === "hr_ld_admin");
  const [subject, setSubject] = useState(identity.employee_id ?? "");
  const [subjectInput, setSubjectInput] = useState(subject);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="AI Training Plans"
        description="Gap analysis against your role, learning from your organisation's catalogue, and Individual Development Plans that become official only after review."
      />
      <MockModeBanner mode={client.mode} />
      {canReview ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setSubject(subjectInput.trim());
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="plan-subject">Employee</Label>
            <Input id="plan-subject" value={subjectInput} onChange={(e) => setSubjectInput(e.target.value)} placeholder="Employee ID" />
          </div>
          <Button type="submit" variant="secondary">
            Show
          </Button>
          <span className="text-xs text-slate-500">You can view yourself and the people you manage (HR: your organisation).</span>
        </form>
      ) : null}
      {!subject ? (
        <p className="text-sm text-slate-500">Choose an employee to see their development data.</p>
      ) : (
        <Tabs defaultValue="gaps">
          <TabsList>
            <TabsTrigger value="gaps">Gap analysis</TabsTrigger>
            <TabsTrigger value="learning">Learning</TabsTrigger>
            <TabsTrigger value="generate">Generate IDP</TabsTrigger>
            <TabsTrigger value="reviews">Plan reviews</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>
          <TabsContent value="gaps" className="mt-6">
            <GapsPanel employeeId={subject} />
          </TabsContent>
          <TabsContent value="learning" className="mt-6">
            <LearningPanel employeeId={subject} />
          </TabsContent>
          <TabsContent value="generate" className="mt-6">
            <GeneratePanel employeeId={subject} />
          </TabsContent>
          <TabsContent value="reviews" className="mt-6">
            <ReviewsPanel employeeId={subject} />
          </TabsContent>
          <TabsContent value="progress" className="mt-6">
            <ProgressPanel />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function GapsPanel({ employeeId }: { employeeId: string }) {
  const gaps = useAiQuery((c) => c.getGaps(employeeId), [employeeId]);
  return (
    <AiDataRegion
      {...gaps}
      onRetry={gaps.reload}
      isEmpty={(r) => r.gaps.length === 0}
      empty={{ title: "No capability gaps", description: "Every role requirement is met." }}
    >
      {(r) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <CompetencyChart
                currentLabel="Verified"
                data={r.gaps.map((g) => ({ name: g.skill_name, required: g.required_level, current: g.verified_level }))}
              />
            </CardContent>
          </Card>
          <ul className="space-y-3">
            {r.gaps.map((g) => (
              <li key={g.skill_id} className="rounded-xl border border-border-slate bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-navy">{g.skill_name}</p>
                  <StatusBadge status={g.priority === "critical" ? "failed" : g.priority === "high" ? "pending" : "open"} label={g.priority} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{g.why_it_matters}</p>
                <p className="mt-1 text-xs text-slate-400">{g.priority_rationale}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AiDataRegion>
  );
}

function LearningPanel({ employeeId }: { employeeId: string }) {
  const learning = useAiQuery((c) => c.getLearningRecommendations({ employeeId, limit: 8 }), [employeeId]);
  return (
    <AiDataRegion
      {...learning}
      onRetry={learning.reload}
      isEmpty={(r) => r.recommendations.length === 0}
      empty={{ title: "No matching learning", description: "Your organisation's catalogue has nothing for these gaps yet." }}
    >
      {(r) => (
        <ul className="grid gap-4 md:grid-cols-2">
          {r.recommendations.map((l) => (
            <li key={l.catalogue_item_id} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
              <p className="font-bold text-navy">{l.title}</p>
              <p className="mt-1 text-sm text-slate-500">{l.fit_reason}</p>
              <p className="mt-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                {l.kind.replace(/_/g, " ")}
                {l.duration_minutes ? ` · ${Math.round(l.duration_minutes / 60)}h` : ""}
                {l.provider ? ` · ${l.provider}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AiDataRegion>
  );
}

function GeneratePanel({ employeeId }: { employeeId: string }) {
  const gaps = useAiQuery((c) => c.getGaps(employeeId), [employeeId]);
  const [focus, setFocus] = useState<string[]>([]);
  const [horizonText, setHorizonText] = useState("12");
  const horizon = Math.min(52, Math.max(4, Math.round(Number(horizonText)) || 12));
  const [hours, setHours] = useState("");
  const [result, setResult] = useState<DraftEnvelope<"development_plan", IndividualDevelopmentPlan> | null>(null);
  const generate = useAiAction((c) =>
    c.draftPlan({
      employee_id: employeeId,
      role_id: null,
      focus_skill_ids: focus.length ? focus : null,
      horizon_weeks: horizon,
      constraints: hours ? { hours_per_week: Number(hours), preferred_formats: null } : null,
    }),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-navy">Generate an Individual Development Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AiDataRegion {...gaps} onRetry={gaps.reload}>
            {(r) => (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-navy">Focus competencies (optional — default: highest priorities)</legend>
                {r.gaps.map((g) => (
                  <label key={g.skill_id} className="flex items-center gap-2 text-sm text-navy">
                    <Checkbox
                      checked={focus.includes(g.skill_id)}
                      onCheckedChange={(on) =>
                        setFocus((current) => (on === true ? [...current, g.skill_id] : current.filter((s) => s !== g.skill_id)))
                      }
                    />
                    {g.skill_name} <span className="text-xs text-slate-400">({g.priority})</span>
                  </label>
                ))}
              </fieldset>
            )}
          </AiDataRegion>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label htmlFor="idp-horizon">Length (weeks)</Label>
              <Input
                id="idp-horizon"
                type="number"
                min={4}
                max={52}
                value={horizonText}
                onChange={(e) => setHorizonText(e.target.value)}
                onBlur={() => setHorizonText(String(horizon))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="idp-hours">Hours per week (optional)</Label>
              <Input id="idp-hours" type="number" min={1} max={40} value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
          </div>
          <AiInlineError error={generate.error} />
          <Button
            type="button"
            disabled={generate.pending}
            onClick={async () => {
              const envelope = await generate.run();
              if (envelope) setResult(envelope);
            }}
          >
            {generate.pending ? "Generating plan…" : "Generate IDP"}
          </Button>
        </CardContent>
      </Card>
      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-navy">
              Draft plan <StatusBadge status={result.draft.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <IdpView plan={result.draft.payload} />
            <AiDisclaimer>
              {result.draft.disclaimer} Sent for review to: {result.draft.approval_policy.approver_roles.join(" or ").replace(/_/g, " ")}.
            </AiDisclaimer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ReviewsPanel({ employeeId }: { employeeId: string }) {
  const drafts = useAiQuery((c) => c.listDrafts({ subjectEmployeeId: employeeId }), [employeeId]);
  return (
    <AiDataRegion
      {...drafts}
      onRetry={drafts.reload}
      isEmpty={(list) => list.filter((d) => d.draft.kind === "development_plan").length === 0}
      empty={{ title: "No plans to review", description: "Generated plans appear here until they are approved or rejected." }}
    >
      {(list) => (
        <div className="space-y-6">
          {list
            .filter((d) => d.draft.kind === "development_plan")
            .map((d) => (
              <DraftReview
                key={d.draft.draft_id}
                envelope={d as DraftEnvelope<"development_plan", IndividualDevelopmentPlan>}
                onChange={(updated) =>
                  drafts.setData((current) => (current ?? []).map((x) => (x.draft.draft_id === updated.draft.draft_id ? updated : x)))
                }
              />
            ))}
        </div>
      )}
    </AiDataRegion>
  );
}

function DraftReview({
  envelope,
  onChange,
}: {
  envelope: DraftEnvelope<"development_plan", IndividualDevelopmentPlan>;
  onChange: (updated: DraftEnvelope) => void;
}) {
  const [reason, setReason] = useState("");
  const [planId, setPlanId] = useState("");
  const resolve = useAiAction((c, decision: "accepted" | "rejected") =>
    c.resolveDraft(envelope.draft.draft_id, { decision, reason: reason.trim() || null, expected_version: envelope.version }),
  );
  const commit = useAiAction((c) =>
    c.reportCommit(envelope.draft.draft_id, { system: "backend", resource_type: "development_plan", resource_id: planId.trim() }),
  );
  const { draft } = envelope;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-navy">
          Plan for {draft.payload.employee.plan_role_title}
          <StatusBadge status={draft.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <IdpView plan={draft.payload} />
        {draft.status === "open" && envelope.can_resolve ? (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <Label htmlFor={`reason-${draft.draft_id}`}>Comment (required to reject)</Label>
            <Textarea id={`reason-${draft.draft_id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            <AiInlineError error={resolve.error} />
            <div className="flex gap-2">
              <Button type="button" disabled={resolve.pending} onClick={async () => onChange((await resolve.run("accepted")) ?? envelope)}>
                Approve plan
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={resolve.pending || !reason.trim()}
                onClick={async () => onChange((await resolve.run("rejected")) ?? envelope)}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : null}
        {draft.status === "open" && !envelope.can_resolve ? (
          <p className="text-sm text-slate-500">Waiting for your line manager or HR to review this plan.</p>
        ) : null}
        {(draft.status === "accepted" || draft.status === "edited") && envelope.commit_plan.length ? (
          <div className="space-y-3 rounded-xl border border-border-slate p-4">
            <p className="text-sm text-navy">
              Approved. To make it official, the plan is saved to the HR system via{" "}
              {envelope.commit_plan.map((c) => `${c.method} ${c.path} (${c.endpoint_id}, ${c.endpoint_status})`).join(", ")}.
            </p>
            {envelope.commit_plan.some((c) => c.endpoint_status !== "available") ? (
              <p className="text-xs text-slate-500">
                That HR-system endpoint is not confirmed yet, so this screen does not save the plan itself. Once the plan exists in the HR
                system, record its ID here.
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor={`plan-${draft.draft_id}`}>HR system plan ID</Label>
                <Input id={`plan-${draft.draft_id}`} value={planId} onChange={(e) => setPlanId(e.target.value)} />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={commit.pending || !planId.trim()}
                onClick={async () => onChange((await commit.run()) ?? envelope)}
              >
                Record commit
              </Button>
            </div>
            <AiInlineError error={commit.error} />
          </div>
        ) : null}
        <AiDisclaimer>{draft.disclaimer}</AiDisclaimer>
      </CardContent>
    </Card>
  );
}

function ProgressPanel() {
  const [planId, setPlanId] = useState("");
  const [requested, setRequested] = useState<string | null>(null);
  const progress = useAiQuery((c) => c.getPlanProgress(requested ?? ""), [requested], { enabled: Boolean(requested) });
  const review = useAiAction((c, id: string) => c.reviewPlan(id, "manual"));
  const [reviewSummary, setReviewSummary] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setRequested(planId.trim() || null);
          setReviewSummary(null);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="progress-plan">Official plan ID</Label>
          <Input id="progress-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="e.g. plan-5501" />
        </div>
        <Button type="submit" variant="secondary" disabled={!planId.trim()}>
          Track progress
        </Button>
      </form>
      {requested ? (
        <AiDataRegion {...progress} onRetry={progress.reload}>
          {(p) => (
            <ProgressReport
              report={p}
              reviewing={review.pending}
              reviewSummary={reviewSummary}
              onReview={async () => {
                const result = await review.run(p.plan_id);
                if (result) setReviewSummary(result.summary);
              }}
            />
          )}
        </AiDataRegion>
      ) : null}
      <AiInlineError error={review.error} />
    </div>
  );
}

function ProgressReport({
  report,
  reviewing,
  reviewSummary,
  onReview,
}: {
  report: PlanProgressReport;
  reviewing: boolean;
  reviewSummary: string | null;
  onReview: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-navy">
          Progress on {report.plan_id}
          <span className="text-2xl font-bold">{report.overall_progress_pct}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {report.goals.map((g) => (
            <li key={g.goal_id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-navy">
                  {g.skill_name} (level {g.from_level} → {g.to_level})
                </span>
                <StatusBadge status={g.status} />
              </div>
              <div
                className="h-2 rounded-full bg-slate-100"
                role="progressbar"
                aria-label={`${g.skill_name} progress`}
                aria-valuenow={g.progress_pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-2 rounded-full bg-green-lime" style={{ width: `${g.progress_pct}%` }} />
              </div>
              <p className="text-xs text-slate-500">
                {g.actions_done}/{g.actions_total} actions done · {g.expected_pct}% of the time elapsed
                {g.overdue_actions.length ? ` · overdue: ${g.overdue_actions.join(", ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" disabled={reviewing} onClick={onReview}>
          {reviewing ? "Reviewing…" : "Ask AI to review the plan"}
        </Button>
        {reviewSummary ? <p className="text-sm text-navy">{reviewSummary}</p> : null}
      </CardContent>
    </Card>
  );
}
