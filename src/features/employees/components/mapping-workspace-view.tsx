"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, BadgeCheckIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button, buttonVariants } from "@/components/ui/button";
import type {
  EmployeeRecord,
  MappingRoleOption,
  MappingWorkspace,
} from "@/features/employees/types";
import {
  finaliseMapping,
  saveMappingProgress,
} from "@/features/employees/services/mock-mapping";
import { cn } from "@/lib/utils";

type MappingWorkspaceViewProps = {
  employees: EmployeeRecord[];
  roles: MappingRoleOption[];
  workspaces: MappingWorkspace[];
};

type ComparisonRow = {
  skill: string;
  required: number;
  assessed: number | null;
  suggestion?: string;
};

/** Required level (role) vs assessed level (employee) for every skill the role needs. */
function buildComparison(workspace: MappingWorkspace): ComparisonRow[] {
  const assessed = new Map(workspace.verifiedSkills.map((s) => [s.name, s.level]));
  const rows: ComparisonRow[] = workspace.targetSkills.map((t) => ({
    skill: t.name,
    required: t.level,
    assessed: assessed.get(t.name) ?? null,
  }));
  for (const gap of workspace.gaps) {
    const existing = rows.find((r) => r.skill === gap.skill);
    if (existing) {
      existing.assessed = gap.verifiedLevel;
      existing.suggestion = gap.suggestion;
    } else {
      rows.push({ skill: gap.skill, required: gap.requiredLevel, assessed: gap.verifiedLevel, suggestion: gap.suggestion });
    }
  }
  return rows;
}

