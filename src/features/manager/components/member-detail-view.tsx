"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getTeamMember } from "@/features/workforce/mock-workforce";

const levels = ["Foundation", "Developing", "Proficient", "Advanced", "Expert"];

export function MemberDetailView({ memberId }: { memberId: string }) {
  const member = getTeamMember(memberId);
  const [level, setLevel] = useState("Advanced");
  const [feedback, setFeedback] = useState("");
  if (!member) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">This person is not on your direct team.</p>
        <Link href="/manager/team" className="text-sm font-bold text-navy">
          Back to the directory
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">Capability Analysis</p>
        }
        title={member.name}
        description={`${member.title} · ${member.dept} · Role match ${member.match}%`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border-slate bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy">Cloud Infrastructure Design</h2>
            <Badge variant="success">Level 4 Met</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">Last verified by you on 12 Oct 2024</p>
          <Link href="/verification/evidence/evidence-james" className="mt-3 inline-block text-xs font-bold tracking-widest text-navy uppercase">
            View Evidence
          </Link>
        </section>
        <section className="rounded-2xl border border-border-slate bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-navy">API Governance</h2>
            <Badge variant="error">Level 2 (Target: 4)</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">Self-assessed at Level 2. No evidence submitted.</p>
          <Link href="/ai-coach/session/sim-ai-gov" className="mt-3 inline-block text-xs font-bold tracking-widest text-navy uppercase">
            Coach Member
          </Link>
        </section>
      </div>
      <section className="rounded-2xl border border-border-slate bg-white p-5">
        <h2 className="text-sm font-bold tracking-wider text-navy uppercase">Awaiting Validation</h2>
        <p className="mt-3 font-bold text-navy">Q4_Gov_Strategy_Draft.pdf</p>
        <p className="text-xs text-slate-400">Uploaded Yesterday · Linked to API Governance</p>
        <p className="mt-3 text-sm text-slate-600">
          This document outlines the proposed security pattern for cross-region API handshakes, addressing the current Level 4 behavioural indicator: Defines and applies ethics frameworks.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={() => toast.message("Indicators opened for API Governance Level 4.")}>
            Review Indicators
          </Button>
          <Link href="/verification/evidence/evidence-james">
            <Button type="button">Verify Capability</Button>
          </Link>
        </div>
      </section>
      <form
        className="rounded-2xl border border-border-slate bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          toast.success("Manager assessment saved", {
            description: `${member.name} rated ${level}. ${feedback || "No written feedback."}`,
          });
        }}
      >
        <h2 className="text-sm font-bold text-navy">Manager Assessment</h2>
        <label className="mt-3 block text-xs font-bold tracking-widest text-slate-400 uppercase" htmlFor="rate">
          Rate Capability
        </label>
        <select
          id="rate"
          className="mt-2 rounded-lg border border-border-slate px-3 py-2 text-sm font-bold text-navy"
          value={level}
          onChange={(event) => setLevel(event.target.value)}
        >
          {levels.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <label className="mt-4 block text-xs font-bold tracking-widest text-slate-400 uppercase" htmlFor="member-feedback">
          Provide Feedback
        </label>
        <Textarea
          id="member-feedback"
          className="mt-2"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
        />
        <Button type="submit" className="mt-4">
          Save assessment
        </Button>
      </form>
      <section className="rounded-2xl border border-border-slate bg-white p-5">
        <h2 className="text-sm font-bold tracking-wider text-navy uppercase">AI Recommendations</h2>
        <div className="mt-4">
          <Badge variant="info">In Progress</Badge>
          <p className="mt-2 font-bold text-navy">API Governance Level 4</p>
          <p className="text-sm text-slate-500">Objective: Master standards. 40%</p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100">
            <div className="h-full w-[40%] rounded-full bg-green-lime" />
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">Upcoming · Stakeholder Influence</p>
      </section>
    </div>
  );
}
