"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FileDropzone } from "@/components/shared/file-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MockUser } from "@/types/user";

import { addCapabilityEvidence } from "../services/capability";
import { isRecent } from "../services/scoring";
import type { AssessmentItem } from "../types";
import { formatDay, runCapability } from "../use-capability";

export function EvidenceList({ item }: { item: AssessmentItem }) {
  if (!item.evidence.length) return <p className="text-xs text-slate-500">No evidence added.</p>;
  return (
    <ul className="space-y-2" aria-label={`Evidence for ${item.name}`}>
      {item.evidence.map((e) => (
        <li key={e.id} className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
            {e.title}
            {isRecent(e) ? null : <Badge variant="warning">Over 12 months old</Badge>}
          </p>
          <p className="text-xs text-slate-500">
            {e.fileNames.join(", ")} · work done {formatDay(e.workDate)}
          </p>
          {e.notes ? <p className="mt-1 text-sm text-slate-600">{e.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function EvidenceForm({
  user,
  assessmentId,
  item,
  onDone,
}: {
  user: MockUser;
  assessmentId: string;
  item: AssessmentItem;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  return (
    <form
      className="space-y-3 rounded-xl border border-border-slate p-4"
      aria-label={`Add evidence for ${item.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (runCapability(() => addCapabilityEvidence(user, assessmentId, item.skillId, { title, notes, workDate, fileNames: files }), "Evidence added")) onDone();
      }}
    >
      <p className="text-xs text-slate-500">
        Use your own recent work (last 12 months) that shows this skill. Several examples are stronger than one.
      </p>
      <label className="block text-xs font-bold text-navy">
        Title
        <Input className="mt-1 font-normal" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block text-xs font-bold text-navy">
        When was the work done?
        <Input className="mt-1 font-normal" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
      </label>
      <FileDropzone
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        maxBytes={10 * 1024 * 1024}
        title="Attach files"
        hint="PDF, JPG, PNG or DOC, up to 10MB each."
        onFile={(file) => setFiles((list) => (list.includes(file.name) ? list : [...list, file.name]))}
        onInvalid={(message) => toast.error(message)}
      />
      {files.length ? (
        <ul className="space-y-1" aria-label="Attached files">
          {files.map((name) => (
            <li key={name} className="flex items-center justify-between rounded-lg border border-border-slate px-3 py-1 text-sm text-navy">
              {name}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => setFiles((list) => list.filter((f) => f !== name))}>
                <XIcon className="size-4 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="block text-xs font-bold text-navy">
        What does it show? (optional)
        <Textarea className="mt-1 font-normal" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!title.trim() || !workDate || !files.length}>
          Add evidence
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Evidence with an "Add evidence" button that opens the form. */
export function EvidenceSection({ user, assessmentId, item, canAdd }: { user: MockUser; assessmentId: string; item: AssessmentItem; canAdd: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-2">
      <EvidenceList item={item} />
      {!canAdd ? null : adding ? (
        <EvidenceForm user={user} assessmentId={assessmentId} item={item} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)} aria-label={`Add evidence for ${item.name}`}>
          Add evidence
        </Button>
      )}
    </div>
  );
}
