"use client";

import { useState } from "react";
import { toast } from "sonner";

import { FileDropzone } from "@/components/shared/file-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  addEvidence,
  listGoals,
  listTimeline,
} from "@/features/me/services/portal-state";
import { cn } from "@/lib/utils";

export function ProgressTimelineView() {
  const goals = listGoals();
  const [events, setEvents] = useState(() => listTimeline());
  const [goalId, setGoalId] = useState(goals[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[70%_30%]">
      <section className="h-fit rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-navy">Submit Evidence</h1>
        <label className="mt-4 block text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          Linked Growth Area
          <select
            className="mt-2 h-10 w-full rounded-lg border border-border-slate bg-white px-3 text-sm font-bold text-navy"
            value={goalId}
            onChange={(event) => setGoalId(event.target.value)}
          >
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4">
          <FileDropzone
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            maxBytes={10 * 1024 * 1024}
            title="Add Practice Artifacts"
            hint="Upload files (PDF, JPG, PNG). Max size: 10MB per file."
            selectedName={fileName}
            onFile={(file) => setFileName(file.name)}
            onInvalid={(message) => toast.error(message)}
          />
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
          disabled={pending || !fileName}
          onClick={async () => {
            const goal = goals.find((item) => item.id === goalId);
            if (!fileName || !goal) return;
            setPending(true);
            try {
              await addEvidence({
                fileName,
                linkedTo: goal.title,
                notes: notes.trim(),
              });
              setEvents(listTimeline());
              setFileName(null);
              setNotes("");
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
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                {event.when}
              </p>
              <p className="font-bold text-navy">{event.title}</p>
              <p className="text-sm text-slate-500">{event.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