export function MappingWorkspaceView({
  employees,
  roles,
  workspaces,
}: MappingWorkspaceViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("employee");
  const initialId =
    employees.find((employee) => employee.id === requestedId)?.id ??
    employees[0]?.id ??
    "";

  const [employeeId, setEmployeeId] = useState(initialId);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<string[]>(() =>
    workspaces.filter((workspace) => workspace.saved).map((workspace) => workspace.employeeId),
  );
  const [finalisedIds, setFinalisedIds] = useState<string[]>(() =>
    workspaces
      .filter((workspace) => workspace.finalised)
      .map((workspace) => workspace.employeeId),
  );
  const [pending, setPending] = useState<"save" | "finalise" | null>(null);

  const employee = employees.find((item) => item.id === employeeId) ?? employees[0];
  const workspace = workspaces.find((item) => item.employeeId === employee?.id);
  const roleId =
    (employee && roleOverrides[employee.id]) ||
    workspace?.targetRoleId ||
    roles[0]?.id ||
    "";
  const role = roles.find((item) => item.id === roleId);
  const finalised = employee ? finalisedIds.includes(employee.id) : false;

  const match = useMemo(() => {
    if (!workspace) return null;
    if (roleId !== workspace.targetRoleId) {
      return { percent: 81, met: Math.max(1, workspace.skillsMet - 1) };
    }
    return { percent: workspace.matchPercent, met: workspace.skillsMet };
  }, [roleId, workspace]);

  const comparison = useMemo(() => (workspace ? buildComparison(workspace) : []), [workspace]);

  if (!employee || !workspace || !match) {
    return (
      <p className="text-sm text-slate-500">No employees are available to map.</p>
    );
  }

  const selectEmployee = (nextId: string) => {
    setEmployeeId(nextId);
    router.replace(`/employees/mapping?employee=${nextId}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title={`Mapping: ${employee.name}`}
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/employees">Alignment Hub</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Individual Mapping</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={pending !== null}
              onClick={async () => {
                setPending("save");
                try {
                  await saveMappingProgress(employee.id, roleId);
                  setSavedIds((ids) =>
                    ids.includes(employee.id) ? ids : [...ids, employee.id],
                  );
                  toast.success("Mapping progress saved");
                } finally {
                  setPending(null);
                }
              }}
            >
              Save Progress
            </Button>
            <Button
              type="button"
              disabled={pending !== null || finalised}
              onClick={async () => {
                setPending("finalise");
                try {
                  await finaliseMapping(
                    employee.id,
                    roleId,
                    role?.title ?? "Assigned role",
                  );
                  setFinalisedIds((ids) => [...ids, employee.id]);
                  toast.success(`${employee.name} alignment finalised`);
                } finally {
                  setPending(null);
                }
              }}
            >
              {finalised ? "Alignment finalised" : "Finalise Alignment"}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/employees"
          className="inline-flex size-8 items-center justify-center rounded-full border border-border-slate bg-white text-slate-400 hover:text-navy"
          aria-label="Back to employee directory"
        >
          <ArrowLeftIcon className="size-3.5" />
        </Link>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <select
            className="h-10 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy"
            value={employee.id}
            onChange={(event) => selectEmployee(event.target.value)}
            aria-label="Employee"
          >
            {employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border border-border-slate bg-white px-3 text-xs font-bold text-navy"
            value={roleId}
            onChange={(event) =>
              setRoleOverrides((current) => ({
                ...current,
                [employee.id]: event.target.value,
              }))
            }
            aria-label="Target role"
          >
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 text-xs font-bold">
          <Link href="/employees/mapping/bulk" className="text-navy hover:underline">
            Bulk mapping
          </Link>
          <Link
            href="/employees/mapping/exceptions"
            className="text-navy hover:underline"
          >
            Exceptions
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="flex flex-col items-center rounded-xl border border-border-slate bg-white p-6 text-center shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={employee.avatarUrl}
            alt=""
            className="mb-3 size-16 rounded-2xl border-4 border-slate-50 shadow-sm"
          />
          <h3 className="text-lg font-bold text-navy">{employee.name}</h3>
          <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">
            {employee.departmentName} · {employee.roleTitle ?? "Unassigned"}
          </p>
          <Link
            href={`/employees/${employee.id}`}
            className={cn(buttonVariants({ variant: "link" }), "mt-1 h-auto px-0")}
          >
            View profile
          </Link>
        </section>

        <section className="rounded-xl border border-border-slate bg-white p-6 text-center shadow-sm">
          <p className="mb-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            AI Gap Analysis Score
          </p>
          <div
            className="mx-auto mb-4 grid size-24 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-green-lime) ${match.percent}%, #e2e8f0 0)`,
            }}
          >
            <div className="grid size-18 place-items-center rounded-full bg-white">
              <div>
                <span className="block text-2xl leading-none font-bold text-navy">{match.percent}%</span>
                <span className="text-[9px] font-bold tracking-tight text-green-deep uppercase">Match</span>
              </div>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            {employee.name.split(" ")[0]} meets or exceeds requirements for{" "}
            <strong>
              {match.met} out of {workspace.skillsTotal}
            </strong>{" "}
            core skills identified for this role.
          </p>
          {savedIds.includes(employee.id) ? (
            <p className="mt-2 text-[10px] font-bold tracking-widest text-green-deep uppercase">Progress saved</p>
          ) : null}
        </section>

        <section className="flex flex-col items-center rounded-xl border border-border-slate bg-white p-6 text-center shadow-sm">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-navy text-xl font-bold text-green-lime shadow-lg">
            ID
          </div>
          <h3 className="text-lg font-bold text-navy">{role?.title ?? "Target role"}</h3>
          <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">Target Role Requirements</p>
          {role ? (
            <Link href={`/roles/${role.id}`} className={cn(buttonVariants({ variant: "link" }), "mt-1 h-auto px-0")}>
              Open role
            </Link>
          ) : null}
        </section>
      </div>

      <section
        aria-labelledby="skills-comparison"
        className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-slate px-6 py-4">
          <div>
            <h3 id="skills-comparison" className="font-bold text-navy">
              Required vs Current Skills
            </h3>
            <p className="text-xs text-slate-500">
              The skills {role?.title ?? "this role"} requires, compared with {employee.name.split(" ")[0]}&apos;s
              assessed levels.
            </p>
          </div>
          {finalised ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-deep">
              <BadgeCheckIcon className="size-4" aria-hidden />
              Alignment finalised
            </span>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <tr>
                <th className="px-6 py-3">Skill</th>
                <th className="px-6 py-3 text-right">Required Level</th>
                <th className="px-6 py-3 text-right">Assessed Level</th>
                <th className="px-6 py-3 text-right">Gap</th>
                <th className="px-6 py-3">Suggested Action</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => {
                const gap = row.assessed === null ? row.required : Math.max(0, row.required - row.assessed);
                return (
                  <tr key={row.skill} className="border-t border-border-slate">
                    <td className="px-6 py-3 font-bold text-navy">{row.skill}</td>
                    <td className="px-6 py-3 text-right">{row.required}</td>
                    <td className="px-6 py-3 text-right">
                      {row.assessed ?? <span className="text-xs text-slate-400">Not assessed</span>}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className={cn(
                          "inline-flex min-w-8 justify-center rounded px-2 py-0.5 text-xs font-bold",
                          gap === 0 ? "bg-success-soft text-success-soft-foreground" : "bg-warning-soft text-warning-soft-foreground",
                        )}
                      >
                        {gap}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600">
                      {gap === 0 ? (
                        <span className="text-slate-400">Meets requirement</span>
                      ) : (
                        <span className="inline-flex items-start gap-1.5">
                          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
                          {row.suggestion ?? "Plan development to reach the required level."}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
