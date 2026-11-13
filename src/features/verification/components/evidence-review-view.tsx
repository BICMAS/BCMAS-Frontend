"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  elena,
  getEvidence,
  getTeamMember,
  submitVerification,
  type EvidenceDecision,
} from "@/features/workforce/mock-workforce";
import { cn } from "@/lib/utils";

const decisions: { id: EvidenceDecision; label: string; detail: string }[] = [
  { id: "verified", label: "Verified", detail: "Capability requirements met." },
  { id: "more_evidence", label: "More Evidence Required", detail: "Ask employee to provide more proof." },
  { id: "not_verified", label: "Not Yet Verified", detail: "Criteria not currently met." },
];

const indicators = [
  "Designs complex infrastructure solutions that satisfy business requirements for high availability and zero-trust security.",
  "Establishes global cloud governance standards and ensures adherence across multi-disciplinary squads.",
  "Mentors Lead Architects on multi-cloud interoperability and vendor management strategy.",
];

export function EvidenceReviewView({ evidenceId }: { evidenceId: string }) {
  const router = useRouter();
  const initial = getEvidence(evidenceId);
  const [decision, setDecision] = useState<EvidenceDecision | "">(initial?.decision ?? "");
  const [feedback, setFeedback] = useState(initial?.feedback ?? "");
  const [pending, setPending] = useState(false);
  if (!initial) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">This evidence item is not in the queue.</p>
        <Link href="/verification/team" className="text-sm font-bold text-navy">
          Back to the queue
        </Link>
      </div>
    );
  }
  const member = getTeamMember(initial.memberId) ?? (initial.memberId === "elena" ? elena : null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={member?.name ?? "Evidence review"}
        description={`${member && "title" in member ? member.title : ""} · Profile V2.4 Approved · Assessment Date: 12 Oct 2024`}
      />
      <section className="rounded-2xl border border-border-slate bg-white p-6">
        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">1 · {initial.skill}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-navy">Required Level 4 (Expert)</p>
          <p className="text-sm text-navy">Self-Assessed Level 4 (Expert)</p>
        </div>
        <blockquote className="mt-4 text-sm leading-relaxed text-slate-600">“{initial.quote}”</blockquote>
        {initial.fileName ? (
          <p className="mt-3 text-sm font-bold text-navy">
            {initial.fileName} <span className="font-medium text-slate-400">{initial.fileMeta}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm font-bold text-red-600">{initial.fileMeta}</p>
        )}
        {initial.memberId === "james" ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-navy">
            {indicators.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <form
        className="rounded-2xl border border-border-slate bg-white p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!decision) {
            toast.error("Choose a verification decision.");
            return;
          }
          setPending(true);
          try {
            await submitVerification(initial.id, decision, feedback);
            toast.success("Verification submitted");
            router.push("/verification/team");
          } finally {
            setPending(false);
          }
        }}
      >
        <h2 className="text-sm font-bold text-navy">Manager Validation</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review the evidence against required indicators and make a final verification decision.
        </p>
        <div className="mt-4 space-y-2">
          {decisions.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3",
                decision === option.id ? "border-navy bg-slate-50" : "border-border-slate",
              )}
            >
              <input
                type="radio"
                name="decision"
                className="mt-1"
                checked={decision === option.id}
                onChange={() => setDecision(option.id)}
              />
              <span>
                <span className="block text-sm font-bold text-navy">{option.label}</span>
                <span className="text-xs text-slate-500">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="mt-4 block text-xs font-bold tracking-widest text-slate-400 uppercase" htmlFor="feedback">
          Feedback for Employee
        </label>
        <Textarea
          id="feedback"
          className="mt-2"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="What should the employee see with this decision?"
        />
        <Button type="submit" className="mt-4" disabled={pending}>
          Submit Verification
        </Button>
        <p className="mt-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Final step in cycle</p>
      </form>
    </div>
  );
}
