"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import {
  canEditEssentialSkills,
  essentialSkills,
  essentialSkillsRevision,
  isEssentialSkill,
  setEssentialSkill,
  subscribeEssentialSkills,
} from "@/features/roles/services/essential-skills";
import type { RoleRecord } from "@/features/roles/types";
import { useHydratedUser } from "@/features/talent/use-hydrated-user";

/** Marks the skills that are essential to safety or compliance. */
export function EssentialSkillsCard({ role }: { role: RoleRecord }) {
  const revision = useSyncExternalStore(subscribeEssentialSkills, essentialSkillsRevision, () => -1);
  const user = useHydratedUser();
  if (revision === -1 || !user) return null;
  const canEdit = canEditEssentialSkills(user.portal);
  const entry = essentialSkills(role.id);
  const skills = [...role.technicalSkills.map((s) => s.name), ...role.behaviouralSkills];
  if (!skills.length || (!canEdit && !entry?.skills.length)) return null;
  return (
    <section className="space-y-3 rounded-xl border border-border-slate bg-white p-8 shadow-sm" aria-label="Essential skills">
      <h3 className="font-bold text-navy">Essential skills</h3>
      <p className="text-sm text-slate-500">
        Tick skills that are essential to safety or compliance. Any gap in them is critical. This applies to assessment cycles
        activated after the change.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {skills.map((skill) => (
          <li key={skill}>
            <label className="flex items-center gap-2 text-sm text-navy">
              <Checkbox
                aria-label={`${skill} is essential`}
                disabled={!canEdit}
                checked={isEssentialSkill(role.id, skill)}
                onCheckedChange={(v) => {
                  try {
                    setEssentialSkill(user, role.id, skill, v === true);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Something went wrong.");
                  }
                }}
              />
              {skill}
            </label>
          </li>
        ))}
      </ul>
      {entry ? <p className="text-xs text-slate-500">Last changed by {entry.by}.</p> : null}
    </section>
  );
}
