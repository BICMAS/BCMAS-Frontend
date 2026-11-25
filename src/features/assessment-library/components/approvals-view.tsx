"use client";

import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";

import type { UserPortal } from "@/types";

import { canApproveOrgAssessments, listOrgAssessments } from "../services/org-library";
import { OrgLibraryGate, useOrgLibraryRevision } from "./org-shared";

/** The HR Admin's list of organisation assessments waiting for approval. */
export function ApprovalsView() {
  return <OrgLibraryGate approvers>{(ctx) => <Approvals {...ctx} />}</OrgLibraryGate>;
}

function Approvals({ organisationId, actor, portal }: { organisationId: string; actor: string; portal: UserPortal }) {
  useOrgLibraryRevision();
  if (!canApproveOrgAssessments(portal)) {
    return <p className="text-sm text-slate-500">Assessment approvals are for the HR Admin.</p>;
  }
  const waiting = listOrgAssessments(organisationId).filter((a) => a.inReview);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Assessment Approvals"
        description="HRBPs build recruitment assessments and submit them here. Candidates only receive an assessment after an HR Admin approves it."
      />
      {waiting.length ? (
        <ul className="space-y-3">
          {waiting.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-slate bg-white p-5">
              <div>
                <p className="font-bold text-navy">{a.name}</p>
                <p className="text-xs text-slate-500">
                  v{a.pending?.version ?? a.version}
                  {a.linkedRole ? ` · ${a.linkedRole}` : ""} · {a.itemCount} items
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="info">In review</Badge>
                <Link href={`/talent/library/${a.id}/review`} className="text-sm font-bold text-navy hover:underline">
                  Review<span className="sr-only"> {a.name}</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-border-slate bg-white p-6 text-sm text-slate-500">Nothing is waiting for approval, {actor.split(" ")[0]}.</p>
      )}
    </div>
  );
}
