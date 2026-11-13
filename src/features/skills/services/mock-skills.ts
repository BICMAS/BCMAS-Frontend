import {
  defaultFrameworkLevels,
  mockSkills,
} from "@/features/skills/data/mock-skills";
import type { FrameworkLevel, SkillRecord } from "@/features/skills/types";
import { mockLatency } from "@/lib/mock/delay";

let skillsState = structuredClone(mockSkills);
let frameworkState = structuredClone(defaultFrameworkLevels);

export async function listSkills(): Promise<SkillRecord[]> {
  return structuredClone(skillsState);
}

export async function getSkill(skillId: string): Promise<SkillRecord | null> {
  return structuredClone(skillsState.find((s) => s.id === skillId) ?? null);
}

export async function duplicateSkill(skillId: string): Promise<SkillRecord | null> {
  await mockLatency(600);
  const source = skillsState.find((s) => s.id === skillId);
  if (!source) return null;
  const copy: SkillRecord = {
    ...structuredClone(source),
    id: `skill-${Date.now()}`,
    name: `${source.name} (Copy)`,
    status: "draft",
    roleUsage: 0,
    usedByRoleIds: [],
  };
  skillsState = [copy, ...skillsState];
  return structuredClone(copy);
}

export async function saveSkill(
  skillId: string,
  patch: Partial<Pick<SkillRecord, "name" | "description" | "status" | "levels">>,
): Promise<SkillRecord | null> {
  await mockLatency(700);
  skillsState = skillsState.map((skill) => {
    if (skill.id !== skillId) return skill;
    const levels = patch.levels ?? skill.levels;
    return {
      ...skill,
      ...patch,
      levels,
      levelsDefined: levels.length,
    };
  });
  return getSkill(skillId);
}

export async function getFramework(): Promise<FrameworkLevel[]> {
  return structuredClone(frameworkState);
}

export async function saveFramework(
  levels: FrameworkLevel[],
): Promise<FrameworkLevel[]> {
  await mockLatency(700);
  frameworkState = structuredClone(levels).sort((a, b) => a.rank - b.rank);
  return structuredClone(frameworkState);
}

export async function resetFramework(): Promise<FrameworkLevel[]> {
  await mockLatency(400);
  frameworkState = structuredClone(defaultFrameworkLevels);
  return structuredClone(frameworkState);
}
