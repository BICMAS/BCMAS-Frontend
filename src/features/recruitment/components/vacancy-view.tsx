"use client";

import {
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RocketIcon,
  SaveIcon,
  SendIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";

import {
  closeVacancy,
  createVacancy,
  emptyDetails,
  getVacancy,
  latestApproval,
  listApplications,
  listOutbox,
  pauseVacancy,
  publicApplyPath,
  publishVacancy,
  resumeVacancy,
  sendForApproval,
  updateVacancy,
  vacancyProblems,
  type VacancyDetails,
} from "../services/vacancies";
import type { Vacancy } from "../types";
import {
  HrbpGate,
  VacancyStatusBadge,
  formatDate,
  formatDateTime,
  runAction,
  useRecruitmentRevision,
} from "./recruitment-shared";
import { VacancyEditor } from "./vacancy-editor";

function detailsOf(v: Vacancy): VacancyDetails {
  const { title, department, location, employmentType, openings, summary, closingDate, roleId, assessment, stages, consentText, hiringManager } = v;
  return structuredClone({ title, department, location, employmentType, openings, summary, closingDate, roleId, assessment, stages, consentText, hiringManager });
}

/* ── Create ─────────────────────────────────────────────────────────────── */

export function NewVacancyView() {
  return <HrbpGate>{(ctx) => <NewVacancy {...ctx} />}</HrbpGate>;
}

function NewVacancy({ organisationId, actor }: { organisationId: string; actor: string }) {
  const router = useRouter();
  const [details, setDetails] = useState<VacancyDetails>(() => emptyDetails());
  const [tab, setTab] = useState("details");
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/talent/vacancies" className="text-xs font-bold text-slate-500 hover:underline">
        ← Vacancy Management
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Create Vacancy</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure the role, stages, approved assessment and pass thresholds. The Hiring Manager approves the thresholds
          before you can publish.
        </p>
      </div>
      <VacancyEditor organisationId={organisationId} value={details} onChange={setDetails} readOnly={false} tab={tab} onTabChange={setTab} />
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => {
            let id = "";
            if (runAction(() => (id = createVacancy(organisationId, details, actor)), "Vacancy saved as a draft.")) {
              router.push(`/talent/vacancies/${id}`);
            }
          }}
        >
          <SaveIcon aria-hidden />
          Save Draft
        </Button>
        <Link href="/talent/vacancies" className="inline-flex items-center px-3 text-sm font-bold text-slate-500 hover:underline">
          Cancel
        </Link>
      </div>
    </div>
  );
}

/* ── View / configure ───────────────────────────────────────────────────── */

export function VacancyView({ vacancyId }: { vacancyId: string }) {
  return <HrbpGate>{(ctx) => <VacancyDetailsScreen vacancyId={vacancyId} {...ctx} />}</HrbpGate>;
}

