"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { catalogue } from "@/features/workforce/mock-workforce";

const filters = [
  { id: "all", label: "All Resources" },
  { id: "gap", label: "Skill Gap Recommends" },
  { id: "internal", label: "Internal Frameworks" },
  { id: "practice", label: "Workplace Practice" },
  { id: "coaching", label: "AI Coaching Tracks" },
  { id: "elearning", label: "E-Learning" },
] as const;

export function LearningCatalogueView() {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const items = useMemo(
    () =>
      catalogue.filter((item) => {
        if (filter === "all") return true;
        if (filter === "gap") return item.tags.some((tag) => tag.includes("L4") || tag.includes("L2"));
        return item.category === filter;
      }),
    [filter],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Capability Resource Library"
        description="Learning, workplace practice, and coaching tracks aligned to verified skill gaps."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={() => toast.message("Asset registration is a mock in this build.")}
          >
            Register Asset
          </Button>
        }
      />
      <div className="flex gap-4 overflow-x-auto border-b border-border-slate">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              filter === item.id
                ? "border-b-2 border-green-lime pb-2 text-xs font-bold whitespace-nowrap text-navy"
                : "pb-2 text-xs font-bold whitespace-nowrap text-slate-400"
            }
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              {item.kind} · {item.provider}
            </p>
            <h2 className="mt-2 text-lg font-bold text-navy">{item.title}</h2>
            <p className="mt-2 flex-1 text-sm text-slate-500">{item.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.tags.map((tag) => (
                <span key={tag} className="rounded border border-border-slate bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-navy">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] font-bold text-navy">{item.meta}</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  toast.success(`${item.action}ed`, {
                    description: `${item.title} is linked to the active growth plan.`,
                  })
                }
              >
                {item.action}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
