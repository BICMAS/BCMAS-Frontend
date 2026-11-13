"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ProfileDistributionBar } from "@/features/organisation/types";

type ProfileDistributionChartProps = {
  data: ProfileDistributionBar[];
};

/**
 * Role profile distribution by department (HTML 14 bar chart → Recharts).
 */
export function ProfileDistributionChart({
  data,
}: ProfileDistributionChartProps) {
  const chartData = data.map((item) => ({
    name: item.shortLabel,
    fullName: item.department,
    Approved: item.approved,
    Pending: item.pending,
    Draft: item.draft,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barCategoryGap="18%" margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            tick={{ fill: "#94A3B8", fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "#F8FAFC" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #E2E8F0",
              fontSize: 12,
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { fullName?: string } | undefined;
              return row?.fullName ?? "";
            }}
          />
          <Bar dataKey="Approved" stackId="a" fill="#72C900" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Pending" stackId="a" fill="#FBBF24" />
          <Bar dataKey="Draft" stackId="a" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