function VacancyDetailsScreen({ vacancyId, organisationId, actor }: { vacancyId: string; organisationId: string; actor: string }) {
  const search = useSearchParams();
  const revision = useRecruitmentRevision();
  const vacancy = useMemo(() => {
    void revision;
    return getVacancy(organisationId, vacancyId);
  }, [organisationId, vacancyId, revision]);
  const [draft, setDraft] = useState<VacancyDetails | null>(() =>
    vacancy && (vacancy.status === "draft" || search.get("edit") === "1") ? detailsOf(vacancy) : null,
  );
  const [tab, setTab] = useState("details");
  const [closing, setClosing] = useState(false);

  if (!vacancy) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">This vacancy is not in your organisation.</p>
        <Link href="/talent/vacancies" className="text-sm font-bold text-navy hover:underline">
          ← Back to Vacancy Management
        </Link>
      </div>
    );
  }

  const editableStatus = vacancy.status === "draft" || vacancy.status === "pending_approval" || vacancy.status === "approved";
  const editing = draft !== null && editableStatus;
  const shown = editing ? draft : detailsOf(vacancy);
  const approval = latestApproval(vacancy);
  const problems = vacancyProblems({ ...vacancy, ...shown });
  const lastReturn = [...vacancy.history].reverse().find((e) => e.action === "Returned for changes");
  const applications = listApplications(organisationId, vacancy.id);
  const link = vacancy.publicToken ? publicApplyPath(vacancy.publicToken) : null;
  const absoluteLink = link && typeof window !== "undefined" ? `${window.location.origin}${link}` : link;

  function save() {
    if (!draft) return false;
    return runAction(
      () => updateVacancy(organisationId, vacancy!.id, draft, actor),
      vacancy!.status === "draft" ? "Draft saved." : "Saved. The vacancy is back in Draft and needs approval again.",
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/talent/vacancies" className="text-xs font-bold text-slate-500 hover:underline">
        ← Vacancy Management
      </Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-navy">{vacancy.title || "Untitled vacancy"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {vacancy.department} · {vacancy.location} · {vacancy.employmentType} · closes {formatDate(vacancy.closingDate)} · owner{" "}
            {vacancy.owner}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <VacancyStatusBadge status={vacancy.status} />
            <span className="text-xs text-slate-500">{applications.length} applicant{applications.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Role Profile", vacancy.roleTitle ?? "Not selected"],
          ["Assessment", vacancy.stages.assessment.enabled ? (vacancy.assessment ? `${vacancy.assessment.name} v${vacancy.assessment.version}` : "Not assigned") : "Off"],
          ["Assessment pass mark", vacancy.stages.assessment.enabled && vacancy.stages.assessment.threshold ? `${vacancy.stages.assessment.threshold}%` : "—"],
          ["Avatar interview", vacancy.stages.interview.enabled ? `Enabled · ${vacancy.stages.interview.threshold ?? "—"}%` : "Off"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="truncate font-bold text-navy" title={value}>
              {value}
            </p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <StatusGuidance vacancy={vacancy} lastReturn={lastReturn?.note} problems={problems} />

      <div className="flex flex-wrap gap-2" aria-label="Vacancy actions">
        {editableStatus && !editing ? (
          <Button type="button" variant="secondary" onClick={() => setDraft(detailsOf(vacancy))}>
            <PencilIcon aria-hidden />
            Edit
          </Button>
        ) : null}
        {editing ? (
          <Button type="button" onClick={() => save()}>
            <SaveIcon aria-hidden />
            Save Draft
          </Button>
        ) : null}
        {vacancy.status === "draft" ? (
          <Button
            type="button"
            variant="accent"
            onClick={() => {
              if (editing && !save()) return;
              runAction(() => sendForApproval(organisationId, vacancy.id, actor), `Sent to ${vacancy.hiringManager?.name ?? "the Hiring Manager"} for approval.`);
            }}
          >
            <SendIcon aria-hidden />
            Send for Approval
          </Button>
        ) : null}
        {vacancy.status === "approved" && !editing ? (
          <Button type="button" variant="accent" onClick={() => runAction(() => publishVacancy(organisationId, vacancy.id, actor), "Vacancy published. The application link is live.")}>
            <RocketIcon aria-hidden />
            Publish Vacancy
          </Button>
        ) : null}
        {link ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(absoluteLink ?? link);
                  toast.success("Application link copied.");
                } catch {
                  toast.error("Could not copy. Select the link on the Candidate Link tab instead.");
                }
              }}
            >
              <CopyIcon aria-hidden />
              Copy Link
            </Button>
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-slate bg-white px-4 text-sm font-bold text-navy shadow-sm hover:bg-slate-50">
              <ExternalLinkIcon className="size-4" aria-hidden />
              Preview Link
            </a>
          </>
        ) : null}
        {vacancy.status === "published" ? (
          <Button type="button" variant="secondary" onClick={() => runAction(() => pauseVacancy(organisationId, vacancy.id, actor), "Vacancy paused. The link no longer accepts applications.")}>
            <PauseIcon aria-hidden />
            Pause
          </Button>
        ) : null}
        {vacancy.status === "paused" ? (
          <Button type="button" variant="secondary" onClick={() => runAction(() => resumeVacancy(organisationId, vacancy.id, actor), "Vacancy reopened for applications.")}>
            <PlayIcon aria-hidden />
            Resume
          </Button>
        ) : null}
        {vacancy.status !== "closed" && vacancy.status !== "pending_approval" ? (
          <Button type="button" variant="destructive" onClick={() => setClosing(true)}>
            <XCircleIcon aria-hidden />
            Close
          </Button>
        ) : null}
      </div>

      <VacancyEditor
        organisationId={organisationId}
        value={shown}
        onChange={setDraft}
        readOnly={!editing}
        tab={tab}
        onTabChange={setTab}
        extraTabs={[
          { value: "approval", label: "Approval", content: <ApprovalTab vacancy={vacancy} /> },
          {
            value: "link",
            label: "Candidate Link",
            content: (
              <section className="space-y-3 rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
                {link ? (
                  <>
                    <p className="text-sm text-navy">Share this link. Candidates apply without a BCMS account.</p>
                    <code className="block rounded-lg bg-slate-50 px-3 py-2 text-sm break-all text-navy" aria-label="Application link">
                      {absoluteLink}
                    </code>
                    <p className="text-xs text-slate-500">
                      {vacancy.status === "published" ? "The link is accepting applications." : "The link is not accepting applications right now."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    A unique public application link is created when the vacancy is published, after the Hiring Manager approves it.
                  </p>
                )}
              </section>
            ),
          },
          {
            value: "applicants",
            label: `Applicants (${applications.length})`,
            content: <ApplicantsTab vacancy={vacancy} organisationId={organisationId} approvalVersion={approval?.version ?? null} />,
          },
        ]}
      />

      <CloseDialog
        open={closing}
        onCancel={() => setClosing(false)}
        onConfirm={(reason) => {
          if (runAction(() => closeVacancy(organisationId, vacancy.id, actor, reason), "Vacancy closed.")) setClosing(false);
        }}
      />
    </div>
  );
}

