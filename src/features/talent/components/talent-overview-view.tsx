"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  listTalentAssessments,
  roleReadiness,
  talentAssessmentHref,
  talentMethods,
  talentMetrics,
  talentPipeline,
  talentPipelineGradient,
  talentPipelineTotal,
  talentReportText,
  type TalentAssessment,
} from "@/features/talent/services/mock-talent";
import { cn } from "@/lib/utils";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

export function TalentOverviewView() {
  const router = useRouter();
  const assessments = listTalentAssessments();

  const columns = useMemo<DataTableColumn<TalentAssessment>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (row) => (
          <Link
            href={talentAssessmentHref(row)}
            className="font-bold text-navy"
            onClick={(event) => event.stopPropagation()}
          >
            {row.name}
          </Link>
        ),
      },
      {
        id: "type",
        header: "Assessment Type",
        cell: (row) => (row.type === "recruitment" ? "Recruitment" : "Promotion"),
      },
      { id: "role", header: "Target Role", accessorKey: "targetRole" },
      {
        id: "result",
        header: "Result",
        cell: (row) => <span className="font-bold text-navy">{row.result}%</span>,
      },
      {
        id: "readiness",
        header: "Readiness",
        cell: (row) => <Badge variant={readinessVariant[row.readiness]}>{row.readiness}</Badge>,
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => <Badge variant="success">{row.status}</Badge>,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Talent Assessment & Selection"
        description="Assess candidates and employees against role requirements for recruitment, promotion and internal mobility."
        actions={
          <Link href="/talent/recruitment/new" className={cn(buttonVariants())}>
            Create Assessment
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {talentMetrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{metric.label}</p>
            <p className="mt-2 text-3xl font-bold text-navy">{metric.value}</p>
            <p className="text-[10px] font-bold text-slate-400">{metric.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <h2 className="font-bold text-navy">Assessment Pipeline</h2>
          <p className="text-xs text-slate-400">Status of all talent assessments</p>
          <div className="mt-6 flex flex-wrap items-center gap-8">
            <div
              className="grid size-36 place-items-center rounded-full"
              style={{ background: `conic-gradient(${talentPipelineGradient})` }}
              aria-label={`${talentPipelineTotal} total assessments`}
            >
              <div className="grid size-24 place-items-center rounded-full bg-white text-center">
                <span>
                  <span className="block text-2xl font-bold text-navy">{talentPipelineTotal}</span>
                  <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Total</span>
                </span>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              {talentPipeline.map((slice) => (
                <li key={slice.label} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ background: slice.color }} />
                  <span className="font-bold text-navy">{slice.label}</span>
                  <span className="text-slate-500">
                    {slice.count} ({slice.share})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
          <h2 className="font-bold text-navy">Role Readiness (Promotion)</h2>
          <p className="text-xs text-slate-400">Employee readiness for target roles</p>
          <div className="mt-6 space-y-4">
            {roleReadiness.map((item) => (
              <div key={item.role}>
                <div className="mb-1 flex justify-between text-xs font-bold text-navy">
                  <span>{item.role}</span>
                  <span>{item.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-green-lime" style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-navy">Recent Talent Assessments</h2>
            <p className="text-xs text-slate-400">Latest recruitment and promotion assessments</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const blob = new Blob([talentReportText()], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "talent-assessments.txt";
              anchor.click();
              URL.revokeObjectURL(url);
              toast.success("Talent report exported");
            }}
          >
            Export
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={assessments}
          onRowClick={(row) => router.push(talentAssessmentHref(row))}
        />
      </section>

      <section>
        <h2 className="font-bold text-navy">Assessment Methods</h2>
        <p className="text-xs text-slate-400">
          Multiple, role-relevant methods for a comprehensive evaluation
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {talentMethods.map((method) => {
            const body = (
              <>
                <p className="font-bold text-navy">{method.title}</p>
                <p className="text-xs text-slate-500">{method.detail}</p>
              </>
            );
            return method.href ? (
              <Link
                key={method.id}
                href={method.href}
                className="rounded-2xl border border-border-slate bg-white p-4 shadow-sm hover:border-navy"
              >
                {body}
              </Link>
            ) : (
              <div key={method.id} className="rounded-2xl border border-border-slate bg-white p-4 shadow-sm">
                {body}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
