import type { Metadata } from "next";
import { Building2Icon, HardDriveIcon, UsersIcon, ActivityIcon } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Platform Dashboard",
};

/**
 * Platform shell verification — KPI row inspired by SuperAdmin dashboard (HTML 56).
 */
export default function PlatformDashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Global Dashboard"
        description="Vendor administration overview across all BICMAS tenants."
        actions={<StatusIndicator label="Systems Operational" />}
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Tenants"
          value="48"
          delta="+3"
          icon={Building2Icon}
        />
        <StatCard
          label="Global User Base"
          value="18.4k"
          delta="+2.1%"
          icon={UsersIcon}
          iconWellClassName="bg-green-50 text-green-deep"
        />
        <StatCard
          label="API Request Load"
          value="42%"
          delta="Healthy"
          icon={ActivityIcon}
          iconWellClassName="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Global Storage"
          value="12.6 TB"
          delta="Optimal"
          deltaTone="neutral"
          icon={HardDriveIcon}
          iconWellClassName="bg-amber-50 text-amber-600"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Infrastructure</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border-slate bg-slate-50 p-4">
            <p className="text-eyebrow mb-2">Core API Cluster</p>
            <p className="text-sm font-semibold text-navy">Latency: 24ms</p>
            <p className="mt-1 text-xs text-green-deep">Healthy</p>
          </div>
          <div className="rounded-lg border border-border-slate bg-slate-50 p-4">
            <p className="text-eyebrow mb-2">AI Inference Engine</p>
            <p className="text-sm font-semibold text-navy">Load: 42%</p>
            <p className="mt-1 text-xs text-green-deep">Healthy</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
