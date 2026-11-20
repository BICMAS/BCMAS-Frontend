"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { departmentUnmapped, roleRoster } from "@/features/roles/data/role-insights";
import type { RoleRecord } from "@/features/roles/types";
import { cn } from "@/lib/utils";

type RoleEmployeesDialogProps = {
  role: RoleRecord | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Who is behind a role's Employee Count: the employees counted for the role, and employees in
 * the same department not yet mapped to any role (possibly missing from the count).
 */
export function RoleEmployeesDialog({ role, onOpenChange }: RoleEmployeesDialogProps) {
  const counted = role ? (roleRoster[role.id] ?? []) : [];
  const missing = role ? (departmentUnmapped[role.departmentId] ?? []) : [];

  return (
    <Dialog open={Boolean(role)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? `${role.title}: employees` : "Employees"}</DialogTitle>
          <DialogDescription>
            {role ? `${role.employeeCount} employees counted in ${role.departmentName}.` : null}
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="counted-heading">
          <h3 id="counted-heading" className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Counted ({counted.length})
          </h3>
          {counted.length ? (
            <ul className="mt-2 divide-y divide-border-slate">
              {counted.map((person) => (
                <li key={person.employeeCode} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {person.employeeId ? (
                      <Link href={`/employees/${person.employeeId}`} className="text-sm font-bold text-navy hover:underline">
                        {person.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-bold text-navy">{person.name}</span>
                    )}
                    <span className="block text-xs text-slate-500">{person.employeeCode}</span>
                  </span>
                  <Badge variant={person.mapping === "aligned" ? "success" : "warning"}>
                    {person.mapping === "aligned" ? "Mapped" : "Mapping pending"}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No employees are mapped to this role yet.</p>
          )}
        </section>

        <section aria-labelledby="missing-heading" className="mt-2">
          <h3 id="missing-heading" className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Possibly missing ({missing.length})
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Employees in this department who are not mapped to any role yet, so they are not counted anywhere.
          </p>
          {missing.length ? (
            <ul className="mt-2 divide-y divide-border-slate">
              {missing.map((person) => (
                <li key={person.employeeCode} className="py-2">
                  {person.employeeId ? (
                    <Link href={`/employees/${person.employeeId}`} className="text-sm font-bold text-navy hover:underline">
                      {person.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-bold text-navy">{person.name}</span>
                  )}
                  <span className="block text-xs text-slate-500">
                    {person.employeeCode} · {person.reason}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Everyone in this department is mapped to a role.</p>
          )}
        </section>

        <div className="mt-2 flex flex-wrap gap-2">
          <Link href="/employees/mapping" className={cn(buttonVariants({ size: "sm" }))}>
            Open Mapping Workspace
          </Link>
          <Link href="/employees/mapping/exceptions" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            Mapping exceptions
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
