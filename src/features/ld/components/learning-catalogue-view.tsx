"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";
import { catalogue, type CatalogueItem } from "@/features/workforce/mock-workforce";

type Category = CatalogueItem["category"];

const CATEGORY_LABELS: Record<Category, string> = {
  internal: "Internal Learning Resources",
  practice: "Workplace Learning",
  coaching: "AI Coaching",
  elearning: "E-Learning Courses",
  workshop: "Workshop & Classroom Training",
};

const CATEGORY_ORDER: Category[] = ["internal", "practice", "coaching", "elearning", "workshop"];

const filters: { id: "all" | Category; label: string }[] = [
  { id: "all", label: "All Resources" },
  ...CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
];

/** Skill name from a resource tag such as "AI Governance (L4)". */
function skillName(tag: string): string {
  return tag.replace(/\s*\(L[\d\-–]+\)\s*$/, "").trim();
}

const ADMIN_PORTALS = new Set(["organisation_admin", "hr_ld_admin"]);

export function LearningCatalogueView() {
  const user = useHydratedUser();
  // Admins can reassign a resource's category; everyone else browses.
  const canEdit = Boolean(user && ADMIN_PORTALS.has(user.portal));
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [categories, setCategories] = useState<Record<string, Category>>(() =>
    Object.fromEntries(catalogue.map((item) => [item.id, item.category])),
  );

  const items = useMemo(
    () => catalogue.filter((item) => filter === "all" || categories[item.id] === filter),
    [filter, categories],
  );

  /** Skills covered by each category (from the resources currently allocated to it). */
  const skillsByCategory = useMemo(() => {
    const map = new Map<Category, Set<string>>(CATEGORY_ORDER.map((c) => [c, new Set<string>()]));
    for (const item of catalogue) {
      const category = categories[item.id]!;
      for (const tag of item.tags) map.get(category)!.add(skillName(tag));
    }
    return map;
  }, [categories]);

  const shownCategories = filter === "all" ? CATEGORY_ORDER : [filter];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Learning and Development Library"
        description="Explore learning resources and development interventions designed to address identified employee skill gaps and strengthen workforce capabilities."
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
      <div className="flex gap-4 overflow-x-auto border-b border-border-slate" role="tablist" aria-label="Resource categories">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={
              filter === item.id
                ? "border-b-2 border-green-lime pb-2 text-xs font-bold whitespace-nowrap text-navy"
                : "pb-2 text-xs font-bold whitespace-nowrap text-slate-400 hover:text-navy"
            }
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section aria-labelledby="skills-by-category" className="rounded-2xl border border-border-slate bg-white p-5">
        <h2 id="skills-by-category" className="text-sm font-bold text-navy">
          Skills by category
        </h2>
        <dl className="mt-3 space-y-2">
          {shownCategories.map((category) => {
            const skills = [...skillsByCategory.get(category)!].sort();
            return (
              <div key={category} className="grid gap-1 sm:grid-cols-[220px_1fr] sm:gap-4">
                <dt className="text-xs font-bold text-slate-500">{CATEGORY_LABELS[category]}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {skills.length ? (
                    skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded border border-border-slate bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-navy"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">No resources allocated yet</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col rounded-2xl border border-border-slate bg-white p-5 shadow-sm">
            <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              {CATEGORY_LABELS[categories[item.id]!]} · {item.provider}
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
            {canEdit ? (
              <div className="mt-4">
                <label
                  htmlFor={`category-${item.id}`}
                  className="mb-1 block text-[10px] font-bold tracking-widest text-slate-400 uppercase"
                >
                  Category
                </label>
                <select
                  id={`category-${item.id}`}
                  className="h-9 w-full rounded-lg border border-border-slate bg-white px-2 text-xs font-bold text-navy outline-none focus-visible:ring-2 focus-visible:ring-navy"
                  value={categories[item.id]}
                  onChange={(e) => {
                    const next = e.target.value as Category;
                    setCategories((prev) => ({ ...prev, [item.id]: next }));
                    toast.success(`${item.title} moved to ${CATEGORY_LABELS[next]}`);
                  }}
                >
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
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
        {items.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-dashed border-border-slate p-8 text-center text-sm text-slate-500">
            No resources in this category yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
