"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { HistoryIcon, PenLineIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

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
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleStatusBadge } from "@/features/roles/components/role-status-badge";
import type { RoleRecord } from "@/features/roles/types";
import { cn } from "@/lib/utils";

type RoleDetailViewProps = {
  role: RoleRecord;
};

export function RoleDetailView({ role }: RoleDetailViewProps) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <PageHeader
        title={role.title}
        description={role.departmentName}
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/roles">Roles</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{role.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <>
            <RoleStatusBadge status={role.status} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/roles/${role.id}/profile/history`)}
            >
              <HistoryIcon className="size-4" aria-hidden />
              History
            </Button>
            <Button
              type="button"
              onClick={() => router.push(`/roles/${role.id}/profile/setup`)}
            >
              <PenLineIcon className="size-4" aria-hidden />
              Edit Profile
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="skills">Skills Profile</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="rounded-xl border border-border-slate bg-white p-8 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-navy">Role Overview</h3>
            <p className="leading-relaxed text-slate-600">{role.overview}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/roles/${role.id}/profile/review`}
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                Open review
              </Link>
              <Button
                type="button"
                variant="accent"
                onClick={() => {
                  toast.message("AI profile assist", {
                    description:
                      "Open Setup to generate competencies from a job description (mock).",
                    action: {
                      label: "Setup",
                      onClick: () =>
                        router.push(`/roles/${role.id}/profile/setup`),
                    },
                  });
                }}
              >
                <SparklesIcon className="size-4" aria-hidden />
                AI Assist
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="skills" className="mt-6 space-y-6">
          <div className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-border-slate bg-slate-50/50 px-8 py-5">
              <h3 className="font-bold text-navy">AI-Assisted Skills Profile</h3>
              {role.lastVerified ? (
                <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  Last Verified: {role.lastVerified}
                </span>
              ) : null}
            </div>
            <div className="space-y-6 p-8">
              <div>
                <h4 className="mb-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  Technical Competencies
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {role.technicalSkills.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No technical skills yet. Generate a profile in Setup.
                    </p>
                  ) : (
                    role.technicalSkills.map((skill) => (
                      <Link
                        key={skill.skillId}
                        href={`/skills/${skill.skillId}`}
                        className="flex items-center justify-between rounded-lg border border-border-slate bg-slate-50 p-3 hover:border-green-lime"
                      >
                        <span className="text-sm font-medium">{skill.name}</span>
                        <Badge className="rounded bg-navy text-white">
                          {skill.levelLabel}
                        </Badge>
                      </Link>
                    ))
                  )}
                </div>
              </div>
              <div>
                <h4 className="mb-3 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                  Behavioral Skills
                </h4>
                <div className="flex flex-wrap gap-2">
                  {role.behaviouralSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-border-slate bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <div className="overflow-hidden rounded-xl border border-border-slate bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-border-slate bg-slate-50/50 px-6 py-4">
              <h3 className="font-bold text-navy">Mapped Employees</h3>
              <span className="text-xs font-bold text-green-deep">
                {role.mappedEmployees.length} shown
              </span>
            </div>
            <div className="divide-y divide-border-slate p-6">
              {role.mappedEmployees.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">
                  No employees mapped yet.{" "}
                  <Link href="/employees" className="font-bold text-navy underline">
                    Open directory
                  </Link>
                </p>
              ) : (
                role.mappedEmployees.map((employee) => (
                  <Link
                    key={employee.employeeId}
                    href={`/employees/${employee.employeeId}`}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-slate-50/50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={employee.avatarUrl}
                      alt=""
                      className="size-10 rounded-full border border-border-slate"
                    />
                    <div>
                      <p className="text-sm font-bold text-navy">
                        {employee.name}
                      </p>
                      <p className="text-[10px] font-medium text-slate-400">
                        Joined {employee.joinedYear}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p
                        className={cn(
                          "text-[10px] font-bold",
                          employee.matchPercent >= 90
                            ? "text-green-deep"
                            : "text-amber-600",
                        )}
                      >
                        {employee.matchPercent}% Match
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
            <div className="border-t border-border-slate bg-slate-50 p-4 text-center">
              <Link
                href="/employees"
                className="text-xs font-bold tracking-widest text-navy uppercase hover:underline"
              >
                View all employees
              </Link>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
