"use client";

import Link from "next/link";
import { ActivityIcon, Building2Icon, HardDriveIcon, PlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformGate } from "@/features/platform/components/platform-gate";
import {
  activityTrend,
  listTenants,
  platformHeadline,
} from "@/features/platform/services/mock-platform";
import { usePlatformRevision } from "@/features/platform/use-platform-store";

const services = [
  { name: "Core API Cluster", detail: "Latency: 24ms", status: "Healthy" as const },
  { name: "AI Inference Engine", detail: "Load: 42%", status: "Healthy" as const },
  { name: "Global Auth Database", detail: "Sync Delay: 200ms", status: "Degraded" as const },
];

export function PlatformDashboardView() {
  const revision = usePlatformRevision();
  const tenants = listTenants()
    .slice()
    .sort((left, right) => right.users - left.users)
    .slice(0, 4);
  const peak = activityTrend[activityTrend.length - 1]?.value ?? 1;
  void revision;

  return (
    <PlatformGate>
      <PageHeader
        title="Platform Usage Overview"
        description="Aggregate cross-tenant metrics, global infrastructure performance, and subscription distribution."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => toast.success("Metrics refreshed")}>
              Refresh Metrics
            </Button>
            <Link href="/platform/tenants/new" className={cn(buttonVariants(), "gap-2")}>
              <PlusIcon className="size-3.5" aria-hidden />
              Provision Tenant
            </Link>
          </>
        }
      />

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Tenants"
          value={platformHeadline.activeTenants}
          delta={platformHeadline.activeTenantsDelta}
          icon={Building2Icon}
        />
        <StatCard
          label="Global User Base"
          value={platformHeadline.users}
          delta="Across all tenants"
          deltaTone="neutral"
          icon={UsersIcon}
          iconWellClassName="bg-green-50 text-green-deep"
        />
        <StatCard
          label="API Request Load"
          value={platformHeadline.apiRequests}
          delta="Healthy"
          icon={ActivityIcon}
          iconWellClassName="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Global Storage"
          value={platformHeadline.storage}
          delta="Optimal"
          deltaTone="neutral"
          icon={HardDriveIcon}
          iconWellClassName="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cross-Tenant Activity Trend</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end gap-3">
            {activityTrend.map((point) => (
              <div key={point.month} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-36 w-full items-end rounded-lg bg-slate-50">
                  <div
                    className="w-full rounded-lg bg-green-lime/80"
                    style={{ height: `${Math.round((point.value / peak) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-400">{point.month}</span>
                <span className="text-[10px] text-navy">{point.value}M</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="service-health">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Global Service Health</CardTitle>
            <button
              type="button"
              className="text-[10px] font-bold tracking-widest text-navy uppercase"
              onClick={() => toast.message("Service status is shown on this dashboard")}
            >
              Status Page
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between rounded-xl border border-border-slate bg-slate-50 p-4"
              >
                <div>
                  <p className="text-xs font-bold text-navy">{service.name}</p>
                  <p className="mt-1 text-[10px] tracking-wide text-slate-400 uppercase">{service.detail}</p>
                </div>
                <Badge variant={service.status === "Healthy" ? "success" : "warning"}>{service.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm tracking-wider uppercase">Top Tenants by Platform Usage</CardTitle>
          <Link href="/platform/tenants" className="text-[10px] font-bold tracking-widest text-navy uppercase">
            Full Directory
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-slate text-[10px] font-bold tracking-[0.1em] text-slate-400 uppercase">
                <th className="px-6 py-3">Tenant</th>
                <th className="px-6 py-3 text-center">User Count</th>
                <th className="px-6 py-3 text-center">API Requests (24h)</th>
                <th className="px-6 py-3 text-center">Subscription</th>
                <th className="px-6 py-3 text-right">Admin Console</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-border-slate last:border-0">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded bg-navy text-[10px] font-bold text-white">
                        {tenant.code}
                      </span>
                      <span className="font-bold text-navy">{tenant.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">{tenant.users.toLocaleString("en-GB")}</td>
                  <td className="px-6 py-4 text-center text-slate-500">{tenant.apiRequests}</td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant={tenant.plan === "Enterprise Plus" ? "info" : "secondary"}>{tenant.plan}</Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/platform/audit?tenant=${tenant.externalId}`}
                      className="text-xs font-bold text-navy"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </PlatformGate>
  );
}
