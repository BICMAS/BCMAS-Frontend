"use client";

import { ArrowLeftRightIcon, CheckCircle2Icon, PauseCircleIcon, ShuffleIcon, XCircleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  candidateReport,
  compareCandidates,
  decide,
  hiringManagerVacancies,
  overrideOutcome,
  shortlist,
  type CandidateSummary,
  type CompetencyEvidence,
  type ReviewGroup,
} from "../services/hiring-review";
import { HM_DECISION_LABEL, STAGE_LABEL, type HmDecision } from "../types";
import { StageBadge } from "./candidate-list-view";
import { HiringManagerGate, formatDate, formatDateTime, runAction, useRecruitmentRevision } from "./recruitment-shared";

const pctText = (v: number | null) => (v === null ? "—" : `${v}%`);

const CV_LABEL = { found: "Evidence found", unclear: "Unclear", not_found: "Not found" } as const;

function DecisionBadge({ decision }: { decision: HmDecision | null }) {
  if (!decision) return <span className="text-xs text-slate-400">No decision</span>;
  const variant = decision.decision === "selected" ? "success" : decision.decision === "not_progressed" ? "error" : decision.decision === "hold" ? "warning" : "info";
  return <Badge variant={variant}>{decision.decision === "override" ? `Override → ${STAGE_LABEL[decision.override!.to]}` : HM_DECISION_LABEL[decision.decision]}</Badge>;
}

/* ── My vacancies ──────────────────────────────────────────────────────── */

export function HiringReviewListView() {
  return <HiringManagerGate>{(ctx) => <HiringReviewList {...ctx} />}</HiringManagerGate>;
}

