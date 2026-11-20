"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { departmentPerformance } from "@/features/ld/assessment-schedule";

const COLORS = ["#cbd5e1", "#94a3b8", "#84cc16"];

/** Average capability match per department across previous cycles: are we growing? */
export function DepartmentPerformanceChart() {
  const { cycles, rows } = departmentPerformance;
  const data = rows.map((row) => ({
    department: row.department,
    ...Object.fromEntries(cycles.map((cycle, i) => [cycle, row.values[i]])),
  }));
  const last = cycles.length - 1;

  return (
    <section
      aria-labelledby="department-performance"
      className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm"
    >
      <h2 id="department-performance" className="text-lg font-bold text-navy">
        Departmental Performance by Cycle
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Average capability match per department in previous assessment cycles, so you can see whether capability is
        growing.
      </p>
      <div className="mt-4 h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="department" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {cycles.map((cycle, i) => (
              <Bar key={cycle} dataKey={cycle} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
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
            const change = row.values[last]! - row.values[last - 1]!;
            return (
              <tr key={row.department} className="border-t border-border-slate">
                <td className="py-2 font-bold text-navy">{row.department}</td>
                {row.values.map((v, i) => (
                  <td key={cycles[i]} className="py-2 text-right">
                    {v}%
                  </td>
                ))}
                <td className={change >= 0 ? "py-2 text-right font-bold text-green-deep" : "py-2 text-right font-bold text-red-600"}>
                  {change >= 0 ? "+" : ""}
                  {change} pts
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
