"use client";

import { BarChart3Icon, BriefcaseIcon, LibraryIcon, PlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { orgCounts } from "@/features/assessment-library/services/org-library";
import { cn } from "@/lib/utils";

import { listCandidates } from "../services/candidates";
import { attemptFor } from "../services/delivery";
import { metrics } from "../services/insights";
import { interviewFor } from "../services/interview";
import { listVacancies, vacancyCounts } from "../services/vacancies";
import { StageBadge } from "./candidate-list-view";
import { HrbpGate, formatDateTime, useRecruitmentRevision } from "./recruitment-shared";

/** Talent Assessment home for HRBPs: the recruitment journey at a glance and what needs attention. */
export function RecruitmentOverviewView() {
  return <HrbpGate>{(ctx) => <Overview organisationId={ctx.organisationId} />}</HrbpGate>;
}

function Overview({ organisationId }: { organisationId: string }) {
  const revision = useRecruitmentRevision();
  const data = useMemo(() => {
    void revision;
    const candidates = listCandidates(organisationId);
    const vacancies = listVacancies(organisationId);
    const attempts = candidates.map((c) => attemptFor(organisationId, c.id));
    const interviews = candidates.map((c) => interviewFor(organisationId, c.id));
    const m = metrics(organisationId);
    const value = (id: string) => m.find((x) => x.id === id)!.value;
    return {
      counts: vacancyCounts(organisationId),
      applications: value("applications"),
      qualified: value("qualified"),
      selections: value("selections"),
      recent: candidates.slice(0, 5),
      attention: [
        { label: "Vacancies waiting for Hiring Manager approval", count: vacancies.filter((v) => v.status === "pending_approval").length, href: "/talent/vacancies" },
        { label: "Approved vacancies ready to publish", count: vacancies.filter((v) => v.status === "approved").length, href: "/talent/vacancies" },
        { label: "New applications to analyse", count: candidates.filter((c) => c.stage === "new_application").length, href: "/talent/candidates" },
        { label: "CV extraction issues", count: candidates.filter((c) => c.extractionIssue || !c.cvText).length, href: "/talent/candidates" },
        { label: "Candidates in human review (including outcomes to confirm)", count: candidates.filter((c) => c.stage === "human_review").length, href: "/talent/candidates" },
        { label: "Written answers to score", count: attempts.filter((a) => a?.score?.outcome === "awaiting_written_scoring").length, href: "/talent/candidates" },
        { label: "Interviews to score", count: interviews.filter((i) => i?.status === "submitted" && !i.score).length, href: "/talent/candidates" },
        {
          label: "Candidates who reported a problem or asked for an alternative",
          count: interviews.filter((i) => i && i.status !== "submitted" && i.events.some((e) => ["technical_issue", "reschedule_requested", "consent_declined"].includes(e.type))).length,
          href: "/talent/candidates",
        },
        { label: "Expired assessment or interview links", count: attempts.filter((a) => a?.status === "expired").length + interviews.filter((i) => i?.status === "expired").length, href: "/talent/candidates" },
        { label: "Organisation assessments waiting for review", count: orgCounts(organisationId).inReview, href: "/talent/library" },
      ].filter((a) => a.count > 0),
    };
  }, [organisationId, revision]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Talent Assessment"
        description="Recruit external candidates against approved role profiles: vacancies, applications, CV evidence, role-based assessments, AI-avatar interviews and Hiring Manager shortlisting."
        actions={
          <Link href="/talent/vacancies/new" className={cn(buttonVariants(), "gap-2")}>
            <PlusIcon className="size-3.5" aria-hidden />
            Create Vacancy
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Open vacancies", String(data.counts.open)],
          ["Applications", data.applications],
          ["Qualified", data.qualified],
          ["Selected for physical interview", data.selections],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm" aria-label="Needs attention">
          <h2 className="font-bold text-navy">Needs attention</h2>
          {data.attention.length ? (
            <ul className="mt-3 divide-y divide-border-slate">
              {data.attention.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 py-2 text-sm hover:underline">
                    <span className="text-navy">{a.label}</span>
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning-soft-foreground">{a.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Nothing is waiting for you.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm" aria-label="Recent applications">
          <h2 className="font-bold text-navy">Recent applications</h2>
          {data.recent.length ? (
            <ul className="mt-3 divide-y divide-border-slate">
              {data.recent.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <Link href={`/talent/candidates/${c.id}`} className="font-semibold text-navy hover:underline">
                      {c.fullName}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {c.vacancyTitle} · {formatDateTime(c.submittedAt)}
                    </span>
                  </span>
                  <StageBadge stage={c.stage} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No applications yet.</p>
          )}
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Recruitment areas">
        {[
          ["/talent/vacancies", "Vacancies", "Create, approve and publish", BriefcaseIcon],
          ["/talent/candidates", "Candidates", "Pipeline, CV evidence, results", UsersIcon],
          ["/talent/library", "Assessment Library", "Approved assessments and interview sets", LibraryIcon],
          ["/talent/insights", "Recruitment Insights", "Funnel, conversion, time in stage", BarChart3Icon],
        ].map(([href, title, detail, Icon]) => {
          const I = Icon as typeof UsersIcon;
          return (
            <Link key={href as string} href={href as string} className="rounded-2xl border border-border-slate bg-white p-4 shadow-sm hover:border-navy">
              <I className="size-5 text-green-deep" aria-hidden />
              <p className="mt-2 font-bold text-navy">{title as string}</p>
              <p className="text-xs text-slate-500">{detail as string}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
