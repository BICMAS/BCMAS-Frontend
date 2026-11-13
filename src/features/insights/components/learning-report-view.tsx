"use client";

import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const assets = [
  ["Advanced AI Governance 2024", "142", "92%", "+1.8", "High"],
  ["Cloud Architecture Fundamentals", "210", "85%", "+1.2", "High"],
  ["Strategic Influence Masterclass", "86", "78%", "+0.9", "Medium"],
];

export function LearningReportView() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Learning Effectiveness & ROI"
        description="Analyzing the correlation between learning asset completion and verified capability growth across the organisation."
        actions={
          <Button
            type="button"
            onClick={() => {
              const blob = new Blob(
                ["Gap closure 64%\nSkill lift +1.2\nLearning efficiency 88%\nAssessment completion 94.2%\n"],
                { type: "text/plain" },
              );
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "learning-roi.txt";
              anchor.click();
              URL.revokeObjectURL(url);
              toast.success("ROI analysis downloaded");
            }}
          >
            Download ROI Analysis
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Gap Closure Rate", "64%", "Target: 70%"],
          ["Verified Skill Lift", "+1.2", "Levels / Year"],
          ["Learning Efficiency", "88%", "High ROI Assets"],
          ["Assessment Completion", "94.2%", "In Cycle"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-2xl border border-border-slate bg-white p-6">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
            <p className="mt-2 text-3xl font-bold text-navy">{value}</p>
            <p className="text-[10px] text-slate-400">{note}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-border-slate bg-white p-6">
        <h2 className="font-bold text-navy">Learning Completion vs Skill Verification</h2>
        <div className="mt-6 space-y-4">
          {[
            ["Completion", "88%", "bg-navy"],
            ["Verification", "64%", "bg-green-lime"],
          ].map(([label, width, color]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs font-bold text-navy">
                <span>{label}</span>
                <span>{width}</span>
              </div>
              <div className="h-3 rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${color}`} style={{ width }} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-border-slate bg-white">
        <h2 className="border-b border-border-slate px-6 py-4 text-sm font-bold tracking-wider text-navy uppercase">
          Top Performing Learning Assets
        </h2>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            <tr>
              {["Learning Asset", "Enrollments", "Completion %", "Avg. Skill Lift", "ROI Score"].map((heading) => (
                <th key={heading} className="px-6 py-3">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map(([name, enrolled, completion, lift, roi]) => (
              <tr key={name} className="border-t border-border-slate">
                <td className="px-6 py-4 font-bold text-navy">{name}</td>
                <td className="px-6 py-4">{enrolled}</td>
                <td className="px-6 py-4">{completion}</td>
                <td className="px-6 py-4">{lift}</td>
                <td className="px-6 py-4">
                  <Badge variant={roi === "High" ? "success" : "warning"}>{roi}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
