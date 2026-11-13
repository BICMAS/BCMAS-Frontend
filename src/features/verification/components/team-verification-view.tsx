"use client";

import Link from "next/link";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getTeamMember, jamesVerificationStatus, teamMembers } from "@/features/workforce/mock-workforce";

export function TeamVerificationView() {
  const james = getTeamMember("james");
  const robert = teamMembers.find((member) => member.id === "robert");
  const sarah = teamMembers.find((member) => member.id === "sarah-connor");
  const jamesStatus = jamesVerificationStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Assessment Hub / Team Verification
          </p>
        }
        title="Team Verification Hub"
        description="Review and verify self-assessments completed by your team members for the 2024 Global Capability Review."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const blob = new Blob(
                [`James Miller,${jamesStatus}\nRobert Chen,In Progress (60%)\nSarah Connor,Verified Match 98%\n`],
                { type: "text/plain" },
              );
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "team-verification.txt";
              anchor.click();
              URL.revokeObjectURL(url);
              toast.success("Team status exported");
            }}
          >
            Export Team Status
          </Button>
        }
      />
      <div className="grid gap-4">
        {james ? (
          <article className="rounded-2xl border border-border-slate bg-white p-6">
            <h2 className="text-lg font-bold text-navy">{james.name}</h2>
            <p className="text-sm text-slate-500">
              {james.title} · {james.dept}
            </p>
            <p className="mt-3 text-sm">
              Status <span className="font-bold text-navy">{jamesStatus}</span> · Self-Match 95% · Gaps Found 1
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => toast.message("Change request sent to James Miller.")}
              >
                Request Changes
              </Button>
              <Link href="/verification/evidence/evidence-james">
                <Button type="button">Start Verification</Button>
              </Link>
            </div>
          </article>
        ) : null}
        {robert ? (
          <article className="rounded-2xl border border-border-slate bg-white p-6">
            <h2 className="text-lg font-bold text-navy">{robert.name}</h2>
            <p className="text-sm text-slate-500">
              {robert.title} · {robert.dept}
            </p>
            <p className="mt-3 text-sm">
              Status <span className="font-bold text-navy">In Progress (60%)</span> · Self-Match —
            </p>
            <Button
              type="button"
              className="mt-4"
              variant="secondary"
              onClick={() => toast.success("Nudge sent to Robert Chen.")}
            >
              Nudge Employee
            </Button>
          </article>
        ) : null}
        {sarah ? (
          <article className="rounded-2xl border border-border-slate bg-white p-6">
            <h2 className="text-lg font-bold text-navy">{sarah.name}</h2>
            <p className="text-sm text-slate-500">
              {sarah.title} · {sarah.dept}
            </p>
            <p className="mt-3 text-sm">
              Verified Match: 98% · Verified Date 14 Oct 2024
            </p>
            <Link href="/verification/results" className="mt-4 inline-block text-xs font-bold tracking-widest text-navy uppercase">
              View Full Results
            </Link>
          </article>
        ) : null}
      </div>
    </div>
  );
}
