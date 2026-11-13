"use client";

import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmployeeRecord } from "@/features/employees/types";
import { cn } from "@/lib/utils";

type EmployeeProfileViewProps = {
  employee: EmployeeRecord;
};

export function EmployeeProfileView({ employee }: EmployeeProfileViewProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={employee.name}
        description={`${employee.employeeCode} · ${employee.departmentName}`}
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/employees">Employees</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{employee.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <>
            <Badge
              variant={
                employee.mappingStatus === "aligned"
                  ? "success"
                  : employee.mappingStatus === "unmapped"
                    ? "warning"
                    : "info"
              }
              className="rounded uppercase"
            >
              {employee.mappingStatus}
            </Badge>
            {employee.roleId ? (
              <Link
                href={`/roles/${employee.roleId}`}
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                View role
              </Link>
            ) : null}
            <Link
              href={`/employees/mapping?employee=${employee.id}`}
              className={cn(buttonVariants())}
            >
              Open mapping
            </Link>
          </>
        }
      />

      <div className="flex items-center gap-4 rounded-xl border border-border-slate bg-white p-6 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={employee.avatarUrl}
          alt=""
          className="size-16 rounded-full border border-border-slate"
        />
        <div>
          <p className="text-sm font-bold text-navy">{employee.email}</p>
          <p className="text-xs text-slate-500">
            Joined {employee.joinedYear} · {employee.location}
          </p>
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList variant="line">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6 space-y-4">
          <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <h3 className="mb-3 font-bold text-navy">Role mapping</h3>
            <p className="text-sm text-slate-600">
              {employee.roleTitle
                ? `Mapped to ${employee.roleTitle}.`
                : "No role assigned yet."}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Profile version: {employee.profileVersion ?? "None"}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="skills" className="mt-6">
          <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Capability skill ratings will appear here after assessment modules
              migrate. Browse the{" "}
              <Link href="/skills" className="font-bold text-navy underline">
                skills library
              </Link>{" "}
              meanwhile.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="assessments" className="mt-6">
          <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
            <p className="mb-4 text-sm text-slate-600">
              Assessment workflows are not migrated yet. The employee assessment
              start route is reserved.
            </p>
            <Link
              href="/me/assessments/cycle-2024/start"
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              Open assessment placeholder
            </Link>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
