"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createScenario, listScenarios } from "@/features/ai-coach/services/mock-coach";
import type { ScenarioCategory } from "@/features/ai-coach/types";
import { cn } from "@/lib/utils";

const filters: Array<{ id: "all" | ScenarioCategory; label: string }> = [
  { id: "all", label: "All Scenarios" },
  { id: "role", label: "Role Simulations" },
  { id: "soft", label: "Soft Skills" },
  { id: "technical", label: "Technical Vetting" },
  { id: "custom", label: "Custom Scenarios" },
];

export function ScenarioLibraryView() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState(() => listScenarios());
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const visible = useMemo(
    () => scenarios.filter((scenario) => filter === "all" || scenario.category === filter),
    [filter, scenarios],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/ai-coach" className="text-xs font-bold tracking-widest text-slate-400 uppercase">
            AI Coaching
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-navy">Scenario Library</h1>
        </div>
        <Button type="button" onClick={() => setCreating((open) => !open)}>
          Create Custom Scenario
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold",
              filter === item.id ? "bg-navy text-white" : "bg-white text-slate-500 ring-1 ring-border-slate",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {creating ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-border-slate bg-white p-4 sm:flex-row"
          onSubmit={async (event) => {
            event.preventDefault();
            if (title.trim().length < 3) {
              toast.error("Name the scenario");
              return;
            }
            setPending(true);
            try {
              const scenario = await createScenario(title);
              setScenarios(listScenarios());
              setFilter("custom");
              setTitle("");
              setCreating(false);
              toast.success("Custom scenario added");
              router.push(`/ai-coach/session/${scenario.id}`);
            } finally {
              setPending(false);
            }
          }}
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Define your own role-based task"
            aria-label="Scenario title"
          />
          <Button type="submit" disabled={pending}>
            Save and launch
          </Button>
        </form>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((scenario) => (
          <article key={scenario.id} className="rounded-2xl border border-border-slate bg-white p-6 shadow-sm">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              {scenario.department}
            </p>
            <h2 className="mt-2 font-bold text-navy">{scenario.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{scenario.description}</p>
            <p className="mt-3 text-xs text-slate-500">Target skill: {scenario.targetSkill}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary">{scenario.minutes}m</Badge>
              <Badge variant={scenario.difficulty === "Hard" || scenario.difficulty === "Advanced" ? "warning" : "info"}>
                {scenario.difficulty}
              </Badge>
            </div>
            <Link href={`/ai-coach/session/${scenario.id}`} className="mt-4 inline-flex text-sm font-bold text-navy hover:underline">
              Launch Session
            </Link>
          </article>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">No scenarios in this category yet.</p>
      ) : null}
    </div>
  );
}
