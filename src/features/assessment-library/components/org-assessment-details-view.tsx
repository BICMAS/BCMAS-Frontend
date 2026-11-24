"use client";

import {
  ArchiveIcon,
  ClipboardCheckIcon,
  CopyIcon,
  EyeIcon,
  GitCompareIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getPublishedMaster } from "../services/central-library";
import {
  copyFromMaster,
  discardOrgDraft,
  getOrgAssessment,
  removeOrgItem,
  retireOrgAssessment,
  saveOrgItem,
  startOrgVersion,
  submitForApproval,
  updateOrgDraft,
  withdrawFromReview,
} from "../services/org-library";
import {
  LibraryError,
  checkVersion,
  currentVersion,
  nextItemId,
  openVersion,
  publishedVersion,
} from "../services/versioning";
import { ASSESSMENT_TYPE_LABEL, ORG_VERSION_STATUS_LABEL, type TemplateItem, type TemplateVersion } from "../types";
import { VersionBadge, fieldSelectClass } from "./library-shared";
import { OrgLibraryGate, UseTemplateDialog, useOrgLibraryRevision, useRoleOptions } from "./org-shared";
import { CompareDialog, PreviewDialog } from "./preview-compare-dialogs";
import { QuestionDialog, blankItem } from "./question-dialog";
import { TemplateFormDialog } from "./template-form-dialog";
import {
  ChecksBanner,
  HistoryTab,
  ItemsTab,
  OverviewTab,
  ReasonDialog,
  ScoringTab,
  StatTiles,
  runCommand as run,
  type ReasonAction,
} from "./template-tabs";

const orgLabel = (status: TemplateVersion["status"]) => ORG_VERSION_STATUS_LABEL[status];

export function OrgAssessmentDetailsView({ assessmentId }: { assessmentId: string }) {
  return <OrgLibraryGate>{(ctx) => <OrgAssessmentDetails assessmentId={assessmentId} {...ctx} />}</OrgLibraryGate>;
}

