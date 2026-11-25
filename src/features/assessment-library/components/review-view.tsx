"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  EyeIcon,
  GitCompareIcon,
  Undo2Icon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { UserPortal } from "@/types";

import {
  approveOrgVersion,
  canApproveOrgAssessments,
  getOrgAssessment,
  returnOrgVersion,
  reviewItem,
} from "../services/org-library";
import { FLAG_LABEL, reviewFlags, reviewProgress, type ReviewFlag } from "../services/review";
import { openVersion, publishedVersion } from "../services/versioning";
import {
  ASSESSMENT_TYPE_LABEL,
  DIFFICULTY_LABEL,
  RESPONSE_TYPE_LABEL,
  type ItemReview,
  type TemplateItem,
  type TemplateVersion,
} from "../types";
import { formatDateTime } from "./library-shared";
import { OrgLibraryGate, useOrgLibraryRevision } from "./org-shared";
import { CompareDialog, PreviewDialog } from "./preview-compare-dialogs";
import { OverviewTab, ReasonDialog, runCommand as run, type ReasonAction } from "./template-tabs";

export function ReviewView({ assessmentId }: { assessmentId: string }) {
  return <OrgLibraryGate approvers>{(ctx) => <Review assessmentId={assessmentId} {...ctx} />}</OrgLibraryGate>;
}

type CommentAction = { item: TemplateItem; decision: "returned" | "rejected" } | null;

const DECISION_BADGE: Record<ItemReview["decision"], { label: string; variant: "success" | "warning" | "error" }> = {
  approved: { label: "Approved", variant: "success" },
  returned: { label: "Needs edit", variant: "warning" },
  rejected: { label: "Rejected", variant: "error" },
};

