import Link from "next/link";
import { PlusIcon, UploadIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buttonVariants } from "@/components/ui/button";
import { OrgMetricCard } from "@/features/organisation/components/org-metric-card";
import { OrgQuickActions } from "@/features/organisation/components/org-quick-actions";
import { ProfileDistributionChart } from "@/features/organisation/components/profile-distribution-chart";
import { StructureHealthCard } from "@/features/organisation/components/structure-health-card";
import { getOrgOverview } from "@/features/organisation/services/mock-organisation";
import { cn } from "@/lib/utils";

export async function OrgOverviewView() {
  const data = await getOrgOverview();

  return (
    <div className="space-y-10">
      <PageHeader
        title="Organisation Overview"
        description="Centralized management of organizational structure, departments, and role-based capability health."
        breadcrumbs={
          <Breadcrumb>
            <BreadcrumbList className="text-[11px] font-bold tracking-[0.1em] text-slate-400 uppercase">
              <BreadcrumbItem>
                <span>Organization Hub</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-navy">Overview</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <>
            <Link
              href="/org/bulk-upload"
              className={cn(buttonVariants({ variant: "secondary" }))}
            >
              <UploadIcon className="size-4" aria-hidden />
              Bulk Import Org
            </Link>
            <Link
              href="/org/departments?action=new"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              <PlusIcon className="size-4" aria-hidden />
              New Department
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
        {data.metrics.map((metric) => (
          <OrgMetricCard key={metric.id} metric={metric} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-xl border border-border-slate bg-white p-8 shadow-sm lg:col-span-2">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-bold text-navy">Role Profile Distribution</h3>
            <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-green-lime" />
                Approved
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-400" />
                Pending
              </div>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-slate-300" />
                Draft
              </div>
            </div>
          </div>
          <ProfileDistributionChart data={data.distribution} />
        </div>

        <div className="space-y-6">
          <OrgQuickActions />
          <StructureHealthCard metrics={data.structureHealth} />
        </div>
      </div>
    </div>
  );
}
