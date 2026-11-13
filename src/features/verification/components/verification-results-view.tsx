"use client";

import Link from "next/link";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTeamMember, jamesVerificationStatus } from "@/features/workforce/mock-workforce";

const audit = [
  ["14 Oct 2024", "Verified: Cloud Infra", "Outcome: Met (Level 4)", "Michael Kyle"],
  ["12 Oct 2024", "Evidence Submitted", "Ref: PaymentGateway_Arch_V2.pdf", "James Miller"],
  ["10 Oct 2024", "Self-Assessment Done", "Self-Rating: Level 4", "James Miller"],
  ["01 Oct 2024", "Cycle Initiated", "2024 Global Review", "System Trigger"],
];

export function VerificationResultsView() {
  const james = getTeamMember("james");
  const status = jamesVerificationStatus();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
            Verification Hub / Results: James Miller
          </p>
        }
        title="James Miller"
        description={`Senior Solutions Architect · 2024 Verification ${status === "Verified" ? "Complete" : "In review"}`}
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const blob = new Blob(
                  ["James Miller\nCloud Infrastructure Design: Level 4 Met\nAPI Governance: Level 2 (Target 4)\n"],
                  { type: "text/plain" },
                );
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "james-miller-audit.txt";
                anchor.click();
                URL.revokeObjectURL(url);
                toast.success("Audit exported");
              }}
            >
              Export Full Audit
            </Button>
            <Link href="/assessments/cycle-2024">
              <Button type="button">Trigger Reassessment</Button>
            </Link>
          </>
        }
      />
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Cloud Infrastructure Design", "Level 4 Met", "success"],
          ["API Governance", "Level 2 (Target: 4)", "error"],
          ["Cyber Security Ops", "Level 3 Met", "success"],
        ].map(([name, result, tone]) => (
          <div key={name} className="rounded-2xl border border-border-slate bg-white p-5">
            <p className="text-sm font-bold text-navy">{name}</p>
            <Badge className="mt-3" variant={tone === "success" ? "success" : "error"}>
              {result}
            </Badge>
          </div>
        ))}
      </section>
      <section className="overflow-hidden rounded-xl border border-border-slate bg-white">
        <h2 className="border-b border-border-slate px-6 py-4 text-sm font-bold tracking-wider text-navy uppercase">
          Critical Gaps Remaining
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="font-bold text-navy">API Governance</p>
            <p className="text-xs text-slate-500">Gap size -2 levels</p>
          </div>
          <Badge variant="error">Critical</Badge>
          <Link href="/growth/plan-james-ai" className="text-xs font-bold tracking-widest text-navy uppercase">
            Assign Learning
          </Link>
        </div>
      </section>
      <section className="rounded-xl border border-border-slate bg-white p-6">
        <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Verification Audit Trail</h2>
        <ol className="mt-4 space-y-4">
          {audit.map(([date, title, detail, actor]) => (
            <li key={title} className="border-l-2 border-green-lime pl-4">
              <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{date}</p>
              <p className="font-bold text-navy">{title}</p>
              <p className="text-sm text-slate-500">{detail}</p>
              <p className="text-xs text-slate-400">{actor}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="rounded-2xl bg-navy p-6 text-white">
        <h2 className="text-sm font-bold">Historical Preserve</h2>
        <p className="mt-2 text-sm text-white/70">
          Previous assessment results from 2023 are preserved for long-term capability trending and ROI analysis.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          onClick={() => toast.message("2023 archive", { description: "Annual performance completion was 94%." })}
        >
          View 2023 Archive
        </Button>
        {james ? <p className="mt-4 text-xs text-white/50">Profile {james.title}</p> : null}
      </section>
    </div>
  );
}
