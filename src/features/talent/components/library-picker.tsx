"use client";

import { Badge } from "@/components/ui/badge";
import { resolveLibraryItems, type LibraryItem } from "@/features/talent/services/mock-library";

export function LibraryPicker({
  items,
  selected,
  onChange,
  roleSkills,
}: {
  items: LibraryItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  roleSkills: string[];
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-bold text-navy">Library items</legend>
      <p className="text-xs text-slate-500">
        Pick reusable items. The assessment still binds to the one approved role profile above.
      </p>
      <ul className="space-y-2">
        {items.map((item) => {
          const checked = selected.includes(item.id);
          const matches = roleSkills.includes(item.skillTag);
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-slate px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-navy"
                  checked={checked}
                  onChange={() =>
                    onChange(checked ? selected.filter((id) => id !== item.id) : [...selected, item.id])
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-navy">{item.title}</span>
                    <Badge variant="outline">{item.type}</Badge>
                    {matches ? <Badge variant="success">Matches role</Badge> : null}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {item.skillTag} · {item.durationMinutes} minutes · reused on {item.reusableRoles.join(", ")}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function AssessmentLibraryList({ ids }: { ids: string[] | undefined }) {
  const items = resolveLibraryItems(ids ?? []);
  if (!items.length) {
    return <p className="mt-3 text-sm text-slate-500">No library items are attached.</p>;
  }
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <p className="font-bold text-navy">{item.title}</p>
          <p className="text-sm text-slate-500">
            {item.type} · {item.skillTag}
          </p>
        </li>
      ))}
    </ul>
  );
}
