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
  MappingSkillBar,
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

function SkillList({
  skills,
  tone,
}: {
  skills: MappingSkillBar[];
  tone: "verified" | "target";
}) {
  const target = tone === "target";
  return (
    <div className="space-y-4">
      {skills.map((skill) => (
        <div
          key={skill.name}
          className={cn(
            "rounded-xl border p-4",
            target
              ? "border-green-100 bg-green-50"
              : "border-border-slate bg-slate-50",
          )}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <span
              className={cn(
                "text-xs font-bold",
                target ? "text-green-deep" : "text-navy",
              )}
            >
              {skill.name}
            </span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[9px] font-bold",
                target ? "bg-green-lime text-navy" : "bg-navy text-white",
              )}
            >
              LEVEL {skill.level}
            </span>
          </div>
          <div
            className={cn(
              "h-1 w-full overflow-hidden rounded-full",
              target ? "bg-green-100" : "bg-slate-200",
            )}
          >
            <div
              className={cn("h-full", target ? "bg-green-lime" : "bg-navy")}
              style={{ width: `${skill.percent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
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

      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm lg:grid-cols-3">
        <section className="border-b border-border-slate p-8 lg:border-r lg:border-b-0">
          <div className="mb-8 flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={employee.avatarUrl}
              alt=""
              className="mb-4 size-20 rounded-2xl border-4 border-slate-50 shadow-sm"
            />
            <h3 className="text-lg font-bold text-navy">{employee.name}</h3>
            <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">
              {employee.departmentName} · {employee.roleTitle ?? "Unassigned"}
            </p>
            <Link
              href={`/employees/${employee.id}`}
              className={cn(buttonVariants({ variant: "link" }), "mt-2 h-auto px-0")}
            >
              View profile
            </Link>
          </div>
          <h4 className="mb-4 border-b border-slate-100 pb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Current Verified Skills
          </h4>
          <SkillList skills={workspace.verifiedSkills} tone="verified" />
        </section>

        <section className="bg-slate-50 p-8 lg:p-10">
          <div className="relative mb-10 rounded-2xl border border-border-slate bg-white p-8 text-center shadow-sm">
            <p className="mb-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              AI Gap Analysis Score
            </p>
            <div
              className="mx-auto mb-6 grid size-32 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--color-green-lime) ${match.percent}%, #e2e8f0 0)`,
              }}
            >
              <div className="grid size-24 place-items-center rounded-full bg-white">
                <div>
                  <span className="block text-3xl leading-none font-bold text-navy">
                    {match.percent}%
                  </span>
                  <span className="text-[9px] font-bold tracking-tight text-green-deep uppercase">
                    Match
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              {employee.name.split(" ")[0]} exceeds or meets requirements for{" "}
              <strong>
                {match.met} out of {workspace.skillsTotal}
              </strong>{" "}
              core skills identified for this role.
            </p>
            {savedIds.includes(employee.id) ? (
              <p className="mt-3 text-[10px] font-bold tracking-widest text-green-deep uppercase">
                Progress saved
              </p>
            ) : null}
          </div>

          <h4 className="mb-4 border-b border-slate-200 pb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Identified Gaps
          </h4>
          {finalised || workspace.gaps.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
              <BadgeCheckIcon className="mt-0.5 size-4 text-green-deep" />
              <p className="text-xs font-bold text-green-deep">
                No open gaps for this alignment.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {workspace.gaps.map((gap) => (
                <div
                  key={gap.skill}
                  className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4"
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 text-amber-500" />
                  <div>
                    <p className="mb-1 text-xs font-bold text-amber-900">
                      {gap.skill}
                    </p>
                    <p className="text-[10px] leading-relaxed text-amber-700">
                      Required: Level {gap.requiredLevel} | Verified: Level{" "}
                      {gap.verifiedLevel}. Suggested action: {gap.suggestion}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-border-slate p-8 lg:border-t-0 lg:border-l">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-navy text-2xl font-bold text-green-lime shadow-lg">
              ID
            </div>
            <h3 className="text-lg font-bold text-navy">
              {role?.title ?? "Target role"}
            </h3>
            <p className="text-xs font-medium tracking-widest text-slate-400 uppercase">
              Target Role Requirements
            </p>
            {role ? (
              <Link
                href={`/roles/${role.id}`}
                className={cn(buttonVariants({ variant: "link" }), "mt-2 h-auto px-0")}
              >
                Open role
              </Link>
            ) : null}
          </div>
          <h4 className="mb-4 border-b border-slate-100 pb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Target Proficiencies
          </h4>
          <SkillList skills={workspace.targetSkills} tone="target" />
        </section>
      </div>
    </div>
  );
}
