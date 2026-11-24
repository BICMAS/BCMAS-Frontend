"use client";

import { useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";

import { LibraryError } from "../services/versioning";
import {
  ASSESSMENT_TYPE_LABEL,
  DIFFICULTY_LABEL,
  RESPONSE_TYPE_LABEL,
  type ItemReview,
  type TemplateItem,
  type TemplateVersion,
  type VersionStatus,
} from "../types";
import { VersionBadge, formatDateTime } from "./library-shared";

/** Runs a library command and reports the result; returns true on success. */
export function runCommand(fn: () => void, success: string) {
  try {
    fn();
    toast.success(success);
    return true;
  } catch (error) {
    toast.error(error instanceof LibraryError ? error.message : "Something went wrong. Please try again.");
    return false;
  }
}

/** Submission blockers and coverage warnings for the open version. */
export function ChecksBanner({ checks }: { checks: { problems: string[]; warnings: string[] } }) {
  if (!checks.problems.length && !checks.warnings.length) return null;
  return (
    <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
      <p className="font-bold">Before this version can be submitted</p>
      <ul className="mt-1 list-disc pl-5">
        {checks.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
        {checks.warnings.map((w) => (
          <li key={w}>Coverage: {w}</li>
        ))}
      </ul>
    </div>
  );
}

export function StatTiles({ version }: { version: TemplateVersion }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[
        ["Questions", String(version.items.length)],
        ["Competencies", String(version.competencies.length)],
        ["Estimated time", `${version.durationMinutes} min`],
        ["Target proficiency", version.targetProficiency],
      ].map(([label, value]) => (
        <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
          <p className="text-2xl font-bold text-navy">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      ))}
    </div>
  );
}

