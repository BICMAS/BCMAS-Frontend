"use client";

import type { AssessmentDesignEnvelope, AssessmentMethod } from "@ai/contracts";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiDisclaimer, AiInlineError } from "@/features/ai/components/shared/ai-states";
import { useAiAction } from "@/features/ai/hooks/use-ai-query";
import { listRoleRecords } from "@/features/roles/services/mock-roles";

import {
  candidatesFromDesign,
  candidatesFromTemplate,
  coverage,
  findDuplicates,
  recommendTemplates,
  roleCompetencies,
  type DraftCandidate,
  type TemplateRecommendation,
} from "../services/ai-builder";
import { listPublishedMasters } from "../services/central-library";
import { addItemsToDraft, getOrgAssessment, startOrgVersion, submitForApproval } from "../services/org-library";
import { currentVersion, openVersion } from "../services/versioning";
import { DIFFICULTY_LABEL, RESPONSE_TYPE_LABEL, type TemplateItem } from "../types";
import { fieldSelectClass, formatDateTime } from "./library-shared";
import { OrgLibraryGate, useOrgLibraryRevision } from "./org-shared";
import { QuestionDialog } from "./question-dialog";
import { runCommand } from "./template-tabs";

const METHODS: Array<[AssessmentMethod, string]> = [
  ["competency_based", "Competency-based (mixed)"],
  ["situational_judgement", "Situational judgement"],
  ["scenario_based", "Scenario-based"],
  ["behavioural", "Behavioural"],
  ["technical", "Technical"],
  ["leadership", "Leadership"],
];

/** Role profiles HR may build against: approved or published only. */
function approvedRoles() {
  return listRoleRecords().filter((role) => role.status === "approved" || role.status === "published");
}

export function AiBuilderView({ assessmentId }: { assessmentId: string }) {
  return <OrgLibraryGate>{(ctx) => <AiBuilder assessmentId={assessmentId} {...ctx} />}</OrgLibraryGate>;
}

