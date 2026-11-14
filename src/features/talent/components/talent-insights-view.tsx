"use client";

import { useMemo } from "react";
import { ChartColumnIcon, CircleAlertIcon, CircleCheckIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  historicalOutcomes,
  insightStats,
  regionalSalesComparison,
  regionalSalesSkillSignals,
  talentInsightsText,
  weakInternalRoles,
  type OutcomeRow,
  type RoleComparisonRow,
  type SkillSignalRow,
  type WeakRoleRow,
} from "@/features/talent/services/mock-insights";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

const readinessVariant = {
  Ready: "success",
  "Near Ready": "warning",
  "Not Ready": "error",
} as const;

export function TalentInsightsView() {
  const user = useHydratedUser();
  const comparison = useMemo(() => regionalSalesComparison(), []);
  const skills = useMemo(() => regionalSalesSkillSignals(), []);
  const weakRoles = useMemo(() => weakInternalRoles(), []);
  const outcomes = useMemo(() => historicalOutcomes(), []);
  const external = comparison.find((row) => row.source === "External candidate");
  const internal = comparison.find((row) => row.source === "Internal employee");

  const comparisonColumns = useMemo<DataTableColumn<RoleComparisonRow>[]>(
    () => [
      {
        id: "name",
        header: "Person",
        cell: (row) => <span className="font-bold text-navy">{row.name}</span>,
      },
      { id: "source", header: "Source", accessorKey: "source" },
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
      { id: "external", header: "External candidate", accessorKey: "external" },
      { id: "internal", header: "Internal employee", accessorKey: "internal" },
      {
        id: "signal",
        header: "Signal",
        cell: (row) => <Badge variant={row.signal === "Strength" ? "success" : "warning"}>{row.signal}</Badge>,
      },
    ],
    [],
  );
  const weakColumns = useMemo<DataTableColumn<WeakRoleRow>[]>(
    () => [
      { id: "role", header: "Role", accessorKey: "role" },
      { id: "percent", header: "Internal readiness", cell: (row) => `${row.percent}%` },
    ],
    [],
  );
  const outcomeColumns = useMemo<DataTableColumn<OutcomeRow>[]>(
    () => [
      {
        id: "name",
        header: "Person",
        cell: (row) => <span className="font-bold text-navy">{row.name}</span>,
      },
      { id: "source", header: "Source", accessorKey: "source" },
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
        description="Compare external candidates and internal employees on the same role, then review strengths, gaps, completion, and outcomes."
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Completion rate"
          value={insightStats.completionRate}
          delta={`${insightStats.completedCount} of ${insightStats.totalCount}`}
          icon={CircleCheckIcon}
          iconWellClassName="bg-green-50 text-green-deep"
        />
        <StatCard
          label="Regional Sales Manager"
          value={internal && external ? `${internal.result - external.result}pp` : "—"}
          delta="Internal ahead of external"
          icon={UsersIcon}
        />
        <StatCard
          label="Weak internal readiness"
          value={String(insightStats.weakRoleCount)}
          delta="Roles below 70%"
          deltaTone="warning"
          icon={CircleAlertIcon}
          iconWellClassName="bg-amber-50 text-amber-700"
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
        <h2 className="font-bold text-navy">Regional Sales Manager</h2>
        <p className="text-xs text-slate-400">
          David Kalu is the external candidate. Tunde Martins is the internal employee. Both are already on the overview.
        </p>
        <DataTable columns={comparisonColumns} data={comparison} getRowId={(row) => row.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-navy">Skills strengths and gaps</h2>
        <DataTable columns={skillColumns} data={skills} getRowId={(row) => row.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-navy">Roles with weak internal readiness</h2>
        <DataTable columns={weakColumns} data={weakRoles} getRowId={(row) => row.role} />
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-navy">Historical outcomes</h2>
        <DataTable columns={outcomeColumns} data={outcomes} getRowId={(row) => row.id} />
      </section>
    </div>
  );
}
