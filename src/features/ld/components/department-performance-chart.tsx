"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { departmentTrend } from "@/features/capability/services/analytics";
import { useCapabilityUser } from "@/features/capability/use-capability";

const COLORS = ["#cbd5e1", "#94a3b8", "#84cc16"];
const SHOWN = 3;

/** Average capability match per department in the latest cycles with released results. */
export function DepartmentPerformanceChart() {
  const user = useCapabilityUser();
  if (!user) return null;
  const trend = departmentTrend(user);
  const start = Math.max(0, trend.cycles.length - SHOWN);
  const cycles = trend.cycles.slice(start);
  const rows = trend.rows.map((r) => ({ department: r.department, values: r.values.slice(start) }));
  const data = rows.map((row) => ({
    department: row.department,
    ...Object.fromEntries(cycles.map((cycle, i) => [cycle, row.values[i]])),
  }));

  return (
    <section aria-labelledby="department-performance" className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
      <h2 id="department-performance" className="text-lg font-bold text-navy">
        Departmental Performance by Cycle
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Average capability match from released results. Compare cycles only where role profiles and the scale have not changed.
      </p>
      {!cycles.length ? (
        <p className="mt-4 text-sm text-slate-500">No released results yet.</p>
      ) : (
        <>
          <div className="mt-4 h-72" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="department" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {cycles.map((cycle, i) => (
                  <Bar key={cycle} dataKey={cycle} fill={COLORS[COLORS.length - cycles.length + i]} radius={[3, 3, 0, 0]} maxBarSize={64} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Accessible summary of the chart (also useful at a glance). */}
          <table className="mt-4 w-full text-left text-sm">
            <caption className="sr-only">Average capability match by department and cycle</caption>
            <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              <tr>
                <th className="py-2">Department</th>
                {cycles.map((c) => (
                  <th key={c} className="py-2 text-right">
                    {c}
                  </th>
                ))}
                <th className="py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const now = row.values.at(-1) ?? null;
                const before = row.values.length > 1 ? (row.values.at(-2) ?? null) : null;
                const change = now !== null && before !== null ? now - before : null;
                return (
                  <tr key={row.department} className="border-t border-border-slate">
                    <td className="py-2 font-bold text-navy">{row.department}</td>
                    {row.values.map((v, i) => (
                      <td key={cycles[i]} className="py-2 text-right">
                        {v === null ? "—" : `${v}%`}
                      </td>
                    ))}
                    <td className={change !== null && change < 0 ? "py-2 text-right font-bold text-red-600" : "py-2 text-right font-bold text-green-deep"}>
                      {change === null ? "—" : `${change >= 0 ? "+" : ""}${change} pts`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