function Review({ assessmentId, organisationId, actor, portal }: { assessmentId: string; organisationId: string; actor: string; portal: UserPortal }) {
  const router = useRouter();
  const revision = useOrgLibraryRevision();
  const assessment = useMemo(() => {
    void revision;
    return getOrgAssessment(organisationId, assessmentId);
  }, [organisationId, assessmentId, revision]);
  const [tab, setTab] = useState("summary");
  const [commenting, setCommenting] = useState<CommentAction>(null);
  const [reasonAction, setReasonAction] = useState<ReasonAction>(null);
  const [preview, setPreview] = useState<TemplateVersion | null>(null);
  const [comparing, setComparing] = useState(false);

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

  const approver = canApproveOrgAssessments(portal);
  // The HR Admin reviews from Assessment Approvals; the library itself is the HRBPs'.
  const backHref = approver ? "/talent/approvals" : `/talent/library/${assessment.id}`;
  const open = openVersion(assessment);
  if (!open || open.status !== "in_review") {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Link href={backHref} className="text-xs font-bold text-slate-500 hover:underline">
          ← Back to the assessment
        </Link>
        <h1 className="text-3xl font-bold text-navy">Assessment Review &amp; Approval</h1>
        <p className="text-sm text-slate-500">Nothing is waiting for review on this assessment.</p>
      </div>
    );
  }

  const version = open;
  const live = publishedVersion(assessment);
  const ownSubmission = version.submittedBy === actor;
  const canDecide = approver && !ownSubmission;
  const flags = reviewFlags(version);
  const progress = reviewProgress(version);
  const submittedAt = [...version.history].reverse().find((e) => e.action === "Submitted for review")?.at;
  const decide = (item: TemplateItem, decision: ItemReview["decision"], comment = "") =>
    run(
      () => reviewItem(organisationId, assessment.id, item.id, decision, comment, actor, portal),
      decision === "approved" ? `${item.id.toUpperCase()} approved.` : decision === "returned" ? `${item.id.toUpperCase()} returned for changes.` : `${item.id.toUpperCase()} rejected.`,
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={backHref} className="text-xs font-bold text-slate-500 hover:underline">
        ← {version.name}
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Assessment Review &amp; Approval</h1>
        <p className="mt-1 text-sm text-slate-500">
          {version.name} · v{version.version} · {ASSESSMENT_TYPE_LABEL[version.assessmentType]} · submitted by{" "}
          {version.submittedBy ?? "—"} {submittedAt ? `on ${formatDateTime(submittedAt)}` : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Review every item and its scoring. Candidates only receive an assessment after the whole version is approved.
        </p>
      </div>

      {!approver ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">
          Waiting for an HR Admin to review and approve this version. You can view it but not approve it.
        </p>
      ) : ownSubmission ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">
          You submitted this version, so another HR Admin must review it. You can view it but not approve it.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Total items", String(version.items.length)],
          ["Competencies", String(version.competencies.length)],
          ["Warnings", String(flags.length)],
          ["Duration", `${version.durationMinutes} min`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border-slate bg-white p-4" aria-label="Review progress">
        <p className="text-sm font-semibold text-navy">
          {progress.approved} of {progress.total} items approved
          <span className="font-normal text-slate-500">
            {" "}
            · {progress.pending} pending · {progress.returned} need edits · {progress.rejected} rejected
          </span>
        </p>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-green-lime" style={{ width: `${(progress.approved / Math.max(1, progress.total)) * 100}%` }} />
          <div className="bg-amber-400" style={{ width: `${(progress.returned / Math.max(1, progress.total)) * 100}%` }} />
          <div className="bg-red-400" style={{ width: `${(progress.rejected / Math.max(1, progress.total)) * 100}%` }} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="preview">Candidate Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6 space-y-4">
          <FlagList flags={flags} />
          {version.history.some((e) => e.action === "Returned for changes") ? (
            <p className="text-xs text-slate-500">This version was returned for changes before. See its history on the assessment page.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="items" className="mt-6">
          <ul className="space-y-3" aria-label="Items to review">
            {version.items.map((item) => (
              <ReviewItemCard
                key={item.id}
                item={item}
                review={version.itemReviews?.[item.id]}
                flags={flags.filter((f) => f.itemId === item.id)}
                canDecide={canDecide}
                onApprove={() => decide(item, "approved")}
                onReturn={() => setCommenting({ item, decision: "returned" })}
                onReject={() => setCommenting({ item, decision: "rejected" })}
              />
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="coverage" className="mt-6">
          <OverviewTab version={version} />
        </TabsContent>

        <TabsContent value="preview" className="mt-6 space-y-3">
          <p className="text-sm text-slate-500">
            See exactly what candidates will see. Answer keys and rubrics are never sent to candidate screens.
          </p>
          <Button type="button" variant="secondary" onClick={() => setPreview(version)}>
            <EyeIcon aria-hidden />
            Open candidate preview
          </Button>
        </TabsContent>
      </Tabs>

      {canDecide ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" aria-label="Review actions">
            <Button type="button" variant="secondary" onClick={() => setReasonAction("return")}>
              <Undo2Icon aria-hidden />
              Return for Changes
            </Button>
            <Button type="button" variant="secondary" disabled={!live} onClick={() => setComparing(true)}>
              <GitCompareIcon aria-hidden />
              Compare{live ? ` with v${live.version}` : ""}
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={!progress.readyToApprove}
              onClick={() => {
                if (run(() => approveOrgVersion(organisationId, assessment.id, actor, portal), "Assessment approved and published. It can now be assigned to vacancies.")) {
                  router.push(backHref);
                }
              }}
            >
              <CheckCircle2Icon aria-hidden />
              Approve and Publish
            </Button>
          </div>
          {!progress.readyToApprove ? (
            <p className="text-xs text-slate-500">
              {progress.pending
                ? `Approve every item to publish (${progress.pending} still pending).`
                : progress.returned || progress.rejected
                  ? "Items were returned or rejected. Use Return for Changes so the author can fix them."
                  : "Fix incomplete scoring before approving."}
            </p>
          ) : null}
        </div>
      ) : null}

      <CommentDialog
        action={commenting}
        onCancel={() => setCommenting(null)}
        onConfirm={(comment) => {
          if (commenting && decide(commenting.item, commenting.decision, comment)) setCommenting(null);
        }}
      />
      <ReasonDialog
        action={reasonAction}
        retireDescription=""
        onCancel={() => setReasonAction(null)}
        onConfirm={(reason) => {
          if (run(() => returnOrgVersion(organisationId, assessment.id, actor, reason, portal), "Returned to the author with your comments.")) {
            setReasonAction(null);
            router.push(backHref);
          }
        }}
      />
      <PreviewDialog version={preview} onOpenChange={(isOpen) => !isOpen && setPreview(null)} />
      <CompareDialog open={comparing} onOpenChange={setComparing} versions={assessment.versions} />
    </div>
  );
}

function FlagList({ flags }: { flags: ReviewFlag[] }) {
  if (flags.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border-slate bg-white p-5 text-sm text-navy">
        <CheckCircle2Icon className="size-4 text-green-deep" aria-hidden />
        No warnings: every competency is covered, scoring is complete and no duplicates or unclear wording were found.
      </p>
    );
  }
  const kinds = Object.keys(FLAG_LABEL) as ReviewFlag["kind"][];
  return (
    <section className="rounded-xl border border-warning/40 bg-warning-soft p-5 text-sm text-warning-soft-foreground" aria-label="Warnings">
      <p className="font-bold">
        {flags.length} warning{flags.length === 1 ? "" : "s"} to check
      </p>
      {kinds.map((kind) => {
        const ofKind = flags.filter((f) => f.kind === kind);
        if (!ofKind.length) return null;
        return (
          <div key={kind} className="mt-2">
            <p className="font-semibold">{FLAG_LABEL[kind]}</p>
            <ul className="list-disc pl-5">
              {ofKind.map((f) => (
                <li key={f.message}>{f.message}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function ReviewItemCard({
  item,
  review,
  flags,
  canDecide,
  onApprove,
  onReturn,
  onReject,
}: {
  item: TemplateItem;
  review?: ItemReview;
  flags: ReviewFlag[];
  canDecide: boolean;
  onApprove: () => void;
  onReturn: () => void;
  onReject: () => void;
}) {
  const badge = review ? DECISION_BADGE[review.decision] : null;
  return (
    <li className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-navy">
              {item.id.toUpperCase()} – {item.title}
            </p>
            {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : <Badge variant="secondary">Pending</Badge>}
            {item.origin?.kind === "ai" ? <Badge variant="warning">AI draft</Badge> : null}
          </div>
          <p className="text-xs text-slate-500">
            {item.competency}
            {item.level ? ` · level ${item.level}` : ""} · {DIFFICULTY_LABEL[item.difficulty]} · {RESPONSE_TYPE_LABEL[item.responseType]} · Source:{" "}
            {item.origin ? item.origin.source : "written by your organisation"}
          </p>
          <p className="text-sm text-navy">{item.text}</p>
          {item.responseType === "case_response" ? (
            <ol className="space-y-0.5 text-xs text-slate-600" aria-label="Scoring rubric">
              {(item.scoring.rubric ?? []).map((level) => (
                <li key={level.score}>
                  <span className="font-bold text-navy">{level.score}</span> – {level.descriptor}
                </li>
              ))}
            </ol>
          ) : (
            <ul className="space-y-0.5 text-xs text-slate-600" aria-label="Answer options">
              {item.options.map((o) => (
                <li key={o.id} className={o.id === item.scoring.correctOptionId ? "font-semibold text-navy" : undefined}>
                  {o.id === item.scoring.correctOptionId ? (
                    <CheckIcon className="mr-1 inline size-3 text-green-deep" aria-label="Keyed answer" />
                  ) : (
                    "• "
                  )}
                  {o.text}
                </li>
              ))}
            </ul>
          )}
          {flags.map((f) => (
            <p key={f.message} className="flex items-center gap-1.5 text-xs font-semibold text-warning-soft-foreground">
              <AlertTriangleIcon className="size-3.5" aria-hidden />
              {FLAG_LABEL[f.kind]}: {f.message}
            </p>
          ))}
          {review ? (
            <p className="text-xs text-slate-500">
              {badge?.label} by {review.reviewer} · {formatDateTime(review.at)}
              {review.comment ? ` — "${review.comment}"` : ""}
            </p>
          ) : null}
        </div>
        {canDecide ? (
          <div className="flex shrink-0 gap-1 lg:flex-col">
            <Button type="button" size="sm" variant="accent" onClick={onApprove} aria-label={`Approve ${item.id.toUpperCase()}`}>
              <CheckIcon aria-hidden />
              Approve Item
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onReturn} aria-label={`Return ${item.id.toUpperCase()}`}>
              <Undo2Icon aria-hidden />
              Return
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={onReject} aria-label={`Reject ${item.id.toUpperCase()}`}>
              <XCircleIcon aria-hidden />
              Reject Item
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function CommentDialog({
  action,
  onCancel,
  onConfirm,
}: {
  action: CommentAction;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState("");
  const reject = action?.decision === "rejected";
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setComment("");
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {reject ? "Reject" : "Return"} {action?.item.id.toUpperCase()} – {action?.item.title}
          </DialogTitle>
          <DialogDescription>
            {reject
              ? "Rejected items must be removed or replaced before the assessment can be approved."
              : "The author will see your comment and edit the item."}
          </DialogDescription>
        </DialogHeader>
        <label className="text-xs font-bold text-navy">
          {reject ? "Why is it rejected?" : "What needs to change?"}
          <Textarea className="mt-1 font-normal" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={reject ? "destructive" : "default"}
            disabled={!comment.trim()}
            onClick={() => {
              onConfirm(comment);
              setComment("");
            }}
          >
            {reject ? "Reject item" : "Return item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
