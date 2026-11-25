"use client";

import type { CvEvidenceStatus } from "@ai/contracts";
import {
  DownloadIcon,
  FileSearchIcon,
  FileTextIcon,
  FlagIcon,
  MailIcon,
  NotebookPenIcon,
  SparklesIcon,
  UserCheckIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AiDisclaimer, AiInlineError } from "@/features/ai/components/shared/ai-states";
import { useAiAction } from "@/features/ai/hooks/use-ai-query";

import {
  addNote,
  completeHumanReview,
  cvRequirements,
  flagExtractionIssue,
  getCandidate,
  markForHumanReview,
  replaceCvText,
  saveCvAnalysis,
} from "../services/candidates";
import { cvFileFor } from "../services/cv-text";
import { attemptFor, inviteToAssessment, resendInvitation } from "../services/delivery";
import { interviewEligibility, interviewFor, inviteToInterview, resendInterview } from "../services/interview";
import { getVacancy, listOutbox } from "../services/vacancies";
import { HM_DECISION_LABEL, STAGE_LABEL } from "../types";
import { AssessmentResults } from "./assessment-results";
import { InterviewResults } from "./interview-results";
import { StageBadge } from "./candidate-list-view";
import { ProposedOutcome } from "./outcome-and-time";
import { HrbpGate, formatDateTime, runAction, useRecruitmentRevision } from "./recruitment-shared";

const STATUS: Record<CvEvidenceStatus, { label: string; variant: "success" | "warning" | "secondary" }> = {
  found: { label: "Evidence found", variant: "success" },
  unclear: { label: "Unclear", variant: "warning" },
  not_found: { label: "Not found", variant: "secondary" },
};

type DialogKind = "cv" | "note" | "review" | "complete_review" | "extraction" | null;

export function CandidateProfileView({ candidateId }: { candidateId: string }) {
  return <HrbpGate>{(ctx) => <CandidateProfile candidateId={candidateId} {...ctx} />}</HrbpGate>;
}

