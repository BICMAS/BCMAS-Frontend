"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { LayoutGridIcon, ListIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  directoryFocusLabels,
  isDirectoryFocus,
  membersForFocus,
  overdueLearning,
} from "@/features/manager/team-data";
import { teamReport } from "@/features/capability/services/analytics";
import { latestResults } from "@/features/capability/services/capability";
import { capabilityMatch } from "@/features/capability/services/scoring";
import { useCapabilityUser } from "@/features/capability/use-capability";
import { teamMembers, type TeamMember } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

type ViewMode = "cards" | "list";

function primaryAction(member: TeamMember) {
  if (member.id === "sarah-connor") return { label: "Verify Evidence", href: "/verification/team" };
  return {
    label: "Review Dev. Plan",
    href: member.id === "robert" ? "/growth/plan-robert-infra" : "/growth/plan-james-ai",
  };
}

function secondaryStat(member: TeamMember): [string, string] {
  if (member.gaps) return ["Gaps", `${member.gaps} Critical`];
  if (member.evidenceCount) return ["Evidence", `${member.evidenceCount} New`];
  return ["Growth", member.growth];
}

function focusNote(member: TeamMember, focus: string | null): string | null {
  if (focus === "assessment") return `${member.pendingAssessments} assessment(s) pending`;
  if (focus === "learning") return `${overdueLearning[member.id] ?? 0} overdue learning activities`;
  return null;
}

export function TeamDirectoryView() {
  const params = useSearchParams();
  const focusParam = params.get("focus");
  const gap = params.get("gap");
  const focus = isDirectoryFocus(focusParam) ? focusParam : null;
  const [query, setQuery] = useState("");
  const user = useCapabilityUser();
  const results = user ? latestResults(user) : [];
  const affected = new Set(gap && user ? teamReport(user).skills.find((s) => s.skill === gap)?.affected.map((p) => p.name) : []);
  const scoreOf = (member: TeamMember) => {
    const found = results.find((a) => a.employeeName === member.name);
    const percent = found ? capabilityMatch(found.items).percent : null;
    return percent === null ? "Not assessed" : `${percent}%`;
  };
  const [view, setView] = useState<ViewMode>("cards");

  const scoped = focus ? membersForFocus(focus) : gap ? teamMembers.filter((m) => affected.has(m.name)) : teamMembers;
  const q = query.trim().toLowerCase();
  const members = q
    ? scoped.filter((m) => m.name.toLowerCase().includes(q) || m.title.toLowerCase().includes(q))
    : scoped;
  const filterLabel = focus ? directoryFocusLabels[focus] : gap ? `Employees affected by the ${gap} gap` : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">Team Hub / Directory</p>
        }
        title="My Direct Reports"
        description="View and manage the capability, skill gaps and development progress of your direct reports."
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employees by name or job title"
            aria-label="Search employees"
            className="pl-9"
          />
        </div>
        <div className="inline-flex rounded-lg border border-border-slate bg-white p-1" role="group" aria-label="View">
          {(
            [
              ["cards", "Cards", LayoutGridIcon],
              ["list", "List", ListIcon],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold",
                view === mode ? "bg-navy text-white" : "text-navy hover:bg-slate-50",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
      {filterLabel ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-navy">
            {filterLabel}
            <Link href="/manager/team" aria-label="Clear filter" className="text-slate-500 hover:text-navy">
              <XIcon className="size-3.5" />
            </Link>
          </span>
          <span className="text-xs text-slate-500">
            {members.length} of {teamMembers.length} direct reports
          </span>
        </div>
      ) : null}

      {members.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-slate p-8 text-center text-sm text-slate-500">
          No direct reports match {q ? `"${query}"` : "this filter"}.
        </p>
      ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => {
            const action = primaryAction(member);
            const [statLabel, statValue] = secondaryStat(member);
            const note = focusNote(member, focus);
            return (
              <article key={member.id} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={member.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
                  <div>
                    <h2 className="font-bold text-navy">{member.name}</h2>
                    <p className="text-xs text-slate-500">{member.title}</p>
                  </div>
                </div>
                <Badge className="mt-4" variant={member.status === "Aligned" ? "success" : "warning"}>
                  {member.status}
                </Badge>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Capability Score</dt>
                    <dd className="font-bold text-navy">{scoreOf(member)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{statLabel}</dt>
                    <dd className="font-bold text-navy">{statValue}</dd>
                  </div>
                </dl>
                {note ? <p className="mt-3 text-xs font-bold text-warning-soft-foreground">{note}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/manager/team/${member.id}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                    View Profile
                  </Link>
                  <Link href={action.href} className={cn(buttonVariants({ size: "sm" }))}>
                    {action.label}
                  </Link>
                </div>
              </article>
            );
          })}
          {!filterLabel && !q ? <InviteCard /> : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-slate bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <tr>
                {["Employee", "Status", "Capability Score", "Gaps / Evidence", "Actions"].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const action = primaryAction(member);
                const [statLabel, statValue] = secondaryStat(member);
                const note = focusNote(member, focus);
                return (
                  <tr key={member.id} className="border-t border-border-slate">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={member.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                        <div>
                          <p className="font-bold text-navy">{member.name}</p>
                          <p className="text-xs text-slate-500">{member.title}</p>
                          {note ? <p className="text-xs font-bold text-warning-soft-foreground">{note}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={member.status === "Aligned" ? "success" : "warning"}>{member.status}</Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-navy">{scoreOf(member)}</td>
                    <td className="px-4 py-3 text-navy">
                      <span className="text-xs text-slate-500">{statLabel}: </span>
                      {statValue}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/manager/team/${member.id}`}
                          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                        >
                          View Profile
                        </Link>
                        <Link href={action.href} className={cn(buttonVariants({ size: "sm" }))}>
                          {action.label}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {view === "list" && !filterLabel && !q ? <InviteCard /> : null}
    </div>
  );
}

function InviteCard() {
  return (
    <div className="rounded-2xl border border-dashed border-border-slate p-5 text-left">
      <p className="font-bold text-navy">Invite New Member</p>
      <p className="mt-1 text-sm text-slate-500">Onboard to your team</p>
      <Button
        type="button"
        variant="ghost"
        className="mt-3 px-0"
        onClick={() => toast.message("Invite sent to the organisation directory as a mock.")}
      >
        Send invite
      </Button>
    </div>
  );
}