function HiringReviewList({ organisationId, userId }: { organisationId: string; userId: string }) {
  const revision = useRecruitmentRevision();
  const rows = useMemo(() => {
    void revision;
    return hiringManagerVacancies(organisationId, userId);
  }, [organisationId, userId, revision]);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Hiring Manager Review"
        description="Compare candidates on the same role-linked evidence and decide who to invite to a physical interview. You make the shortlist decision; BCMS records it."
      />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">You are not Hiring Manager for any approved vacancy yet.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.vacancy.id}>
              <Link href={`/manager/recruitment/${r.vacancy.id}`} className="block rounded-2xl border border-border-slate bg-white p-5 shadow-sm hover:border-navy">
                <p className="font-bold text-navy">{r.vacancy.title}</p>
                <p className="text-xs text-slate-500">
                  {r.vacancy.department} · {r.vacancy.location} · closes {formatDate(r.vacancy.closingDate)}
                </p>
                <p className="mt-3 text-sm text-navy">
                  {r.qualified} qualified · {r.humanReview} human review · {r.notProgressed} not progressed · {r.applicants} applicants
                </p>
                {r.awaitingDecision ? <Badge variant="warning" className="mt-2">{r.awaitingDecision} awaiting your decision</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Shortlisting for one vacancy (Screen 13) ─────────────────────────── */

const TABS: Array<{ id: ReviewGroup; label: string }> = [
  { id: "qualified", label: "Qualified" },
  { id: "human_review", label: "Human Review" },
  { id: "not_progressed", label: "Not Progressed" },
  { id: "in_progress", label: "In Progress" },
];

export function ShortlistView({ vacancyId }: { vacancyId: string }) {
  return <HiringManagerGate>{(ctx) => <Shortlist vacancyId={vacancyId} {...ctx} />}</HiringManagerGate>;
}

function Shortlist({ vacancyId, organisationId, userId }: { vacancyId: string; organisationId: string; userId: string }) {
  const router = useRouter();
  const revision = useRecruitmentRevision();
  const [tab, setTab] = useState<ReviewGroup>("qualified");
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const result = useMemo(() => {
    void revision;
    try {
      return shortlist(organisationId, vacancyId, userId);
    } catch {
      return null;
    }
  }, [organisationId, vacancyId, userId, revision]);

  if (!result) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">You are not the Hiring Manager for this vacancy.</p>
        <Link href="/manager/recruitment" className="text-sm font-bold text-navy hover:underline">
          ← Hiring Manager Review
        </Link>
      </div>
    );
  }
  const { vacancy, snapshot, candidates } = result;
  const count = (g: ReviewGroup) => candidates.filter((c) => c.group === g).length;
  const shown = candidates.filter((c) => c.group === tab);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/manager/recruitment" className="text-xs font-bold text-slate-500 hover:underline">
        ← Hiring Manager Review
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">{vacancy.title}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Compare evidence and make the shortlist decision. Thresholds you approved (snapshot v{snapshot?.version ?? "—"}) set the automatic outcome;
          any change to it needs a reason.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          ["Qualified", String(count("qualified"))],
          ["Human review", String(count("human_review"))],
          ["Not progressed", String(count("not_progressed"))],
          ["Assessment threshold", snapshot?.assessment !== null && snapshot ? `${snapshot.assessment}%` : "—"],
          ["Interview threshold", snapshot?.interview !== null && snapshot ? `${snapshot.interview}%` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Outcome" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-bold",
                tab === t.id ? "border-navy bg-navy text-white" : "border-border-slate bg-white text-navy hover:bg-slate-50",
              )}
            >
              {t.label} ({count(t.id)})
            </button>
          ))}
        </div>
        <Button type="button" variant="secondary" disabled={selected.length < 2} onClick={() => setComparing(true)}>
          <ArrowLeftRightIcon aria-hidden />
          Compare Candidates ({selected.length})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
        <table className="w-full text-left text-sm" aria-label="Candidates">
          <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-3">
                <span className="sr-only">Compare</span>
              </th>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">CV evidence</th>
              <th className="px-4 py-3">Assessment</th>
              <th className="px-4 py-3">Interview</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Decision</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-slate">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No candidates here.
                </td>
              </tr>
            ) : (
              shown.map((c) => (
                <tr key={c.application.id}>
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selected.includes(c.application.id)}
                      onCheckedChange={() => toggle(c.application.id)}
                      aria-label={`Compare ${c.application.fullName}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-navy">{c.application.fullName}</p>
                    <p className="text-[10px] text-slate-400">{c.application.reference}</p>
                  </td>
                  <td className="px-4 py-3">{c.cvCoveragePct === null ? "—" : `${c.cvCoveragePct}% coverage`}</td>
                  <td className="px-4 py-3 font-semibold">{pctText(c.assessmentPct)}</td>
                  <td className="px-4 py-3 font-semibold">{pctText(c.interviewPct)}</td>
                  <td className="px-4 py-3">
                    <StageBadge stage={c.application.stage} />
                  </td>
                  <td className="px-4 py-3">
                    <DecisionBadge decision={c.decision} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/manager/recruitment/${vacancyId}/${c.application.id}`)}
                      aria-label={`Open report for ${c.application.fullName}`}
                    >
                      Open Report
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">BCMS supports the decision with consistent evidence. Your organisation remains responsible for the final hiring decision.</p>

      <Dialog open={comparing} onOpenChange={setComparing}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {comparing ? <Comparison organisationId={organisationId} userId={userId} ids={selected} candidates={candidates} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Comparison({ organisationId, userId, ids, candidates }: { organisationId: string; userId: string; ids: string[]; candidates: CandidateSummary[] }) {
  const { reports, competencies } = compareCandidates(organisationId, ids, userId);
  const cell = (e: CompetencyEvidence | undefined) =>
    e ? (
      <span>
        {pctText(e.overallPct)}
        <span className="block text-[10px] text-slate-400">
          CV {e.cv ? CV_LABEL[e.cv] : "—"} · A {pctText(e.assessmentPct)} · I {pctText(e.interviewPct)}
        </span>
      </span>
    ) : (
      "—"
    );
  return (
    <>
      <DialogHeader>
        <DialogTitle>Compare candidates</DialogTitle>
        <DialogDescription>The same role-linked criteria for each candidate. A = assessment, I = interview.</DialogDescription>
      </DialogHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" aria-label="Comparison">
          <thead>
            <tr>
              <th className="py-2 pr-3 text-xs text-slate-500">Criterion</th>
              {reports.map((r) => (
                <th key={r.summary.application.id} className="py-2 pr-3 font-bold text-navy">
                  {r.summary.application.fullName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-slate">
            {[
              ["CV evidence coverage", (r: (typeof reports)[number]) => (r.summary.cvCoveragePct === null ? "—" : `${r.summary.cvCoveragePct}%`)],
              ["Assessment", (r: (typeof reports)[number]) => pctText(r.summary.assessmentPct)],
              ["Interview", (r: (typeof reports)[number]) => pctText(r.summary.interviewPct)],
              ["Outcome", (r: (typeof reports)[number]) => STAGE_LABEL[r.summary.application.stage]],
              ["Decision", (r: (typeof reports)[number]) => (candidates.find((c) => c.application.id === r.summary.application.id)?.decision ? HM_DECISION_LABEL[r.summary.decision!.decision] : "—")],
            ].map(([label, get]) => (
              <tr key={label as string}>
                <td className="py-2 pr-3 text-xs font-semibold text-slate-600">{label as string}</td>
                {reports.map((r) => (
                  <td key={r.summary.application.id} className="py-2 pr-3 text-navy">
                    {(get as (r: (typeof reports)[number]) => string)(r)}
                  </td>
                ))}
              </tr>
            ))}
            {competencies.map((comp) => (
              <tr key={comp}>
                <td className="py-2 pr-3 text-xs font-semibold text-slate-600">{comp}</td>
                {reports.map((r) => (
                  <td key={r.summary.application.id} className="py-2 pr-3 text-navy">
                    {cell(r.evidence.find((e) => e.competency === comp))}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-2 pr-3 text-xs font-semibold text-slate-600">Strengths</td>
              {reports.map((r) => (
                <td key={r.summary.application.id} className="py-2 pr-3 text-xs text-navy">
                  {r.strengths.join(", ") || "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 pr-3 text-xs font-semibold text-slate-600">Gaps</td>
              {reports.map((r) => (
                <td key={r.summary.application.id} className="py-2 pr-3 text-xs text-navy">
                  {r.gaps.join(", ") || "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Candidate report and decision ─────────────────────────────────────── */

export function CandidateReportView({ applicationId }: { applicationId: string }) {
  return <HiringManagerGate>{(ctx) => <CandidateReport applicationId={applicationId} {...ctx} />}</HiringManagerGate>;
}

type DecisionDialog = { kind: "hold" | "not_progressed" | "selected" | "override"; to?: "qualified" | "not_progressed" } | null;

function CandidateReport({
  applicationId,
  organisationId,
  userId,
  actor,
}: {
  applicationId: string;
  organisationId: string;
  userId: string;
  actor: string;
}) {
  const revision = useRecruitmentRevision();
  const [dialog, setDialog] = useState<DecisionDialog>(null);
  const report = useMemo(() => {
    void revision;
    try {
      return candidateReport(organisationId, applicationId, userId);
    } catch {
      return null;
    }
  }, [organisationId, applicationId, userId, revision]);

  if (!report) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">You are not the Hiring Manager for this candidate&apos;s vacancy.</p>
        <Link href="/manager/recruitment" className="text-sm font-bold text-navy hover:underline">
          ← Hiring Manager Review
        </Link>
      </div>
    );
  }
  const { summary, vacancy, snapshot, attempt, interview, evidence, strengths, gaps } = report;
  const app = summary.application;
  const me = { userId, name: actor };
  const done = summary.group !== "in_progress";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/manager/recruitment/${vacancy.id}`} className="text-xs font-bold text-slate-500 hover:underline">
        ← {vacancy.title}
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">{app.fullName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {app.reference} · applied {formatDateTime(app.submittedAt)} · {vacancy.title}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <StageBadge stage={app.stage} />
          <DecisionBadge decision={summary.decision} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[
          ["CV evidence coverage", summary.cvCoveragePct === null ? "Not analysed" : `${summary.cvCoveragePct}%`],
          ["Assessment", attempt?.score?.percent != null ? `${attempt.score.percent}% (pass ${attempt.score.threshold}%)` : "—"],
          ["Interview", interview?.score?.percent != null ? `${interview.score.percent}% (pass ${interview.score.threshold}%)` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
          <h2 className="font-bold text-navy">Strengths</h2>
          <p className="mt-1 text-sm text-slate-600">{strengths.length ? strengths.join(", ") : "No competency scored 75% or more."}</p>
        </div>
        <div className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
          <h2 className="font-bold text-navy">Gaps to explore</h2>
          <p className="mt-1 text-sm text-slate-600">{gaps.length ? gaps.join(", ") : "No competency scored below 50%."}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
        <h2 className="font-bold text-navy">Skill-by-skill evidence</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label="Skill evidence">
            <thead className="text-[10px] tracking-widest text-slate-400 uppercase">
              <tr>
                <th className="py-2 pr-3">Competency</th>
                <th className="py-2 pr-3">CV</th>
                <th className="py-2 pr-3">Assessment</th>
                <th className="py-2 pr-3">Interview</th>
                <th className="py-2">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-slate">
              {evidence.map((e) => (
                <tr key={e.competency}>
                  <td className="py-2 pr-3 font-semibold text-navy">{e.competency}</td>
                  <td className="py-2 pr-3">{e.cv ? CV_LABEL[e.cv] : "—"}</td>
                  <td className="py-2 pr-3">{pctText(e.assessmentPct)}</td>
                  <td className="py-2 pr-3">{pctText(e.interviewPct)}</td>
                  <td className="py-2 font-semibold">{pctText(e.overallPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">CV evidence is a screening signal, not a score. Not found is a prompt to ask, not proof of a missing skill.</p>
      </section>

      <section className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm" aria-label="Outcome basis">
        <h2 className="font-bold text-navy">What the outcome is based on</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>Threshold snapshot v{snapshot?.version ?? "—"} approved by {snapshot?.approvedBy ?? "—"} on {snapshot ? formatDateTime(snapshot.approvedAt) : "—"}.</li>
          {attempt?.score ? (
            <li>
              Assessment: {attempt.assessmentName} v{attempt.assessmentVersion}, scoring rule {attempt.score.scoringRuleVersion}. {attempt.score.reason}
            </li>
          ) : null}
          {interview?.score ? (
            <li>
              Interview: {interview.questionSetName} v{interview.questionSetVersion}. {interview.score.reason}
            </li>
          ) : null}
          {app.stageHistory.at(-1)?.note ? <li>Latest stage note: {app.stageHistory.at(-1)!.note}</li> : null}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Answers and scores are read-only here.</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border-slate bg-white p-5 shadow-sm" aria-label="Decision">
        <h2 className="font-bold text-navy">Your decision</h2>
        {app.proposedOutcome ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            Below the pass mark; not final until a person confirms it.{" "}
            {app.proposedOutcome.referral ? `HR referred this to you: ${app.proposedOutcome.referral.reason}` : "HR has not confirmed it yet."}
          </p>
        ) : null}
        {!done ? (
          <p className="text-sm text-slate-500">This candidate has not finished the recruitment stages yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="accent" disabled={app.stage !== "qualified"} onClick={() => setDialog({ kind: "selected" })}>
              <CheckCircle2Icon aria-hidden />
              Select for Physical Interview
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDialog({ kind: "hold" })}>
              <PauseCircleIcon aria-hidden />
              Hold
            </Button>
            {app.stage !== "not_progressed" ? (
              <Button type="button" variant="destructive" onClick={() => setDialog({ kind: "not_progressed" })}>
                <XCircleIcon aria-hidden />
                Not Progressed
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setDialog({ kind: "override", to: app.stage === "qualified" ? "not_progressed" : "qualified" })}>
              <ShuffleIcon aria-hidden />
              Override Outcome
            </Button>
          </div>
        )}
        {app.decisions.length ? (
          <ul className="mt-2 space-y-1 text-sm" aria-label="Decision history">
            {[...app.decisions].reverse().map((d) => (
              <li key={d.id} className="text-slate-600">
                <span className="font-semibold text-navy">
                  {d.override ? `Override: ${STAGE_LABEL[d.override.from]} → ${STAGE_LABEL[d.override.to]}` : HM_DECISION_LABEL[d.decision]}
                </span>{" "}
                · {d.by} · {formatDateTime(d.at)}
                {d.note ? <span className="text-slate-500"> — {d.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-slate-500">BCMS records who made each decision and when. Your organisation remains responsible for the final hiring decision.</p>
      </section>

      <DecisionNoteDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
        onConfirm={(note) => {
          if (!dialog) return false;
          if (dialog.kind === "override") {
            return runAction(() => overrideOutcome(organisationId, app.id, me, dialog.to!, note), "Override recorded.");
          }
          const kind = dialog.kind;
          return runAction(
            () => decide(organisationId, app.id, me, kind, note),
            kind === "selected" ? "Selected for physical interview. The candidate is emailed and HR will arrange it." : "Decision recorded.",
          );
        }}
      />
    </div>
  );
}

function DecisionNoteDialog({ dialog, onClose, onConfirm }: { dialog: DecisionDialog; onClose: () => void; onConfirm: (note: string) => boolean }) {
  const [note, setNote] = useState("");
  const close = () => {
    setNote("");
    onClose();
  };
  if (!dialog) return null;
  const text = {
    selected: { title: "Select for physical interview", label: "Note (optional)", required: false, button: "Select" },
    hold: { title: "Put on hold", label: "Why is this candidate on hold?", required: true, button: "Hold" },
    not_progressed: { title: "Do not progress", label: "Reason (shared with HR, not the candidate)", required: true, button: "Not progressed" },
    override: {
      title: `Override outcome → ${dialog.to === "qualified" ? "Qualified" : "Not Progressed"}`,
      label: "Reason for overriding the automatic, threshold-based outcome (required, audited)",
      required: true,
      button: "Record override",
    },
  }[dialog.kind];
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          {dialog.kind === "override" ? (
            <DialogDescription>Overrides are recorded with your name, the time and your reason, and are visible to HR.</DialogDescription>
          ) : null}
        </DialogHeader>
        <label className="text-xs font-bold text-navy">
          {text.label}
          <Textarea className="mt-1 font-normal" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={text.required && !note.trim()} onClick={() => onConfirm(note) && close()}>
            {text.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
