"use client";

import {
  ArchiveIcon,
  CheckCircle2Icon,
  EyeIcon,
  GitCompareIcon,
  PencilIcon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import { useSessionStore } from "@/stores/session-store";

import {
  approveAndPublish,
  canApprove,
  checkVersion,
  currentVersion,
  discardDraft,
  getTemplate,
  nextItemId,
  openVersion,
  publishedVersion,
  removeItem,
  retireTemplate,
  returnForChanges,
  saveItem,
  startNewVersion,
  submitForReview,
  updateDraft,
  updateQuality,
} from "../services/central-library";
import {
  ASSESSMENT_TYPE_LABEL,
  VERSION_STATUS_LABEL,
  type MasterTemplate,
  type QualityNotes,
  type TemplateItem,
  type TemplateVersion,
} from "../types";
import { VersionBadge, fieldSelectClass, useLibraryRevision } from "./library-shared";
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

export function TemplateDetailsView({ templateId }: { templateId: string }) {
  return (
    <PlatformGate>
      <TemplateDetails templateId={templateId} />
    </PlatformGate>
  );
}

function TemplateDetails({ templateId }: { templateId: string }) {
  const router = useRouter();
  const revision = useLibraryRevision();
  const actor = useSessionStore((state) => state.user.name);
  const template = useMemo(() => {
    void revision;
    return getTemplate(templateId);
  }, [templateId, revision]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState<TemplateItem | null>(null);
  const [preview, setPreview] = useState<TemplateVersion | null>(null);
  const [comparing, setComparing] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReasonAction>(null);

  if (!template) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This template does not exist or was discarded.</p>
        <Link href="/platform/assessment-library" className="text-sm font-bold text-navy hover:underline">
          ← Back to the Central Assessment Library
        </Link>
      </div>
    );
  }

  const current = currentVersion(template);
  const open = openVersion(template);
  const live = publishedVersion(template);
  const viewed = template.versions.find((v) => v.version === selected) ?? current;
  const editable = open?.status === "draft" && viewed === open;
  const checks = open ? checkVersion(open) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/platform/assessment-library" className="text-xs font-bold text-slate-500 hover:underline">
        ← Central Assessment Library
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">{viewed.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ASSESSMENT_TYPE_LABEL[viewed.assessmentType]} · {viewed.roleFamily} · Master template
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VersionBadge status={viewed.status} version={viewed.version} />
            {live && live !== viewed ? <span className="text-xs text-slate-500">Live: v{live.version}</span> : null}
          </div>
        </div>
        <label className="text-xs font-bold text-navy">
          Viewing version
          <select
            className={fieldSelectClass}
            value={viewed.version}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Viewing version"
          >
            {[...template.versions].reverse().map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version} · {VERSION_STATUS_LABEL[v.status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ActionBar
        template={template}
        viewed={viewed}
        actor={actor}
        onEdit={() => setEditing(true)}
        onAddQuestion={() => setQuestion(blankItem(nextItemId(template), viewed.competencies[0] ?? ""))}
        onPreview={() => setPreview(viewed)}
        onCompare={() => setComparing(true)}
        onReason={setReasonAction}
        onStartVersion={() => {
          if (run(() => startNewVersion(template.id, actor), "New draft version created. The live version is unchanged.")) {
            setSelected(null);
          }
        }}
        onSubmit={() => run(() => submitForReview(template.id, actor), "Submitted for review.")}
        onApprove={() => {
          if (run(() => approveAndPublish(template.id, actor), "Version approved and published.")) setSelected(null);
        }}
        onDiscard={() => {
          if (run(() => discardDraft(template.id, actor), "Draft discarded.")) {
            if (template.versions.length === 1) router.push("/platform/assessment-library");
            setSelected(null);
          }
        }}
      />

      {open && viewed === open && checks ? <ChecksBanner checks={checks} /> : null}

      <StatTiles version={viewed} />

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="history">Version History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6">
          <OverviewTab version={viewed} />
        </TabsContent>
        <TabsContent value="items" className="mt-6">
          <ItemsTab
            version={viewed}
            editable={editable}
            onEdit={setQuestion}
            onRemove={(item) => run(() => removeItem(template.id, item.id, actor), `${item.title} removed.`)}
          />
        </TabsContent>
        <TabsContent value="scoring" className="mt-6">
          <ScoringTab version={viewed} audience="BICMAS administrators" />
        </TabsContent>
        <TabsContent value="quality" className="mt-6">
          <QualityTab
            key={`${revision}`}
            quality={template.quality}
            onSave={(quality) => run(() => updateQuality(template.id, quality), "Quality notes saved.")}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-6">
          <HistoryTab versions={template.versions} />
        </TabsContent>
      </Tabs>

      <TemplateFormDialog
        open={editing}
        onOpenChange={setEditing}
        title={`Edit master · v${open?.version ?? ""}`}
        submitLabel="Save changes"
        initial={open ?? undefined}
        onSubmit={(settings) => {
          if (run(() => updateDraft(template.id, settings, actor), "Template settings saved.")) setEditing(false);
        }}
      />
      <QuestionDialog
        open={question !== null}
        onOpenChange={(isOpen) => !isOpen && setQuestion(null)}
        item={question}
        competencies={open?.competencies ?? viewed.competencies}
        onSave={(item) => {
          if (run(() => saveItem(template.id, item, actor), `${item.title} saved.`)) setQuestion(null);
        }}
      />
      <PreviewDialog version={preview} onOpenChange={(isOpen) => !isOpen && setPreview(null)} />
      <CompareDialog open={comparing} onOpenChange={setComparing} versions={template.versions} />
      <ReasonDialog
        action={reasonAction}
        retireDescription="Organisations will no longer be able to copy it. Existing organisation copies and past candidate results are not affected."
        onCancel={() => setReasonAction(null)}
        onConfirm={(reason) => {
          const ok =
            reasonAction === "return"
              ? run(() => returnForChanges(template.id, actor, reason), "Returned to draft with your comments.")
              : run(() => retireTemplate(template.id, actor, reason), "Template retired. Organisations can no longer copy it.");
          if (ok) setReasonAction(null);
        }}
      />
    </div>
  );
}

function ActionBar({
  template,
  viewed,
  actor,
  onEdit,
  onAddQuestion,
  onPreview,
  onCompare,
  onReason,
  onStartVersion,
  onSubmit,
  onApprove,
  onDiscard,
}: {
  template: MasterTemplate;
  viewed: TemplateVersion;
  actor: string;
  onEdit: () => void;
  onAddQuestion: () => void;
  onPreview: () => void;
  onCompare: () => void;
  onReason: (action: ReasonAction) => void;
  onStartVersion: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const open = openVersion(template);
  const live = publishedVersion(template);
  const viewingOpen = open !== null && viewed === open;
  const selfSubmitted = open?.status === "in_review" && open.submittedBy === actor;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" aria-label="Template actions">
        {viewingOpen && open.status === "draft" ? (
          <>
            <Button type="button" variant="secondary" onClick={onEdit}>
              <PencilIcon aria-hidden />
              Edit Master
            </Button>
            <Button type="button" variant="secondary" onClick={onAddQuestion}>
              <PlusIcon aria-hidden />
              Add Question
            </Button>
          </>
        ) : null}
        {!open && live ? (
          <Button type="button" variant="secondary" onClick={onStartVersion}>
            <PencilIcon aria-hidden />
            Edit Master (new version)
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onPreview}>
          <EyeIcon aria-hidden />
          Preview
        </Button>
        <Button type="button" variant="secondary" onClick={onCompare}>
          <GitCompareIcon aria-hidden />
          Compare Versions
        </Button>
        {viewingOpen && open.status === "draft" ? (
          <>
            <Button type="button" onClick={onSubmit}>
              <SendIcon aria-hidden />
              Submit for Review
            </Button>
            <Button type="button" variant="destructive" onClick={onDiscard}>
              <Trash2Icon aria-hidden />
              Discard Draft
            </Button>
          </>
        ) : null}
        {viewingOpen && open.status === "in_review" ? (
          <>
            <Button type="button" variant="accent" disabled={!canApprove(template, actor)} onClick={onApprove}>
              <CheckCircle2Icon aria-hidden />
              Publish New Version
            </Button>
            <Button type="button" variant="secondary" onClick={() => onReason("return")}>
              <Undo2Icon aria-hidden />
              Return for Changes
            </Button>
          </>
        ) : null}
        {!open && live ? (
          <Button type="button" variant="destructive" onClick={() => onReason("retire")}>
            <ArchiveIcon aria-hidden />
            Retire
          </Button>
        ) : null}
      </div>
      {selfSubmitted ? (
        <p className="text-xs text-slate-500">
          You submitted this version, so another BICMAS administrator must approve and publish it.
        </p>
      ) : null}
      {open && !viewingOpen ? (
        <p className="text-xs text-slate-500">
          You are viewing v{viewed.version}, which cannot be changed. Switch to v{open.version} to work on the open version.
        </p>
      ) : null}
    </div>
  );
}

function QualityTab({ quality, onSave }: { quality: QualityNotes; onSave: (quality: QualityNotes) => void }) {
  const [form, setForm] = useState(quality);
  const fields: Array<[keyof QualityNotes, string]> = [
    ["reviewNotes", "Review notes"],
    ["pilotFeedback", "Pilot feedback"],
    ["limitations", "Known limitations"],
  ];
  return (
    <div className="space-y-4 rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
      {fields.map(([key, label]) => (
        <label key={key} className="block text-xs font-bold text-navy">
          {label}
          <Textarea
            className="mt-1 font-normal"
            rows={3}
            value={form[key]}
            onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
          />
        </label>
      ))}
      <Button type="button" onClick={() => onSave(form)}>
        Save quality notes
      </Button>
    </div>
  );
}
