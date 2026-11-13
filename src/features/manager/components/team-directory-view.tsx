"use client";

import Link from "next/link";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { teamMembers } from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

export function TeamDirectoryView() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">Team Hub / Directory</p>
        }
        title="My Direct Reports"
        description="Manage individual performance reviews, verified capabilities, and growth plans for your team."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teamMembers.map((member) => (
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
                <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Role Match</dt>
                <dd className="font-bold text-navy">{member.match}%</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  {member.gaps ? "Gaps" : member.evidenceCount ? "Evidence" : "Growth"}
                </dt>
                <dd className="font-bold text-navy">
                  {member.gaps ? `${member.gaps} Critical` : member.evidenceCount ? `${member.evidenceCount} New` : member.growth}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/manager/team/${member.id}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
                View Profile
              </Link>
              <Link
                href={
                  member.id === "sarah-connor"
                    ? "/verification/team"
                    : member.id === "robert"
                      ? "/growth/plan-robert-infra"
                      : "/growth/plan-james-ai"
                }
                className={cn(buttonVariants({ size: "sm" }))}
              >
                {member.id === "sarah-connor" ? "Verify Evidence" : "Review Growth"}
              </Link>
            </div>
          </article>
        ))}
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
      </div>
    </div>
  );
}