function OrgAssessmentDetails({
  assessmentId,
  organisationId,
  actor,
}: {
  assessmentId: string;
  organisationId: string;
  actor: string;
}) {
  const router = useRouter();
  const revision = useOrgLibraryRevision();
  const roles = useRoleOptions();
  const assessment = useMemo(() => {
    void revision;
    return getOrgAssessment(organisationId, assessmentId);
  }, [organisationId, assessmentId, revision]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState<TemplateItem | null>(null);
  const [preview, setPreview] = useState<TemplateVersion | null>(null);
  const [comparing, setComparing] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReasonAction>(null);

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

  const id = assessment.id;
  const open = openVersion(assessment);
  const live = publishedVersion(assessment);
  const current = currentVersion(assessment);
  const viewed = assessment.versions.find((v) => v.version === selected) ?? current;
  const viewingOpen = open !== null && viewed === open;
  const editable = viewingOpen && open.status === "draft";
  const masterStillPublished = assessment.source ? getPublishedMaster(assessment.source.templateId) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/talent/library" className="text-xs font-bold text-slate-500 hover:underline">
        ← Organisation Assessment Library
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">{viewed.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ASSESSMENT_TYPE_LABEL[viewed.assessmentType]} · Role: {assessment.linkedRole ?? "not linked"} ·{" "}
            {assessment.source ? (
              <>
                Based on BCMS master{" "}
                {masterStillPublished ? (
                  <Link
                    href={`/talent/library/bcms/${assessment.source.templateId}`}
                    className="font-semibold text-navy hover:underline"
                  >
                    {assessment.source.templateName} v{assessment.source.version}
                  </Link>
                ) : (
                  <span className="font-semibold text-navy">
                    {assessment.source.templateName} v{assessment.source.version}
                  </span>
                )}
              </>
            ) : (
              "Created by your organisation"
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VersionBadge status={viewed.status} version={viewed.version} label={orgLabel(viewed.status)} />
            {live && live !== viewed ? <span className="text-xs text-slate-500">In use: v{live.version}</span> : null}
            {masterStillPublished && masterStillPublished.version.version !== assessment.source?.version ? (
              <Badge variant="info">BCMS master now at v{masterStillPublished.version.version}</Badge>
            ) : null}
          </div>
        </div>
        <label className="text-xs font-bold text-navy">
          Viewing version
          <select className={fieldSelectClass} value={viewed.version} onChange={(e) => setSelected(e.target.value)}>
            {[...assessment.versions].reverse().map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} · {orgLabel(v.status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" aria-label="Assessment actions">
          {editable ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                <PencilIcon aria-hidden />
                Customise
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setQuestion(blankItem(nextItemId(assessment), viewed.competencies[0] ?? ""))}
              >
                <PlusIcon aria-hidden />
                Add Question
              </Button>
              <Link href={`/talent/library/${id}/builder`} className={buttonVariants({ variant: "secondary" })}>
                <SparklesIcon aria-hidden />
                Generate with AI
              </Link>
            </>
          ) : null}
          {!open && live ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (run(() => startOrgVersion(organisationId, id, actor), "New draft version created. The approved version stays in use.")) {
                  setSelected(null);
                }
              }}
            >
              <PencilIcon aria-hidden />
              Customise (new version)
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setPreview(viewed)}>
            <EyeIcon aria-hidden />
            Preview
          </Button>
          <Button type="button" variant="secondary" onClick={() => setComparing(true)}>
            <GitCompareIcon aria-hidden />
            Compare Versions
          </Button>
          {editable ? (
            <>
              <Button type="button" onClick={() => run(() => submitForApproval(organisationId, id, actor), "Submitted for approval.")}>
                <SendIcon aria-hidden />
                Submit for Approval
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (run(() => discardOrgDraft(organisationId, id), "Draft discarded.")) {
                    if (assessment.versions.length === 1) router.push("/talent/library");
                    setSelected(null);
                  }
                }}
              >
                <Trash2Icon aria-hidden />
                Discard Draft
              </Button>
            </>
          ) : null}
          {viewingOpen && open.status === "in_review" ? (
            <Link href={`/talent/library/${id}/review`} className={buttonVariants({ variant: open.submittedBy === actor ? "secondary" : "default" })}>
              <ClipboardCheckIcon aria-hidden />
              {open.submittedBy === actor ? "View Review" : "Open Review"}
            </Link>
          ) : null}
          {viewingOpen && open.status === "in_review" && open.submittedBy === actor ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => run(() => withdrawFromReview(organisationId, id, actor), "Withdrawn to draft.")}
            >
              <Undo2Icon aria-hidden />
              Withdraw from Review
            </Button>
          ) : null}
          {!open && live ? (
            <Button type="button" variant="destructive" onClick={() => setReasonAction("retire")}>
              <ArchiveIcon aria-hidden />
              Retire
            </Button>
          ) : null}
        </div>
        {viewingOpen && open.status === "in_review" ? (
          <p className="text-xs text-slate-500">
            v{open.version} is waiting for approval by an authorised approver
            {open.submittedBy ? ` (submitted by ${open.submittedBy})` : ""}. It cannot be edited while in review.
            {open.submittedBy !== actor ? " Open Review to approve, return or reject each item." : ""}
          </p>
        ) : null}
        {open && !viewingOpen ? (
          <p className="text-xs text-slate-500">
            You are viewing v{viewed.version}, which cannot be changed. Switch to v{open.version} to work on the open version.
          </p>
        ) : null}
      </div>

      {editable ? <ChecksBanner checks={checkVersion(open)} /> : null}
      <StatTiles version={viewed} />

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="history">Version History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <OverviewTab version={viewed} />
        </TabsContent>
        <TabsContent value="items" className="mt-6">
          <ItemsTab
            version={viewed}
            reviews={viewed.itemReviews}
            editable={editable}
            onEdit={setQuestion}
            onRemove={(item) => run(() => removeOrgItem(organisationId, id, item.id, actor), `${item.title} removed.`)}
          />
        </TabsContent>
        <TabsContent value="scoring" className="mt-6">
          <ScoringTab version={viewed} audience="your organisation's HRBPs and approvers" />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryTab versions={assessment.versions} statusLabel={orgLabel} />
        </TabsContent>
      </Tabs>

      <TemplateFormDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Customise · v${open?.version ?? ""}`}
        description="Changes apply to your organisation's draft only. The BCMS master is not affected."
        submitLabel="Save changes"
        initial={open ?? undefined}
        roleField={{ initial: assessment.linkedRole, options: roles }}
        onSubmit={(settings, linkedRole) => {
          if (run(() => updateOrgDraft(organisationId, id, settings, linkedRole, actor), "Draft updated.")) setEditing(false);
        }}
      />
      <QuestionDialog
        open={question !== null}
        onOpenChange={(isOpen) => !isOpen && setQuestion(null)}
        item={question}
        competencies={open?.competencies ?? viewed.competencies}
        onSave={(item) => {
          if (run(() => saveOrgItem(organisationId, id, item, actor), `${item.title} saved.`)) setQuestion(null);
        }}
      />
      <PreviewDialog version={preview} onOpenChange={(isOpen) => !isOpen && setPreview(null)} />
      <CompareDialog open={comparing} onOpenChange={setComparing} versions={assessment.versions} />
      <ReasonDialog
        action={reasonAction}
        retireDescription="It can no longer be assigned to new vacancies. Past candidate attempts keep the exact version they used."
        onCancel={() => setReasonAction(null)}
        onConfirm={(reason) => {
          if (run(() => retireOrgAssessment(organisationId, id, actor, reason), "Assessment retired.")) setReasonAction(null);
        }}
      />
    </div>
  );
}

/** A published BCMS master as organisations see it: read-only, with Use Template. */
export function BcmsTemplateView({ templateId }: { templateId: string }) {
  return <OrgLibraryGate>{(ctx) => <BcmsTemplate templateId={templateId} {...ctx} />}</OrgLibraryGate>;
}

function BcmsTemplate({ templateId, organisationId, actor }: { templateId: string; organisationId: string; actor: string }) {
  const router = useRouter();
  const revision = useOrgLibraryRevision();
  const master = useMemo(() => {
    void revision;
    return getPublishedMaster(templateId);
  }, [templateId, revision]);
  const [copying, setCopying] = useState(false);
  const [preview, setPreview] = useState<TemplateVersion | null>(null);

  if (!master) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This BCMS template is not published, so it cannot be viewed or copied.</p>
        <Link href="/talent/library" className="text-sm font-bold text-navy hover:underline">
          ← Back to the Organisation Assessment Library
        </Link>
      </div>
    );
  }
  const v = master.version;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/talent/library" className="text-xs font-bold text-slate-500 hover:underline">
        ← Organisation Assessment Library
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">{v.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {ASSESSMENT_TYPE_LABEL[v.assessmentType]} · {v.roleFamily} · BCMS master template
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="success">v{v.version} Published</Badge>
          <Badge variant="secondary">Read-only</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setCopying(true)}>
          <CopyIcon aria-hidden />
          Use Template
        </Button>
        <Button type="button" variant="secondary" onClick={() => setPreview(v)}>
          <EyeIcon aria-hidden />
          Preview
        </Button>
      </div>
      <StatTiles version={v} />
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <OverviewTab version={v} />
        </TabsContent>
        <TabsContent value="items" className="mt-6">
          <ItemsTab version={v} editable={false} />
          <p className="mt-3 text-xs text-slate-500">
            Answer keys and rubrics come with your organisation copy, where your HRBPs and approvers can review them.
          </p>
        </TabsContent>
      </Tabs>

      <UseTemplateDialog
        master={copying ? { templateId, name: v.name, version: v.version } : null}
        organisationId={organisationId}
        onOpenChange={setCopying}
        onConfirm={(input) => {
          try {
            const id = copyFromMaster(organisationId, templateId, input, actor);
            setCopying(false);
            toast.success("Organisation copy created as a draft. The BCMS master is unchanged.");
            router.push(`/talent/library/${id}`);
          } catch (error) {
            toast.error(error instanceof LibraryError ? error.message : "Could not copy the template.");
          }
        }}
      />
      <PreviewDialog version={preview} onOpenChange={(isOpen) => !isOpen && setPreview(null)} />
    </div>
  );
}
