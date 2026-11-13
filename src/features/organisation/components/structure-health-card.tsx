import type { StructureHealthMetric } from "@/features/organisation/types";
import { cn } from "@/lib/utils";

type StructureHealthCardProps = {
  metrics: StructureHealthMetric[];
};

export function StructureHealthCard({ metrics }: StructureHealthCardProps) {
  return (
    <div className="rounded-xl border border-border-slate bg-white p-6 shadow-sm">
      <h4 className="mb-4 font-bold text-navy">Structure Health</h4>
      <div className="space-y-4">
        {metrics.map((metric) => (
          <div key={metric.id}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-slate-500">{metric.label}</span>
              <span className="font-bold">{metric.percent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  metric.tone === "lime" ? "bg-green-lime" : "bg-green-deep",
                )}
                style={{ width: `${metric.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
