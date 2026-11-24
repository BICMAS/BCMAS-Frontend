"use client";

import { useState } from "react";

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

import { candidateView, compareVersions } from "../services/central-library";
import { VERSION_STATUS_LABEL, type TemplateVersion } from "../types";
import { fieldSelectClass } from "./library-shared";

/** Shows the candidate experience one question at a time, built from the key-free candidate view. */
export function PreviewDialog({
  version,
  onOpenChange,
}: {
  version: TemplateVersion | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={version !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {version ? <PreviewBody key={`${version.version}`} version={version} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({ version, onClose }: { version: TemplateVersion; onClose: () => void }) {
  const view = candidateView(version);
  const [index, setIndex] = useState(-1);
  const item = index >= 0 ? view.items[index] : undefined;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Candidate preview: {view.name}</DialogTitle>
        <DialogDescription>
          v{version.version} · This is what candidates see. Answer keys and rubrics are never sent to them.
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-48 rounded-xl border border-border-slate bg-slate-50 p-5">
        {index < 0 ? (
          <div className="space-y-2 text-sm text-navy">
            <p className="text-lg font-bold">Welcome to your assessment</p>
            <p>
              {view.items.length} questions · about {view.durationMinutes} minutes. Answer each question on your own. Your
              answers are saved as you go.
            </p>
          </div>
        ) : item ? (
          <div className="space-y-3">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Question {index + 1} of {view.items.length}
            </p>
            <p className="font-semibold text-navy">{item.text}</p>
            {item.responseType === "case_response" ? (
              <Textarea rows={4} placeholder="Candidate writes their answer here" disabled />
            ) : (
              <ul className="space-y-2">
                {item.options.map((option) => (
                  <li key={option.id} className="rounded-lg border border-border-slate bg-white px-3 py-2 text-sm text-navy">
                    {option.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={index < 0} onClick={() => setIndex((i) => i - 1)}>
          Previous
        </Button>
        {index < view.items.length - 1 ? (
          <Button type="button" onClick={() => setIndex((i) => i + 1)}>
            {index < 0 ? "Start preview" : "Next"}
          </Button>
        ) : (
          <Button type="button" onClick={onClose}>
            Close preview
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

export function CompareDialog({
  open,
  onOpenChange,
  versions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: TemplateVersion[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open ? <CompareBody versions={versions} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CompareBody({ versions }: { versions: TemplateVersion[] }) {
  const [from, setFrom] = useState(versions[Math.max(0, versions.length - 2)]?.version ?? "");
  const [to, setTo] = useState(versions[versions.length - 1]?.version ?? "");
  const a = versions.find((v) => v.version === from);
  const b = versions.find((v) => v.version === to);
  const diffs = a && b ? compareVersions(a, b) : [];
  const label = (v: TemplateVersion) => `v${v.version} · ${VERSION_STATUS_LABEL[v.status]}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Compare versions</DialogTitle>
        <DialogDescription>See what changed between two versions of this template.</DialogDescription>
      </DialogHeader>
      {versions.length < 2 ? (
        <p className="text-sm text-slate-500">This template has only one version so far.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-navy">
              From
              <select className={fieldSelectClass} value={from} onChange={(e) => setFrom(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-navy">
              To
              <select className={fieldSelectClass} value={to} onChange={(e) => setTo(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {from === to ? (
            <p className="text-sm text-slate-500">Choose two different versions.</p>
          ) : diffs.length === 0 ? (
            <p className="text-sm text-slate-500">No differences.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Differences">
              <thead className="text-[10px] tracking-widest text-slate-400 uppercase">
                <tr>
                  <th className="py-2">Field</th>
                  <th className="py-2">v{from}</th>
                  <th className="py-2">v{to}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-slate">
                {diffs.map((d) => (
                  <tr key={d.field + d.to}>
                    <td className="py-2 pr-3 font-bold text-navy">{d.field}</td>
                    <td className="py-2 pr-3 text-slate-500">{d.from}</td>
                    <td className="py-2 text-navy">{d.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
