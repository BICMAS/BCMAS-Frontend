"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRightIcon, FileIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { addCapabilityEvidence, evidenceTargets } from "@/features/capability/services/capability";
import { runCapability, useCapabilityUser } from "@/features/capability/use-capability";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addEvidence,
  listGoals,
  listTimeline,
} from "@/features/me/services/portal-state";
import type { TimelineEvent } from "@/features/me/data/portal";
import { cn } from "@/lib/utils";

type Attachment = { key: string; name: string; size: number };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TimelineContent({ event }: { event: TimelineEvent }) {
  return (
    <>
      <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
        {event.when}
      </p>
      <p className="flex items-center gap-1 font-bold text-navy">
        {event.title}
        {event.href ? <ChevronRightIcon className="size-3.5" aria-hidden /> : null}
      </p>
      <p className="text-sm text-slate-500">{event.detail}</p>
    </>
  );
}

export function ProgressTimelineView() {
  const goals = listGoals();
  const [events, setEvents] = useState(() => listTimeline());
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [workDate, setWorkDate] = useState("");
  const user = useCapabilityUser();
  const targets = user ? evidenceTargets(user) : [];
  const target = targets.find((t) => `skill:${t.skillId}` === goalId);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);

  const canSubmit = !pending && title.trim().length > 0 && attachments.length > 0 && (!target || !!workDate);

  return (
    <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[70%_30%]">
      <section className="h-fit rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-navy">Submit Evidence</h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit evidence of your learning and workplace application to
          demonstrate your progress towards your target proficiency level.
        </p>
        <label className="mt-4 block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Linked Growth Area
          <select
            className="mt-2 h-10 w-full rounded-lg border border-border-slate bg-white px-3 text-sm font-bold text-navy"
            value={goalId}
            onChange={(event) => setGoalId(event.target.value)}
          >
            <optgroup label="Development goals">
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </optgroup>
            {targets.length ? (
              <optgroup label="My capability assessment">
                {targets.map((t) => (
                  <option key={t.skillId} value={`skill:${t.skillId}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        {target ? (
          <label className="mt-4 block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            When was the work done?
            <Input type="date" className="mt-2 font-medium normal-case" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
          </label>
        ) : null}
        <label className="mt-4 block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Evidence Title
          <Input
            className="mt-2 font-medium normal-case"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. AI governance policy draft for the payments team"
          />
        </label>
        <div className="mt-4">
          <FileDropzone
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            maxBytes={10 * 1024 * 1024}
            title="Add Practice Artifacts"
            hint="Attach one or more files (PDF, JPG, PNG, DOC). Max size: 10MB per file."
            onFile={(file) =>
              setAttachments((current) => {
                const key = `${file.name}:${file.size}`;
                if (current.some((item) => item.key === key)) return current;
                return [...current, { key, name: file.name, size: file.size }];
              })
            }
            onInvalid={(message) => toast.error(message)}
          />
          {attachments.length > 0 ? (
            <ul className="mt-3 space-y-2" aria-label="Attached files">
              {attachments.map((file) => (
                <li
                  key={file.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-slate px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-navy">
                    <FileIcon className="size-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatSize(file.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-navy"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.key !== file.key),
                      )
                    }
                  >
                    <XIcon className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label className="mt-4 block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Practice Notes
          <Textarea
            className="mt-2 font-medium normal-case"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What did this evidence demonstrate?"
          />
        </label>
        <Button
          type="button"
          className="mt-4 w-full"
          disabled={!canSubmit}
          onClick={async () => {
            const goal = goals.find((item) => item.id === goalId);
            if (!canSubmit || (!goal && !target)) return;
            const fileNames = attachments.map((file) => file.name);
            if (
              user &&
              target &&
              !runCapability(() =>
                addCapabilityEvidence(user, target.assessmentId, target.skillId, { title, notes, workDate, fileNames }),
              )
            ) {
              return;
            }
            setPending(true);
            try {
              await addEvidence({
                title: title.trim(),
                fileNames,
                linkedTo: target ? `${target.name} (capability assessment)` : goal!.title,
                notes: notes.trim(),
              });
              setEvents(listTimeline());
              setTitle("");
              setAttachments([]);
              setNotes("");
              setWorkDate("");
              toast.success("Evidence submitted for review");
            } finally {
              setPending(false);
            }
          }}
        >
          Submit Evidence
        </Button>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold text-navy">Your Growth Journey</h2>
        <ol className="space-y-4 border-l border-border-slate pl-6">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span
                className={cn(
                  "absolute top-1 -left-7.75 size-3 rounded-full border-2 border-white",
                  event.active ? "bg-green-lime" : "bg-navy",
                )}
              />
              {event.href ? (
                <Link
                  href={event.href}
                  className="-mx-2 block rounded-lg px-2 py-1 transition-colors hover:bg-slate-100"
                >
                  <TimelineContent event={event} />
                </Link>
              ) : (
                <TimelineContent event={event} />
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