function CandidateProfile({ candidateId, organisationId, actor }: { candidateId: string; organisationId: string; actor: string }) {
  const revision = useRecruitmentRevision();
  const candidate = useMemo(() => {
    void revision;
    return getCandidate(organisationId, candidateId);
  }, [organisationId, candidateId, revision]);
  const [tab, setTab] = useState("summary");
  const [dialog, setDialog] = useState<DialogKind>(null);
  const analyse = useAiAction((client, request: Parameters<typeof client.analyzeCv>[0]) => client.analyzeCv(request));

  if (!candidate) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This candidate is not in your organisation.</p>
        <Link href="/talent/candidates" className="text-sm font-bold text-navy hover:underline">
          ← Candidate Management
        </Link>
      </div>
    );
  }

  const vacancy = getVacancy(organisationId, candidate.vacancyId);
  const requirements = vacancy ? cvRequirements(vacancy) : null;
  const analysis = candidate.cvAnalysis?.result ?? null;
  const emails = listOutbox(organisationId).filter((e) => e.applicationId === candidate.id);
  const original = cvFileFor(candidate.id);
  const attempt = attemptFor(organisationId, candidate.id);
  const usesAssessment = !!vacancy?.stages.assessment.enabled;
  const interview = interviewFor(organisationId, candidate.id);
  const canInvite = interviewEligibility(organisationId, candidate.id);

  async function runAnalysis() {
    if (!candidate?.cvText || !requirements) return;
    const result = await analyse.run({ role_title: requirements.roleTitle, requirements: requirements.requirements, cv_text: candidate.cvText });
    if (result && runAction(() => saveCvAnalysis(organisationId, candidate.id, result, actor), "CV analysis saved.")) {
      setTab("evidence");
    }
  }

  function downloadCv() {
    if (!candidate) return;
    const blob = original ?? (candidate.cvText ? new Blob([candidate.cvText], { type: "text/plain" }) : null);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = original ? candidate.cv.fileName : `${candidate.reference}-cv-text.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/talent/candidates" className="text-xs font-bold text-slate-500 hover:underline">
        ← Candidate Management
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-navy">{candidate.fullName}</h1>
        <p className="text-sm text-slate-500">
          {candidate.email}
          {candidate.phone ? ` · ${candidate.phone}` : ""} · {candidate.reference} · applied {formatDateTime(candidate.submittedAt)} for{" "}
          {vacancy ? (
            <Link href={`/talent/vacancies/${vacancy.id}`} className="font-semibold text-navy hover:underline">
              {vacancy.title}
            </Link>
          ) : (
            candidate.vacancyTitle
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={candidate.stage} />
          {candidate.possibleDuplicateOf ? <Badge variant="warning">Possible duplicate application</Badge> : null}
          {candidate.extractionIssue ? <Badge variant="warning">CV extraction issue</Badge> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Candidate actions">
        <Button type="button" disabled={!candidate.cvText || !requirements || analyse.pending} onClick={runAnalysis}>
          <SparklesIcon aria-hidden />
          {analyse.pending ? "Analysing…" : analysis ? "Re-run CV Analysis" : "Run CV Analysis"}
        </Button>
        {usesAssessment && !attempt ? (
          <Button
            type="button"
            variant="accent"
            onClick={() => {
              if (runAction(() => inviteToAssessment(organisationId, candidate.id, actor), `Assessment invitation sent to ${candidate.email}.`)) {
                setTab("assessment");
              }
            }}
          >
            <MailIcon aria-hidden />
            Send Assessment Invitation
          </Button>
        ) : null}
        {attempt && attempt.status !== "submitted" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              runAction(() => resendInvitation(organisationId, candidate.id, actor), `New assessment link sent to ${candidate.email}. The old link no longer works.`)
            }
          >
            <MailIcon aria-hidden />
            Resend Invitation
          </Button>
        ) : null}
        {canInvite.ok ? (
          <Button
            type="button"
            variant="accent"
            onClick={() => {
              if (runAction(() => inviteToInterview(organisationId, candidate.id, actor), "Interview invitation sent to " + candidate.email + ".")) {
                setTab("interview");
              }
            }}
          >
            <MailIcon aria-hidden />
            Send Interview Invitation
          </Button>
        ) : null}
        {interview && interview.status !== "submitted" ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              runAction(() => resendInterview(organisationId, candidate.id, actor), "New interview link sent to " + candidate.email + ". The old link no longer works.")
            }
          >
            <MailIcon aria-hidden />
            Resend Interview Invitation
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={!candidate.cvText} onClick={() => setDialog("cv")}>
          <FileTextIcon aria-hidden />
          View CV
        </Button>
        <Button type="button" variant="secondary" disabled={!original && !candidate.cvText} onClick={downloadCv}>
          <DownloadIcon aria-hidden />
          Download CV
        </Button>
        <Button type="button" variant="secondary" onClick={() => setDialog("note")}>
          <NotebookPenIcon aria-hidden />
          Add HR Note
        </Button>
        {candidate.proposedOutcome ? null : candidate.stage === "human_review" ? (
          <Button type="button" variant="secondary" onClick={() => setDialog("complete_review")}>
            <UserCheckIcon aria-hidden />
            Complete Human Review
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setDialog("review")}>
            <UserCheckIcon aria-hidden />
            Mark for Human Review
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={() => setDialog("extraction")}>
          <FlagIcon aria-hidden />
          Flag Extraction Issue
        </Button>
      </div>
      <AiInlineError error={analyse.error} />
      <ProposedOutcome candidate={candidate} organisationId={organisationId} actor={actor} />
      {!candidate.cvText ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          No text could be read from this CV (for example a scanned PDF). Use Flag Extraction Issue to record the problem
          and paste the CV text so it can be analysed.
        </p>
      ) : null}
      {!requirements ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          The vacancy&apos;s role profile is not approved, so there is nothing to compare the CV with.
        </p>
      ) : null}

      {analysis ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Evidence coverage", `${analysis.coverage_pct}%`],
            ["Evidence found", String(analysis.evidence_found)],
            ["Unclear", String(analysis.unclear)],
            ["Not found", String(analysis.not_found)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
              <p className="text-2xl font-bold text-navy">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="evidence">CV Evidence</TabsTrigger>
          <TabsTrigger value="role">Role Match</TabsTrigger>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="interview">Interview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6 space-y-4">
          {analysis ? (
            <>
              <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
                <h2 className="font-bold text-navy">CV analysis summary</h2>
                <p className="mt-2 text-sm text-navy">{analysis.summary}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Compared with the {candidate.cvAnalysis!.roleTitle} role profile on {formatDateTime(candidate.cvAnalysis!.analysedAt)} by{" "}
                  {candidate.cvAnalysis!.analysedBy} · {analysis.provenance.model} ({analysis.provenance.prompt_version})
                </p>
              </section>
              <div className="grid gap-4 md:grid-cols-2">
                <ListCard title="Relevant experience" items={analysis.experience} empty="No dated experience found in the CV." />
                <ListCard title="Qualifications" items={analysis.qualifications} empty="No qualifications found in the CV." />
              </div>
              <AiDisclaimer>{analysis.disclaimer}</AiDisclaimer>
            </>
          ) : (
            <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">
              The CV has not been analysed yet. Run CV Analysis to compare it with the role profile.
            </p>
          )}
        </TabsContent>

        <TabsContent value="evidence" className="mt-6 space-y-3">
          {analysis ? (
            <>
              <p className="text-xs text-slate-500">
                A missing keyword is not proof that a candidate lacks a skill. Not found and Unclear are prompts to ask,
                never reasons to reject on their own.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
                <table className="w-full text-left text-sm" aria-label="CV evidence">
                  <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3">Required skill</th>
                      <th className="px-4 py-3">CV evidence</th>
                      <th className="px-4 py-3">Match status</th>
                      <th className="px-4 py-3">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-slate">
                    {analysis.skills.map((s) => (
                      <tr key={s.skill_name} className="align-top">
                        <td className="px-4 py-3 font-semibold text-navy">{s.skill_name}</td>
                        <td className="max-w-md px-4 py-3">
                          {s.passages.length ? (
                            s.passages.map((p) => (
                              <blockquote key={p} className="border-l-2 border-green-lime pl-2 text-slate-600 italic">
                                “{p}”
                              </blockquote>
                            ))
                          ) : (
                            <span className="text-slate-400">No clear passage</span>
                          )}
                          <p className="mt-1 text-xs text-slate-500">{s.note}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS[s.status].variant}>{STATUS[s.status].label}</Badge>
                        </td>
                        <td className="px-4 py-3 capitalize">{s.confidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">Run CV Analysis to see evidence for each skill.</p>
          )}
        </TabsContent>

        <TabsContent value="role" className="mt-6">
          {requirements ? (
            <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
              <table className="w-full text-left text-sm" aria-label="Role match">
                <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
                  <tr>
                    <th className="px-4 py-3">Role requirement</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">CV evidence</th>
                    <th className="px-4 py-3">Explore with the candidate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-slate">
                  {requirements.requirements.map((r) => {
                    const s = analysis?.skills.find((x) => x.skill_name === r.skill_name);
                    return (
                      <tr key={r.skill_name}>
                        <td className="px-4 py-3 font-semibold text-navy">{r.skill_name}</td>
                        <td className="px-4 py-3">{r.target_level ?? "—"}</td>
                        <td className="px-4 py-3 capitalize">{r.category}</td>
                        <td className="px-4 py-3">{s ? <Badge variant={STATUS[s.status].variant}>{STATUS[s.status].label}</Badge> : "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {s && s.status !== "found" ? `Ask for a recent example of ${r.skill_name.toLowerCase()}.` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="assessment" className="mt-6">
          <AssessmentResults organisationId={organisationId} applicationId={candidate.id} actor={actor} />
        </TabsContent>

        <TabsContent value="interview" className="mt-6">
          <InterviewResults organisationId={organisationId} applicationId={candidate.id} actor={actor} />
        </TabsContent>

        <TabsContent value="history" className="mt-6 space-y-4">
          <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Stage history">
            <h2 className="font-bold text-navy">Stage history</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {[...candidate.stageHistory].reverse().map((h) => (
                <li key={`${h.stage}-${h.at}`} className="text-slate-600">
                  <span className="font-semibold text-navy">{STAGE_LABEL[h.stage]}</span> · {h.actor} · {formatDateTime(h.at)}
                  {h.note ? <span className="text-slate-500"> — {h.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="HR notes">
            <h2 className="font-bold text-navy">HR notes</h2>
            {candidate.notes.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {[...candidate.notes].reverse().map((n) => (
                  <li key={n.id}>
                    <p className="text-navy">{n.text}</p>
                    <p className="text-xs text-slate-500">
                      {n.author} · {formatDateTime(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No notes yet.</p>
            )}
            {candidate.extractionIssue ? (
              <p className="mt-3 text-sm text-warning-soft-foreground">
                <span className="font-semibold">Extraction issue:</span> {candidate.extractionIssue.note} ({candidate.extractionIssue.by},{" "}
                {formatDateTime(candidate.extractionIssue.at)})
              </p>
            ) : null}
          </section>
          <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Hiring Manager decisions">
            <h2 className="font-bold text-navy">Hiring Manager decisions</h2>
            {candidate.decisions.length ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {[...candidate.decisions].reverse().map((d) => (
                  <li key={d.id}>
                    <span className="font-semibold text-navy">
                      {d.override ? `Override: ${STAGE_LABEL[d.override.from]} → ${STAGE_LABEL[d.override.to]}` : HM_DECISION_LABEL[d.decision]}
                    </span>{" "}
                    · {d.by} · {formatDateTime(d.at)}
                    {d.note ? <span className="text-slate-500"> — {d.note}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No decisions yet.</p>
            )}
          </section>
          <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Communication log">
            <h2 className="font-bold text-navy">Communication log</h2>
            {emails.length ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {emails.map((e) => (
                  <li key={e.id}>
                    {formatDateTime(e.at)} · to {e.to} · {e.subject}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No emails sent to this candidate yet.</p>
            )}
          </section>
        </TabsContent>
      </Tabs>

      <Dialog open={dialog === "cv"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{candidate.cv.fileName}</DialogTitle>
            <DialogDescription>Text read from the candidate&apos;s CV. Download the CV for the original layout.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-50 p-4 text-xs whitespace-pre-wrap text-navy">{candidate.cvText}</pre>
        </DialogContent>
      </Dialog>

      <TextDialog
        open={dialog === "note"}
        title="Add HR note"
        label="Note"
        confirm="Save note"
        onClose={() => setDialog(null)}
        onConfirm={(text) => runAction(() => addNote(organisationId, candidate.id, text, actor), "Note saved.")}
      />
      <TextDialog
        open={dialog === "review"}
        title="Mark for human review"
        description="The candidate moves to Human Review so a person looks at their application before any next step."
        label="Why does this need a human review?"
        confirm="Mark for human review"
        onClose={() => setDialog(null)}
        onConfirm={(text) => runAction(() => markForHumanReview(organisationId, candidate.id, text, actor), "Marked for human review.")}
      />
      <TextDialog
        open={dialog === "complete_review"}
        title="Complete human review"
        description="The candidate returns to the stage they were at before the review."
        label="Outcome of the review (optional)"
        optional
        confirm="Complete review"
        onClose={() => setDialog(null)}
        onConfirm={(text) => runAction(() => completeHumanReview(organisationId, candidate.id, text, actor), "Human review completed.")}
      />
      <ExtractionDialog
        open={dialog === "extraction"}
        onClose={() => setDialog(null)}
        onFlag={(note) => runAction(() => flagExtractionIssue(organisationId, candidate.id, note, actor), "Extraction issue recorded.")}
        onReplace={(text) => runAction(() => replaceCvText(organisationId, candidate.id, text, actor), "CV text updated. Re-run the CV analysis.")}
      />
    </div>
  );
}

function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-bold text-navy">
        <FileSearchIcon className="size-4 text-slate-400" aria-hidden />
        {title}
      </h2>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function TextDialog({
  open,
  title,
  description,
  label,
  confirm,
  optional,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  confirm: string;
  optional?: boolean;
  onClose: () => void;
  onConfirm: (text: string) => boolean;
}) {
  const [text, setText] = useState("");
  const close = () => {
    setText("");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <label className="text-xs font-bold text-navy">
          {label}
          <Textarea className="mt-1 font-normal" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={!optional && !text.trim()} onClick={() => onConfirm(text) && close()}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtractionDialog({
  open,
  onClose,
  onFlag,
  onReplace,
}: {
  open: boolean;
  onClose: () => void;
  onFlag: (note: string) => boolean;
  onReplace: (text: string) => boolean;
}) {
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const close = () => {
    setNote("");
    setText("");
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Flag extraction issue</DialogTitle>
          <DialogDescription>
            Record a problem with the text read from the CV. If you have the correct text, paste it so the CV can be analysed.
          </DialogDescription>
        </DialogHeader>
        <label className="text-xs font-bold text-navy">
          What is wrong?
          <Textarea className="mt-1 font-normal" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="text-xs font-bold text-navy">
          Corrected CV text (optional)
          <Textarea className="mt-1 font-normal" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!note.trim()}
            onClick={() => {
              if (!onFlag(note)) return;
              if (text.trim() && !onReplace(text)) return;
              toast.message("Saved to the candidate's history.");
              close();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
