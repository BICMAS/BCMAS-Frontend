"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type CompetencyDatum = {
  name: string;
  required: number;
  current: number | null;
};

/**
 * Required vs current proficiency per competency (levels 1-5). Missing levels are shown
 * as 0 in the chart and listed explicitly in the accessible table below it.
 */
export function CompetencyChart({ data, currentLabel = "Current" }: { data: CompetencyDatum[]; currentLabel?: string }) {
  const rows = data.map((d) => ({ ...d, current: d.current ?? 0 }));
  return (
    <figure className="space-y-3">
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barCategoryGap="22%" margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
            <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="current" name={currentLabel} fill="#102B4E" radius={[4, 4, 0, 0]} />
            <Bar dataKey="required" name="Required" fill="#72C900" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full text-left text-xs text-slate-500">
        <caption className="sr-only">Competency levels</caption>
        <thead>
          <tr>
            <th className="py-1 font-semibold">Competency</th>
            <th className="py-1 font-semibold">{currentLabel}</th>
            <th className="py-1 font-semibold">Required</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name} className="border-t border-border-slate">
              <td className="py-1 text-navy">{d.name}</td>
              <td className="py-1">{d.current ?? "Not determined"}</td>
              <td className="py-1">{d.required}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
