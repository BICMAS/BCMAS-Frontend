"use client";

import Link from "next/link";
import { toast } from "sonner";

import { FileDropzone } from "@/components/shared/file-dropzone";
import { PageHeader } from "@/components/shared/page-header";
import { getGrowthPlan, getTeamMember } from "@/features/workforce/mock-workforce";

export function GrowthPathwayView({ planId }: { planId: string }) {
  const plan = getGrowthPlan(planId);
  const member = plan ? getTeamMember(plan.memberId) : null;
  if (!plan || !member) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">This growth pathway is not in the current plans.</p>
        <Link href="/ld" className="text-sm font-bold text-navy">
          Back to Growth Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        breadcrumbs={
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">{member.name}</p>
        }
        title={plan.skill}
        description={`Due ${plan.due}. Assigned owner: ${plan.owner}.`}
      />
      <ol className="space-y-4">
        <li className="rounded-2xl border border-border-slate bg-white p-5">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">1. Identified Skill Gap</p>
          <p className="mt-2 text-sm text-navy">
            Verified {plan.verifiedLevel}. Required {plan.requiredLevel}. Verified proficiency is significantly below role requirements. Priority: High.
          </p>
        </li>
        <li className="rounded-2xl border border-border-slate bg-white p-5">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">2. Development Objective</p>
          <p className="mt-2 text-sm text-navy">{plan.objective}</p>
        </li>
        <li className="rounded-2xl border border-border-slate bg-white p-5">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">3. Recommended Learning</p>
          <Link href="/learning" className="mt-2 block text-sm font-bold text-navy">
            {plan.learningTitle}
          </Link>
          <p className="text-xs text-slate-500">{plan.learningMeta}</p>
        </li>
        <li className="rounded-2xl border border-border-slate bg-white p-5">
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">4. Workplace Practice</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-navy">
            {plan.practices.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </li>
      </ol>
      <section className="rounded-2xl border border-border-slate bg-white p-5">
        <h2 className="text-sm font-bold text-navy">Execution & Evidence</h2>
        <p className="mt-1 text-xs text-slate-500">Evidence of completion for {plan.owner}.</p>
        <FileDropzone
          className="mt-4"
          accept=".pdf,.png,.jpg,.doc,.docx"
          title="Upload Practice Evidence"
          hint="PDF, image, or document up to 10MB"
          maxBytes={10 * 1024 * 1024}
          onFile={(file) => {
            toast.success("Evidence uploaded", { description: file.name });
          }}
        />
      </section>
      <section className="rounded-2xl border border-dashed border-border-slate bg-slate-50 p-5">
        <h2 className="text-sm font-bold text-navy">8. Reassessment Outcome</h2>
        <p className="mt-2 text-sm text-slate-500">
          Unlock this section once evidence is verified by the owner.
        </p>
      </section>
    </div>
  );
}