function AiBuilder({ assessmentId, organisationId, actor }: { assessmentId: string; organisationId: string; actor: string }) {
  const router = useRouter();
  const revision = useOrgLibraryRevision();
  const assessment = useMemo(() => {
    void revision;
    return getOrgAssessment(organisationId, assessmentId);
  }, [organisationId, assessmentId, revision]);
  const roles = useMemo(() => approvedRoles(), []);
  const [roleId, setRoleId] = useState(
    () => roles.find((r) => r.title === assessment?.linkedRole)?.id ?? roles[0]?.id ?? "",
  );
  const [tab, setTab] = useState("role");
  const [method, setMethod] = useState<AssessmentMethod>("competency_based");
  const [perCompetency, setPerCompetency] = useState(2);
  const [candidates, setCandidates] = useState<DraftCandidate[]>([]);
  const [lastDesign, setLastDesign] = useState<AssessmentDesignEnvelope | null>(null);
  const [recommendations, setRecommendations] = useState<TemplateRecommendation[] | null>(null);
  const [editing, setEditing] = useState<DraftCandidate | null>(null);
  const [checked, setChecked] = useState(false);
  const generate = useAiAction((client, skillIds: string[] | null) =>
    client.designAssessment({
      method,
      role_id: roleId,
      skill_ids: skillIds,
      questions_per_competency: skillIds ? 1 : perCompetency,
    }),
  );

  const role = roles.find((r) => r.id === roleId) ?? null;
  const profile = useMemo(() => (role ? roleCompetencies(role) : []), [role]);

  if (!assessment) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This assessment is not in your organisation&apos;s library.</p>
        <Link href="/talent/library" className="text-sm font-bold text-navy hover:underline">
          ← Back to the Organisation Assessment Library
        </Link>
      </div>
    );
  }

  const open = openVersion(assessment);
  const existing = (open ?? currentVersion(assessment)).items;
  const included = candidates.filter((c) => c.include);
  const rows = coverage(profile, existing, included.map((c) => c.item));
  const gaps = rows.filter((r) => r.existing === 0 && r.drafted === 0);
  const duplicates = findDuplicates(candidates, existing);
  const backHref = `/talent/library/${assessment.id}`;

  if (!open || open.status !== "draft") {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href={backHref} className="text-xs font-bold text-slate-500 hover:underline">
          ← {currentVersion(assessment).name}
        </Link>
        <h1 className="text-3xl font-bold text-navy">AI Assessment Builder</h1>
        {open?.status === "in_review" ? (
          <p className="text-sm text-slate-500">
            v{open.version} is in review, so new items cannot be added. Withdraw it from review first.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              The approved version cannot be changed. Start a new draft version to add AI-drafted items; the approved
              version stays in use until the new one is approved.
            </p>
            <Button
              type="button"
              onClick={() => runCommand(() => startOrgVersion(organisationId, assessment.id, actor), "New draft version created.")}
            >
              Start a new draft version
            </Button>
          </>
        )}
      </div>
    );
  }

  async function runGenerate(skillIds: string[] | null, replaceKey?: string) {
    const envelope = await generate.run(skillIds);
    if (!envelope) return;
    setLastDesign(envelope);
    const fresh = candidatesFromDesign(envelope, profile, replaceKey ? "regen" : "ai");
    setChecked(false);
    if (replaceKey) {
      const replacement = fresh[0];
      if (!replacement) return;
      setCandidates((current) => current.map((c) => (c.key === replaceKey ? { ...replacement, key: `${replaceKey}-r${Date.now()}` } : c)));
      toast.success("Item regenerated. Review it before saving.");
    } else {
      setCandidates((current) => [...current.filter((c) => c.item.origin?.kind !== "ai"), ...fresh]);
      setTab("review");
      toast.success(`${fresh.length} draft items generated. Review them before saving.`);
    }
  }

  function save(thenSubmit: boolean) {
    if (!assessment) return;
    const items: TemplateItem[] = included.map((c) => c.item);
    const ok = runCommand(
      () => addItemsToDraft(organisationId, assessment.id, items, role?.title ?? null, actor),
      `${items.length} draft item${items.length === 1 ? "" : "s"} saved to v${open!.version}.`,
    );
    if (!ok) return;
    setCandidates([]);
    if (thenSubmit) {
      const submitted = runCommand(() => submitForApproval(organisationId, assessment.id, actor), "Sent for review.");
      if (submitted) router.push(backHref);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={backHref} className="text-xs font-bold text-slate-500 hover:underline">
        ← {open.name} · v{open.version} draft
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">AI Assessment Builder</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          AI drafts questions from your approved role profile and the BCMS framework. Everything it produces is a draft:
          you review and edit it here, and it is used only after approval.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Role", role?.title ?? "—", "Approved role profile"],
          ["Required competencies", String(profile.length), "From the role profile"],
          ["Existing items", String(existing.length), `In v${open.version}`],
          ["Coverage gaps", String(gaps.length), gaps.length ? "Competencies with no questions" : "Every competency covered"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="truncate text-xl font-bold text-navy" title={value}>
              {value}
            </p>
            <p className="text-xs font-semibold text-navy">{label}</p>
            <p className="text-[10px] text-slate-400">{hint}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList variant="line">
          <TabsTrigger value="role">Role &amp; Skills</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="review">Review Draft{candidates.length ? ` (${candidates.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="role" className="mt-6 space-y-4">
          <label className="block max-w-md text-xs font-bold text-navy">
            Approved role profile
            <select
              className={fieldSelectClass}
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                setRecommendations(null);
              }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · {r.departmentName}
                </option>
              ))}
            </select>
          </label>
          <CoverageTable rows={rows} />
          <p className="text-xs text-slate-500">
            Only competencies in this role profile are used. AI items for anything else are flagged and left out unless
            you choose to keep them.
          </p>
        </TabsContent>

        <TabsContent value="template" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRecommendations(recommendTemplates(listPublishedMasters(), profile))}
            >
              <WandSparklesIcon aria-hidden />
              Recommend Templates
            </Button>
            <span className="text-xs text-slate-500">Published BCMS templates ranked by how many role competencies they cover.</span>
          </div>
          {recommendations === null ? null : recommendations.length === 0 ? (
            <p className="rounded-xl border border-border-slate bg-white p-5 text-sm text-slate-500">
              No published template covers this role&apos;s competencies. Generate draft items with AI instead.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Recommended templates">
              {recommendations.map((rec, index) => (
                <li key={rec.templateId} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-navy">
                        {rec.version.name} <span className="font-normal text-slate-500">v{rec.version.version}</span>
                        {index === 0 ? <Badge variant="success" className="ml-2">Best match</Badge> : null}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{rec.reason}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const add = candidatesFromTemplate(rec, profile).filter(
                          (c) => !candidates.some((existingCandidate) => existingCandidate.key === c.key),
                        );
                        setCandidates((current) => [...current, ...add]);
                        setChecked(false);
                        setTab("review");
                        toast.success(`${add.length} template question${add.length === 1 ? "" : "s"} added to the review list.`);
                      }}
                    >
                      Add matching questions
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="generate" className="mt-6 space-y-4">
          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-navy">
              Assessment method
              <select className={fieldSelectClass} value={method} onChange={(e) => setMethod(e.target.value as AssessmentMethod)}>
                {METHODS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-navy">
              Questions per competency
              <select className={fieldSelectClass} value={perCompetency} onChange={(e) => setPerCompetency(Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button type="button" disabled={generate.pending || !role} onClick={() => runGenerate(null)}>
            <SparklesIcon aria-hidden />
            {generate.pending ? "Generating…" : candidates.some((c) => c.item.origin?.kind === "ai") ? "Regenerate all" : "Generate Draft Items"}
          </Button>
          <AiInlineError error={generate.error} />
          {lastDesign ? <ProvenanceNote envelope={lastDesign} /> : null}
          <AiDisclaimer>
            The AI uses only your organisation&apos;s approved role profile and framework criteria. It cannot approve,
            publish or assign anything.
          </AiDisclaimer>
        </TabsContent>

        <TabsContent value="review" className="mt-6 space-y-4">
          {candidates.length === 0 ? (
            <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">
              No draft items yet. Generate them with AI or add questions from a recommended template.
            </p>
          ) : (
            <>
              <ul className="space-y-3" aria-label="Draft items">
                {candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.key}
                    candidate={candidate}
                    duplicateOf={duplicates.get(candidate.key)}
                    regenerating={generate.pending}
                    onToggle={(include) =>
                      setCandidates((current) => current.map((c) => (c.key === candidate.key ? { ...c, include } : c)))
                    }
                    onEdit={() => setEditing(candidate)}
                    onRegenerate={
                      candidate.skillId ? () => runGenerate([candidate.skillId!], candidate.key) : undefined
                    }
                    onDiscard={() => setCandidates((current) => current.filter((c) => c.key !== candidate.key))}
                  />
                ))}
              </ul>
              {checked ? (
                <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Coverage check">
                  <h2 className="font-bold text-navy">Coverage check</h2>
                  <CoverageTable rows={rows} />
                  <p className="mt-2 text-xs text-slate-500">
                    {gaps.length ? `Still missing: ${gaps.map((g) => g.competency).join(", ")}.` : "Every role competency has at least one question."}{" "}
                    {duplicates.size ? `${duplicates.size} possible duplicate${duplicates.size === 1 ? "" : "s"} flagged above.` : "No duplicates found."}
                  </p>
                </section>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setChecked(true)}>
                  <CheckCircle2Icon aria-hidden />
                  Check Coverage
                </Button>
                <Button type="button" disabled={included.length === 0} onClick={() => save(false)}>
                  <SaveIcon aria-hidden />
                  Save Draft ({included.length})
                </Button>
                <Button type="button" variant="accent" disabled={included.length === 0} onClick={() => save(true)}>
                  <SendIcon aria-hidden />
                  Save and Send for Review
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <QuestionDialog
        open={editing !== null}
        onOpenChange={(isOpen) => !isOpen && setEditing(null)}
        item={editing?.item ?? null}
        competencies={[...new Set([...profile.map((c) => c.name), ...(editing ? [editing.item.competency] : [])])]}
        onSave={(item) => {
          if (!editing) return;
          setCandidates((current) =>
            current.map((c) => (c.key === editing.key ? { ...c, item: { ...item, origin: c.item.origin, level: c.item.level } } : c)),
          );
          setEditing(null);
          toast.success("Draft item updated.");
        }}
      />
    </div>
  );
}

function CoverageTable({ rows }: { rows: ReturnType<typeof coverage> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-3">Required competency</th>
            <th className="px-4 py-3">Level</th>
            <th className="px-4 py-3">Existing items</th>
            <th className="px-4 py-3">Drafted</th>
            <th className="px-4 py-3">Coverage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-slate">
          {rows.map((row) => (
            <tr key={row.competency}>
              <td className="px-4 py-3 font-semibold text-navy">{row.competency}</td>
              <td className="px-4 py-3">{row.level}</td>
              <td className="px-4 py-3">{row.existing}</td>
              <td className="px-4 py-3">{row.drafted}</td>
              <td className="px-4 py-3">
                {row.existing + row.drafted > 0 ? <Badge variant="success">Covered</Badge> : <Badge variant="warning">Gap</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProvenanceNote({ envelope }: { envelope: AssessmentDesignEnvelope }) {
  const p = envelope.draft.provenance;
  return (
    <p className="text-xs text-slate-500">
      Generated {formatDateTime(p.generated_at)} by {p.model} ({p.prompt_version}) from role profile v
      {envelope.draft.payload.role_profile_version ?? "—"} · AI draft {envelope.draft.draft_id}
    </p>
  );
}

function CandidateCard({
  candidate,
  duplicateOf,
  regenerating,
  onToggle,
  onEdit,
  onRegenerate,
  onDiscard,
}: {
  candidate: DraftCandidate;
  duplicateOf?: string;
  regenerating: boolean;
  onToggle: (include: boolean) => void;
  onEdit: () => void;
  onRegenerate?: () => void;
  onDiscard: () => void;
}) {
  const { item } = candidate;
  const ai = item.origin?.kind === "ai";
  return (
    <li className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={candidate.include}
          onCheckedChange={(value) => onToggle(value === true)}
          aria-label={`Include ${item.title}`}
          className="mt-1"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-navy">{item.title}</p>
            <Badge variant="warning">{ai ? "AI draft" : "Template · draft"}</Badge>
            <Badge variant="secondary">{item.competency}</Badge>
            {item.level ? <Badge variant="secondary">Level {item.level}</Badge> : null}
            <Badge variant="secondary">{DIFFICULTY_LABEL[item.difficulty]}</Badge>
            <Badge variant="secondary">{RESPONSE_TYPE_LABEL[item.responseType]}</Badge>
          </div>
          <p className="text-sm text-slate-600">{item.text}</p>
          {item.responseType !== "case_response" ? (
            <ul className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
              {item.options.map((o) => (
                <li key={o.id} className={o.id === item.scoring.correctOptionId ? "font-semibold text-navy" : undefined}>
                  {o.id === item.scoring.correctOptionId ? "✓ " : "• "}
                  {o.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              Rubric: {(item.scoring.rubric ?? []).map((l) => `${l.score} – ${l.descriptor}`).join(" · ")}
            </p>
          )}
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-navy">Source:</span>{" "}
            {item.origin?.source} — {candidate.sourceTexts.join(" ")}
          </p>
          {candidate.outsideProfile ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-soft-foreground">
              <AlertTriangleIcon className="size-3.5" aria-hidden />
              {item.competency} is not in the selected role profile. Left out unless you include it.
            </p>
          ) : null}
          {duplicateOf ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-soft-foreground">
              <AlertTriangleIcon className="size-3.5" aria-hidden />
              Possible duplicate of {duplicateOf}.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit draft ${item.title}`}>
            Edit
          </Button>
          {onRegenerate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={regenerating}
              onClick={onRegenerate}
              aria-label={`Regenerate ${item.title}`}
            >
              <RefreshCwIcon aria-hidden />
              Regenerate
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onDiscard} aria-label={`Discard ${item.title}`}>
            <Trash2Icon aria-hidden />
            Discard
          </Button>
        </div>
      </div>
    </li>
  );
}
