"use client";

import { DownloadIcon, FilterXIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadWorkbookSheets } from "@/lib/spreadsheet";
import { cn } from "@/lib/utils";

import {
  byDepartment,
  byVacancy,
  dropOffByStage,
  filterOptions,
  funnel,
  funnelCandidates,
  metrics,
  timeInStage,
  type GroupRow,
  type InsightFilters,
} from "../services/insights";
import { STAGE_LABEL, type ApplicationStage } from "../types";
import { HrbpGate, useRecruitmentRevision } from "./recruitment-shared";

const selectClass = "h-9 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy";

export function RecruitmentInsightsView() {
  return <HrbpGate>{(ctx) => <Insights organisationId={ctx.organisationId} />}</HrbpGate>;
}

function Insights({ organisationId }: { organisationId: string }) {
  const revision = useRecruitmentRevision();
  const [filters, setFilters] = useState<InsightFilters>({});
  const [metricId, setMetricId] = useState("applications");
  const [stepId, setStepId] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const data = useMemo(() => {
    void revision;
    return {
      options: filterOptions(organisationId),
      metrics: metrics(organisationId, filters),
      funnel: funnel(organisationId, filters),
      vacancies: byVacancy(organisationId, filters),
      departments: byDepartment(organisationId, filters),
      times: timeInStage(organisationId, filters),
      dropOff: dropOffByStage(organisationId, filters),
    };
  }, [organisationId, filters, revision]);

  const set = (key: keyof InsightFilters, value: string) => setFilters((f) => ({ ...f, [key]: value || undefined }));
  const metric = data.metrics.find((m) => m.id === metricId) ?? data.metrics[0]!;
  const tile = (id: string) => data.metrics.find((m) => m.id === id)!;
  const applications = tile("applications").numerator;

  async function exportReport() {
    const filterText = Object.entries(filters)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ") || "none";
    const groupColumns = [
      { header: "Group", width: 34, value: (r: Record<string, string | number | null>) => r.label },
      { header: "Applications", value: (r: Record<string, string | number | null>) => r.applications },
      { header: "Assessments completed", value: (r: Record<string, string | number | null>) => r.assessmentCompleted },
      { header: "Assessment pass rate", value: (r: Record<string, string | number | null>) => r.assessmentPassRate },
      { header: "Interviews completed", value: (r: Record<string, string | number | null>) => r.interviewCompleted },
      { header: "Qualified", value: (r: Record<string, string | number | null>) => r.qualified },
      { header: "Selected", value: (r: Record<string, string | number | null>) => r.selected },
    ];
    await downloadWorkbookSheets(`recruitment-insights-${new Date().toISOString().slice(0, 10)}`, [
      {
        sheetName: "Metrics",
        columns: [
          { header: "Metric", width: 34, value: (r) => r.label },
          { header: "Value", value: (r) => r.value },
          { header: "Numerator", value: (r) => r.numerator },
          { header: "Denominator (sample size)", width: 26, value: (r) => r.denominator },
          { header: "Definition", width: 90, value: (r) => r.definition },
          { header: "Filters", width: 40, value: () => filterText },
        ],
        rows: data.metrics.map((m) => ({ ...m })),
      },
      {
        sheetName: "Funnel",
        columns: [
          { header: "Stage", width: 32, value: (r) => r.label },
          { header: "Candidates", value: (r) => r.count },
          { header: "Conversion from previous", width: 26, value: (r) => r.conversion },
          { header: "Drop-off", value: (r) => r.dropOff },
        ],
        rows: data.funnel.map((s) => ({ ...s })),
      },
      { sheetName: "By vacancy", columns: groupColumns, rows: data.vacancies.map((g) => ({ ...g })) },
      { sheetName: "By department", columns: groupColumns, rows: data.departments.map((g) => ({ ...g })) },
      {
        sheetName: "Time in stage",
        columns: [
          { header: "Measure", width: 40, value: (r) => r.label },
          { header: "Average", value: (r) => r.averageDays },
          { header: "Median", value: (r) => r.medianDays },
          { header: "Sample size", value: (r) => r.sample },
          { header: "Definition", width: 70, value: (r) => r.definition },
        ],
        rows: data.times.map((t) => ({ ...t })),
      },
    ]);
    toast.success("Recruitment report exported.");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Recruitment Insights"
        description="Recruitment funnel, conversion, drop-off and time in stage, calculated from candidate records. Every metric shows its definition and sample size."
        actions={
          <Button type="button" variant="secondary" onClick={() => void exportReport()}>
            <DownloadIcon aria-hidden />
            Export Report
          </Button>
        }
      />

      <section className="flex flex-col gap-3 rounded-xl border border-border-slate bg-white p-4 lg:flex-row lg:flex-wrap lg:items-end" aria-label="Filters">
        <label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          From
          <Input type="date" className="mt-1 h-9" value={filters.from ?? ""} onChange={(e) => set("from", e.target.value)} />
        </label>
        <label className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
          To
          <Input type="date" className="mt-1 h-9" value={filters.to ?? ""} onChange={(e) => set("to", e.target.value)} />
        </label>
        {(
          [
            ["vacancyId", "Vacancy", data.options.vacancies.map((v) => [v.id, v.title])],
            ["department", "Department", data.options.departments.map((d) => [d, d])],
            ["location", "Location", data.options.locations.map((l) => [l, l])],
            ["recruiter", "Recruiter", data.options.recruiters.map((r) => [r, r])],
            ["stage", "Current stage", (Object.keys(STAGE_LABEL) as ApplicationStage[]).map((s) => [s, STAGE_LABEL[s]])],
          ] as Array<[keyof InsightFilters, string, string[][]]>
        ).map(([key, label, options]) => (
          <select key={key} aria-label={label} className={selectClass} value={(filters[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)}>
            <option value="">{label}: All</option>
            {options.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setFilters({})}>
          <FilterXIcon aria-hidden />
          Reset
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            ["Applications", tile("applications").value],
            ["Assessments completed", String(data.funnel.find((s) => s.id === "a_completed")!.count)],
            ["Qualified", tile("qualified").value],
            ["Physical interview", tile("selections").value],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="stages">Stage Performance</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
            <table className="w-full text-left text-sm" aria-label="Metrics">
              <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Basis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-slate">
                {data.metrics.map((m) => (
                  <tr
                    key={m.id}
                    className={cn("cursor-pointer hover:bg-slate-50", m.id === metric.id && "bg-slate-50")}
                    onClick={() => setMetricId(m.id)}
                  >
                    <td className="px-4 py-3">
                      <button type="button" className="font-semibold text-navy hover:underline" onClick={() => setMetricId(m.id)}>
                        {m.label}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-bold text-navy">{m.value}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {m.denominator === null ? `n = ${m.numerator}` : `${m.numerator} of ${m.denominator} (n = ${m.denominator})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="rounded-xl border border-border-slate bg-white p-5" aria-label="Metric definition">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Selected metric</p>
            <p className="mt-1 text-lg font-bold text-navy">{metric.label}</p>
            <p className="mt-1 text-3xl font-bold text-navy">{metric.value}</p>
            <p className="mt-3 text-sm text-slate-600">{metric.definition}</p>
            <p className="mt-3 text-xs text-slate-500">
              {metric.denominator === null
                ? `Count: ${metric.numerator}.`
                : `Numerator ${metric.numerator} · denominator ${metric.denominator}.${metric.denominator < 10 ? " Small sample: interpret with care." : ""}`}
            </p>
          </aside>
        </TabsContent>

        <TabsContent value="funnel" className="mt-6 space-y-6">
          <section className="rounded-xl border border-border-slate bg-white p-5" aria-label="Recruitment funnel">
            <h2 className="font-bold text-navy">Recruitment funnel</h2>
            <p className="text-xs text-slate-500">Select a stage to see the candidates counted in it. Conversion is from the stage above.</p>
            <ol className="mt-4 space-y-2">
              {data.funnel.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setStepId(stepId === s.id ? null : s.id)}
                    className={cn("w-full rounded-lg p-2 text-left hover:bg-slate-50", stepId === s.id && "bg-slate-50 ring-1 ring-navy")}
                    aria-pressed={stepId === s.id}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-navy">{s.label}</span>
                      <span className="text-xs text-slate-500">
                        {s.count} · conversion {s.conversion}
                        {s.dropOff ? ` · ${s.dropOff} dropped` : ""}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-green-lime" style={{ width: `${applications ? (s.count / applications) * 100 : 0}%` }} />
                    </div>
                  </button>
                  {stepId === s.id ? (
                    <ul className="mt-1 ml-2 space-y-1 border-l border-border-slate pl-3 text-sm" aria-label={`Candidates at ${s.label}`}>
                      {funnelCandidates(organisationId, filters, s.id).map((c) => (
                        <li key={c.id}>
                          <Link href={`/talent/candidates/${c.id}`} className="font-semibold text-navy hover:underline">
                            {c.name}
                          </Link>{" "}
                          <span className="text-xs text-slate-500">
                            {c.vacancy} · {STAGE_LABEL[c.stage]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
          <GroupTable title="By vacancy" rows={data.vacancies} />
          <GroupTable title="By department" rows={data.departments} />
        </TabsContent>

        <TabsContent value="stages" className="mt-6 space-y-6">
          <div className="overflow-x-auto rounded-xl border border-border-slate bg-white">
            <table className="w-full text-left text-sm" aria-label="Time in stage">
              <thead className="bg-slate-50 text-[10px] tracking-widest text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Measure</th>
                  <th className="px-4 py-3">Average</th>
                  <th className="px-4 py-3">Median</th>
                  <th className="px-4 py-3">Sample size</th>
                  <th className="px-4 py-3">Definition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-slate">
                {data.times.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 font-semibold text-navy">{t.label}</td>
                    <td className="px-4 py-3">{t.averageDays}</td>
                    <td className="px-4 py-3">{t.medianDays}</td>
                    <td className="px-4 py-3">n = {t.sample}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{t.definition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="rounded-xl border border-border-slate bg-white p-5" aria-label="Where candidates did not progress">
            <h2 className="font-bold text-navy">Where candidates did not progress</h2>
            {data.dropOff.length ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {data.dropOff.map((d) => (
                  <li key={d.stage}>
                    After <span className="font-semibold text-navy">{STAGE_LABEL[d.stage]}</span>: {d.count}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No candidates have been marked Not Progressed for these filters.</p>
            )}
          </section>
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <section className="space-y-3 rounded-xl border border-border-slate bg-white p-6">
            <h2 className="font-bold text-navy">Export recruitment report</h2>
            <p className="text-sm text-slate-600">
              One Excel workbook with the metrics (value, numerator, denominator and definition), funnel, results by vacancy and department,
              and time in stage, for the filters currently applied. Candidate names and answers are not included.
            </p>
            <Button type="button" onClick={() => void exportReport()}>
              <DownloadIcon aria-hidden />
              Export Report
            </Button>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-border-slate bg-white">
      <table className="w-full text-left text-sm" aria-label={title}>
        <caption className="px-4 pt-4 text-left font-bold text-navy">{title}</caption>
        <thead className="text-[10px] tracking-widest text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-3" />
            <th className="px-4 py-3">Applications</th>
            <th className="px-4 py-3">Assessments completed</th>
            <th className="px-4 py-3">Assessment pass rate</th>
            <th className="px-4 py-3">Interviews completed</th>
            <th className="px-4 py-3">Qualified</th>
            <th className="px-4 py-3">Selected</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-slate">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-4 text-center text-slate-500">
                No applications for these filters.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-3 font-semibold text-navy">{r.label}</td>
                <td className="px-4 py-3">{r.applications}</td>
                <td className="px-4 py-3">{r.assessmentCompleted}</td>
                <td className="px-4 py-3">{r.assessmentPassRate}</td>
                <td className="px-4 py-3">{r.interviewCompleted}</td>
                <td className="px-4 py-3">{r.qualified}</td>
                <td className="px-4 py-3">{r.selected}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
