"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BanIcon,
  BriefcaseIcon,
  CloudIcon,
  CodeIcon,
  DatabaseIcon,
  DownloadIcon,
  Loader2Icon,
  PenIcon,
  PlusIcon,
  ShieldHalfIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddDepartmentDialog } from "@/features/organisation/components/add-department-dialog";
import { RoleStatusBadge } from "@/features/organisation/components/role-status-badge";
import {
  deactivateRole,
  exportDepartments,
} from "@/features/organisation/services/mock-organisation";
import type { Department, DepartmentRole } from "@/features/organisation/types";
import { cn } from "@/lib/utils";

const roleIconMap: Record<DepartmentRole["icon"], LucideIcon> = {
  code: CodeIcon,
  database: DatabaseIcon,
  cloud: CloudIcon,
  shield: ShieldHalfIcon,
  users: UsersIcon,
  briefcase: BriefcaseIcon,
};

type DepartmentsWorkspaceProps = {
  initialDepartments: Department[];
  openCreateOnMount?: boolean;
};

export function DepartmentsWorkspace({
  initialDepartments,
  openCreateOnMount = false,
}: DepartmentsWorkspaceProps) {
  const router = useRouter();
  const [departments, setDepartments] = useState(initialDepartments);
  const [selectedId, setSelectedId] = useState(initialDepartments[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [createOpen, setCreateOpen] = useState(openCreateOnMount);
  const [deactivateTarget, setDeactivateTarget] = useState<DepartmentRole | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => d.name.toLowerCase().includes(q));
  }, [departments, query]);

  const selected =
    filtered.find((d) => d.id === selectedId) ??
    filtered[0] ??
    departments.find((d) => d.id === selectedId) ??
    null;

  const onExport = async () => {
    setExporting(true);
    try {
      const result = await exportDepartments();
      toast.success(`Exported ${result.fileName}`);
    } finally {
      setExporting(false);
    }
  };

  const onConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    await deactivateRole(deactivateTarget.id);
    setDepartments((prev) =>
      prev.map((dept) =>
        dept.id !== selected?.id
          ? dept
          : {
              ...dept,
              roles: dept.roles.filter((r) => r.id !== deactivateTarget.id),
              roleCount: Math.max(0, dept.roleCount - 1),
            },
      ),
    );
    toast.success(`Deactivated “${deactivateTarget.title}”`);
    setDeactivateTarget(null);
  };

  return (
    <div className="-m-5 flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden border border-border-slate bg-white shadow-sm md:-m-6 lg:-m-8 lg:min-h-[calc(100vh-7rem)] xl:-m-10">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border-slate px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <Breadcrumb>
            <BreadcrumbList className="mb-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <BreadcrumbItem>
                <BreadcrumbLink href="/org">Organization</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-navy">Departments</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h2 className="text-xl font-bold text-navy">Departments & Roles</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <DownloadIcon className="size-4 text-slate-400" aria-hidden />
            )}
            Export
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" aria-hidden />
            Add Department
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex max-h-[40vh] w-full flex-col border-b border-border-slate bg-white lg:max-h-none lg:w-1/3 lg:border-r lg:border-b-0">
          <div className="border-b border-border-slate bg-slate-50/50 p-4">
            <SearchField
              placeholder="Search departments..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 bg-white py-2 text-sm"
            />
          </div>
          <div className="divide-y divide-border-slate overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState
                title="No departments found"
                description="Try another search or create a new department."
                className="m-4 border-0 shadow-none"
              />
            ) : (
              filtered.map((dept) => {
                const active = selected?.id === dept.id;
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setSelectedId(dept.id)}
                    className={cn(
                      "w-full cursor-pointer p-5 text-left transition-all",
                      active
                        ? "border-l-4 border-l-green-lime bg-slate-50/80 shadow-[0_4px_12px_rgba(16,43,78,0.05)]"
                        : "border-l-4 border-l-transparent hover:bg-slate-50",
                    )}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <h3 className="font-bold text-navy">{dept.name}</h3>
                      {dept.tag === "core" ? (
                        <Badge
                          variant="success"
                          className="rounded tracking-normal"
                        >
                          CORE
                        </Badge>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "grid grid-cols-3 gap-2",
                        !active && "text-slate-500",
                      )}
                    >
                      <div className="text-center">
                        <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                          Roles
                        </p>
                        <p className="text-sm font-bold">{dept.roleCount}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                          Team
                        </p>
                        <p className="text-sm font-bold">{dept.teamSize}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                          Health
                        </p>
                        <p
                          className={cn(
                            "text-sm font-bold",
                            dept.healthPercent >= 90 && "text-green-deep",
                          )}
                        >
                          {dept.healthPercent}%
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-bg-slate p-6 sm:p-8">
          {!selected ? (
            <EmptyState
              title="Select a department"
              description="Choose a department from the list to view its roles."
            />
          ) : (
            <>
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-navy">
                    Roles in {selected.name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Showing {selected.roles.length} roles and their profile
                    statuses.
                  </p>
                </div>
                <Link
                  href="/roles"
                  className={cn(
                    buttonVariants({ variant: "accent" }),
                    "shadow-sm",
                  )}
                >
                  <PlusIcon className="size-4" aria-hidden />
                  Create New Role
                </Link>
              </div>

              {selected.roles.length === 0 ? (
                <EmptyState
                  title="No roles yet"
                  description="Create a role for this department to begin profile mapping."
                  action={
                    <Link
                      href="/roles"
                      className={cn(buttonVariants({ variant: "default" }))}
                    >
                      Create New Role
                    </Link>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {selected.roles.map((role) => {
                    const Icon = roleIconMap[role.icon];
                    return (
                      <div
                        key={role.id}
                        className="flex flex-col gap-4 rounded-xl border border-border-slate bg-white p-5 shadow-sm transition-all hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex size-10 items-center justify-center rounded-lg bg-slate-50 text-navy/40">
                            <Icon className="size-4" aria-hidden />
                          </div>
                          <div>
                            <h4 className="font-bold text-navy">{role.title}</h4>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {role.subtitle}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                          <div className="text-left sm:text-right">
                            <p className="mb-1 text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                              Status
                            </p>
                            <RoleStatusBadge status={role.status} />
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="mb-1 text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                              Employees
                            </p>
                            <p className="text-sm font-bold">
                              {role.employeeCount}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Edit Role"
                              aria-label={`Edit ${role.title}`}
                              onClick={() => router.push(`/roles/${role.id}`)}
                            >
                              <PenIcon className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Deactivate Role"
                              aria-label={`Deactivate ${role.title}`}
                              className="hover:bg-red-50 hover:text-red-500"
                              onClick={() => setDeactivateTarget(role)}
                            >
                              <BanIcon className="size-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddDepartmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(department) => {
          setDepartments((prev) => [department, ...prev]);
          setSelectedId(department.id);
        }}
      />

      <Dialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate role?</DialogTitle>
            <DialogDescription>
              {deactivateTarget
                ? `“${deactivateTarget.title}” will be removed from this department view. This is a mock action only.`
                : "Deactivate this role?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="-mx-6 -mb-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeactivateTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmDeactivate}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