function StatusGuidance({ vacancy, lastReturn, problems }: { vacancy: Vacancy; lastReturn?: string; problems: string[] }) {
  if (vacancy.status === "draft") {
    return (
      <div className="space-y-2">
        {lastReturn ? (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
            <span className="font-bold">Returned by the Hiring Manager:</span> {lastReturn}
          </p>
        ) : null}
        {problems.length ? (
          <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
            <p className="font-bold">Before sending for approval</p>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }
  const text: Partial<Record<Vacancy["status"], string>> = {
    pending_approval: `Waiting for ${vacancy.hiringManager?.name ?? "the Hiring Manager"} to approve the thresholds. Editing now sends it back to Draft.`,
    approved: "Approved by the Hiring Manager. Publish to create the public application link.",
    paused: "Paused: the application link shows candidates that applications are paused.",
    closed: "Closed: the application link no longer accepts applications.",
  };
  return text[vacancy.status] ? <p className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-soft-foreground">{text[vacancy.status]}</p> : null;
}

function ApprovalTab({ vacancy }: { vacancy: Vacancy }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">Approved threshold snapshots</h2>
        {vacancy.approvals.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Not approved yet. Hiring Manager: {vacancy.hiringManager?.name ?? "not chosen"}.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {[...vacancy.approvals].reverse().map((a) => (
              <li key={a.version} className="rounded-lg border border-border-slate px-3 py-2">
                <span className="font-bold text-navy">Snapshot v{a.version}</span> · assessment {a.assessment ?? "—"}% ·
                interview {a.interview ?? "—"}%{a.assessmentRef ? ` · ${a.assessmentRef.name} v${a.assessmentRef.version}` : ""} ·
                approved by {a.approvedBy} on {formatDateTime(a.approvedAt)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <h2 className="font-bold text-navy">History</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {[...vacancy.history].reverse().map((e) => (
            <li key={e.id} className="text-slate-600">
              <span className="font-semibold text-navy">{e.action}</span> · {e.actor} · {formatDateTime(e.at)}
              {e.note ? <span className="text-slate-500"> — {e.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ApplicantsTab({
  vacancy,
  organisationId,
  approvalVersion,
}: {
  vacancy: Vacancy;
  organisationId: string;
  approvalVersion: number | null;
}) {
  const applications = listApplications(organisationId, vacancy.id);
  const emails = listOutbox(organisationId, vacancy.id);
  return (
    <div className="space-y-4">
      {applications.length === 0 ? (
        <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">No applications yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
          <table className="w-full text-left text-sm" aria-label="Applicants">
            <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">CV</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Thresholds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-slate">
              {applications.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-navy">{a.fullName}</p>
                    <p className="text-xs text-slate-500">{a.email}</p>
                    {a.possibleDuplicateOf ? <Badge variant="warning">Possible duplicate application</Badge> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.reference}</td>
                  <td className="px-4 py-3 text-xs">{a.cv.fileName}</td>
                  <td className="px-4 py-3 text-xs">{formatDateTime(a.submittedAt)}</td>
                  <td className="px-4 py-3 text-xs">
                    Snapshot v{a.thresholdVersion}
                    {approvalVersion && approvalVersion !== a.thresholdVersion ? " (older)" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Screening, assessment invitations and candidate profiles arrive with Candidate Management (next step).
      </p>
      {emails.length ? (
        <section className="rounded-2xl border border-border-slate bg-white p-5" aria-label="Email log">
          <h2 className="font-bold text-navy">Email log</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {emails.map((e) => (
              <li key={e.id}>
                <CheckCircle2Icon className="mr-1 inline size-3 text-green-deep" aria-hidden />
                {formatDateTime(e.at)} · to {e.to} · {e.subject}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CloseDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close vacancy</DialogTitle>
          <DialogDescription>The link stops accepting applications. Existing candidates and their results are kept.</DialogDescription>
        </DialogHeader>
        <label className="text-xs font-bold text-navy">
          Reason
          <Textarea className="mt-1 font-normal" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={!reason.trim()} onClick={() => onConfirm(reason)}>
            Close vacancy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
