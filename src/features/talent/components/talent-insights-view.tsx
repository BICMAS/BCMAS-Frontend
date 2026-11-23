"use client";

import { useMemo } from "react";
import { ChartColumnIcon, CircleCheckIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  candidateComparison,
  historicalOutcomes,
  insightStats,
  skillSignals,
  talentInsightsText,
  type CandidateComparisonRow,
  type OutcomeRow,
  type SkillSignalRow,
} from "@/features/talent/services/mock-insights";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

export function TalentInsightsView() {
  const user = useHydratedUser();
  const comparison = useMemo(() => candidateComparison(), []);
  const skills = useMemo(() => skillSignals(), []);
  const outcomes = useMemo(() => historicalOutcomes(), []);

  const comparisonColumns = useMemo<DataTableColumn<CandidateComparisonRow>[]>(
    () => [
      {
        id: "name",
        header: "Candidate",
        cell: (row) => <span className="font-bold text-navy">{row.name}</span>,
      },
      { id: "role", header: "Role", accessorKey: "role" },
      { id: "result", header: "Result", cell: (row) => `${row.result}%` },
      {
        id: "readiness",
        header: "Readiness",
        cell: (row) => <Badge variant={readinessVariant[row.readiness]}>{row.readiness}</Badge>,
      },
    ],
    [],
  );
  const skillColumns = useMemo<DataTableColumn<SkillSignalRow>[]>(
    () => [
      { id: "skill", header: "Skill", accessorKey: "skill" },
      { id: "ready", header: "Candidates ready", cell: (row) => `${row.ready} of ${row.assessed}` },
      {
        id: "signal",
        header: "Signal",
        cell: (row) => <Badge variant={row.signal === "Strength" ? "success" : "warning"}>{row.signal}</Badge>,
      },
    ],
    [],
  );
  const outcomeColumns = useMemo<DataTableColumn<OutcomeRow>[]>(
    () => [
      {
        id: "name",
        header: "Candidate",
        cell: (row) => <span className="font-bold text-navy">{row.name}</span>,
      },
      { id: "role", header: "Role", accessorKey: "role" },
      { id: "result", header: "Result", cell: (row) => `${row.result}%` },
      {
        id: "readiness",
        header: "Readiness",
        cell: (row) => <Badge variant={readinessVariant[row.readiness]}>{row.readiness}</Badge>,
      },
      { id: "outcome", header: "Outcome", accessorKey: "outcome" },
    ],
    [],
  );

  if (!user) return null;
  if (user.portal !== "hr_ld_admin") {
    return <p className="text-sm text-slate-500">Talent insights are for HR / L&D.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Talent Insights"
        description="Compare recruitment candidates against role requirements, then review skill strengths, gaps, completion and outcomes."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const blob = new Blob([talentInsightsText()], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "talent-insights.txt";
              anchor.click();
              URL.revokeObjectURL(url);
              toast.success("Insights downloaded");
            }}
          >
            Export
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Completion rate"
          value={insightStats.completionRate}
          delta={`${insightStats.completedCount} of ${insightStats.totalCount}`}
          icon={CircleCheckIcon}
          iconWellClassName="bg-green-50 text-green-deep"
        />
        <StatCard
          label="Candidates rated Ready"
          value={insightStats.readyRate}
          delta="Of completed assessments"
          deltaTone="neutral"
          icon={UsersIcon}
        />
        <StatCard
          label="Historical outcomes"
          value={String(insightStats.recordedOutcomes)}
          delta="Overview records"
          deltaTone="neutral"
          icon={ChartColumnIcon}
        />
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-navy">Candidate comparison</h2>
        <p className="text-xs text-slate-400">Completed recruitment assessments, highest result first.</p>
        <DataTable columns={comparisonColumns} data={comparison} getRowId={(row) => row.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-navy">Skills strengths and gaps</h2>
        <DataTable columns={skillColumns} data={skills} getRowId={(row) => row.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-navy">Historical outcomes</h2>
        <DataTable columns={outcomeColumns} data={outcomes} getRowId={(row) => row.id} />
      </section>
    </div>
  );
}