export function OverviewTab({ version }: { version: TemplateVersion }) {
  const byCompetency = version.competencies.map((c) => ({
    competency: c,
    count: version.items.filter((item) => item.competency === c).length,
  }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Purpose</h2>
        <p className="mt-2 text-sm text-slate-600">{version.purpose || "—"}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <dt className="text-slate-500">Assessment type</dt>
          <dd className="font-semibold text-navy">{ASSESSMENT_TYPE_LABEL[version.assessmentType]}</dd>
          <dt className="text-slate-500">Role family</dt>
          <dd className="font-semibold text-navy">{version.roleFamily}</dd>
          <dt className="text-slate-500">Target proficiency</dt>
          <dd className="font-semibold text-navy">{version.targetProficiency}</dd>
          <dt className="text-slate-500">Estimated duration</dt>
          <dd className="font-semibold text-navy">{version.durationMinutes} minutes</dd>
        </dl>
      </section>
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Competency coverage</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {byCompetency.map(({ competency, count }) => (
            <li key={competency} className="flex items-center justify-between">
              <span className="text-navy">{competency}</span>
              <span className={count ? "font-bold text-navy" : "font-bold text-warning-soft-foreground"}>
                {count ? `${count} question${count > 1 ? "s" : ""}` : "Not covered"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** AI-generated items stay labelled "AI draft" until their version is approved. */
function OriginBadge({ item, live }: { item: TemplateItem; live: boolean }) {
  if (!item.origin) return null;
  const label = item.origin.kind === "ai" ? (live ? "AI-assisted" : "AI draft") : "From template";
  return (
    <Badge variant={item.origin.kind === "ai" && !live ? "warning" : "secondary"} className="ml-2 align-middle">
      {label}
    </Badge>
  );
}

export function ItemsTab({
  version,
  editable,
  onEdit,
  onRemove,
  reviews,
}: {
  version: TemplateVersion;
  editable: boolean;
  /** Approver decisions to show the author (returned / rejected items with comments). */
  reviews?: Record<string, ItemReview>;
  onEdit?: (item: TemplateItem) => void;
  onRemove?: (item: TemplateItem) => void;
}) {
  if (version.items.length === 0) {
    return (
      <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">
        No questions yet. Use Add Question.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Question</th>
            <th className="px-4 py-3">Competency</th>
            <th className="px-4 py-3">Difficulty</th>
            <th className="px-4 py-3">Response</th>
            {editable ? <th className="px-4 py-3 text-right">Actions</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-slate">
          {version.items.map((item) => (
            <tr key={item.id}>
              <td className="px-4 py-3 font-bold whitespace-nowrap text-navy">
                {item.id.toUpperCase()} – {item.title}
                <OriginBadge item={item} live={version.status === "published"} />
              </td>
              <td className="max-w-md px-4 py-3 text-slate-600">
                {item.text}
                {item.origin ? (
                  <span className="mt-1 block text-[10px] text-slate-400">
                    Source: {item.origin.source}
                    {item.origin.kind === "ai"
                      ? ` · ${item.origin.model} (${item.origin.promptVersion}) · ${formatDateTime(item.origin.generatedAt)}`
                      : ""}
                  </span>
                ) : null}
                {reviews?.[item.id] && reviews[item.id]!.decision !== "approved" ? (
                  <span className="mt-1 block text-xs font-semibold text-warning-soft-foreground">
                    {reviews[item.id]!.decision === "rejected" ? "Rejected" : "Returned"} by {reviews[item.id]!.reviewer}:{" "}
                    {reviews[item.id]!.comment}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">{item.competency}</td>
              <td className="px-4 py-3">{DIFFICULTY_LABEL[item.difficulty]}</td>
              <td className="px-4 py-3">{RESPONSE_TYPE_LABEL[item.responseType]}</td>
              {editable ? (
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onEdit?.(item)} aria-label={`Edit ${item.title}`}>
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRemove?.(item)} aria-label={`Remove ${item.title}`}>
                    Remove
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScoringTab({ version, audience }: { version: TemplateVersion; audience: string }) {
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info-soft-foreground">
        Answer keys and rubrics are visible to {audience} only and are never sent to candidate screens.
      </p>
      {version.items.map((item) => {
        const keyed = item.options.find((o) => o.id === item.scoring.correctOptionId);
        return (
          <article key={item.id} className="rounded-xl border border-border-slate bg-white p-4">
            <p className="font-bold text-navy">
              {item.id.toUpperCase()} – {item.title}{" "}
              <span className="font-normal text-slate-500">
                · {item.scoring.points} point{item.scoring.points === 1 ? "" : "s"}
              </span>
            </p>
            {item.responseType === "case_response" ? (
              <ol className="mt-2 space-y-1 text-sm text-slate-600">
                {(item.scoring.rubric ?? []).map((level) => (
                  <li key={level.score}>
                    <span className="font-bold text-navy">{level.score}</span> – {level.descriptor}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                Keyed answer: <span className="font-semibold text-navy">{keyed?.text ?? "Not set"}</span>
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function HistoryTab({
  versions,
  statusLabel,
}: {
  versions: TemplateVersion[];
  statusLabel?: (status: VersionStatus) => string;
}) {
  return (
    <ol className="space-y-4">
      {[...versions].reverse().map((v) => (
        <li key={v.version} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <VersionBadge status={v.status} version={v.version} label={statusLabel?.(v.status)} />
            <span className="text-xs text-slate-500">
              Created by {v.createdBy}
              {v.submittedBy ? ` · submitted by ${v.submittedBy}` : ""}
              {v.reviewedBy ? ` · approved by ${v.reviewedBy}` : ""}
              {v.publishedAt ? ` · live from ${formatDateTime(v.publishedAt)}` : ""}
            </span>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {[...v.history].reverse().map((e) => (
              <li key={e.id} className="text-slate-600">
                <span className="font-semibold text-navy">{e.action}</span> · {e.actor} · {formatDateTime(e.at)}
                {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export type ReasonAction = "return" | "retire" | null;

export function ReasonDialog({
  action,
  retireDescription,
  onCancel,
  onConfirm,
}: {
  action: ReasonAction;
  retireDescription: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const retire = action === "retire";
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setReason("");
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{retire ? "Retire" : "Return for changes"}</DialogTitle>
          <DialogDescription>
            {retire ? retireDescription : "The version goes back to draft. Your comments are saved in its history."}
          </DialogDescription>
        </DialogHeader>
        <label className="text-xs font-bold text-navy">
          {retire ? "Reason for retiring" : "What needs to change"}
          <Textarea className="mt-1 font-normal" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={retire ? "destructive" : "default"}
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason);
              setReason("");
            }}
          >
            {retire ? "Retire" : "Return to draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
