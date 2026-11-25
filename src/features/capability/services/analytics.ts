/**
 * Report figures from released capability results. Nothing here uses self-ratings or unreleased
 * decisions, and every figure carries the number of people behind it.
 */
import type { MockUser } from "@/types/user";

import type { AssessmentItem, CapabilityAssessment, GapPriority } from "../types";
import { assessmentsInCycle, latestResults, listCapabilityCycles } from "./capability";
import { capabilityMatch, gapOf, priorityOf, verifiedLevel } from "./scoring";

const average = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

export type SkillSummary = {
  skill: string;
  people: number;
  averageLevel: number;
  averageRequired: number;
  /** Average gap across everyone assessed in the skill. */
  averageGap: number;
  /** Share at or above their required level. */
  metPct: number;
  priority: Exclude<GapPriority, "not_verified">;
  affected: Array<{ employeeId: string; name: string; role: string; level: number; required: number }>;
};

export type TeamReport = {
  people: number;
  /** Average of each person's capability match. */
  averageMatch: number | null;
  skills: SkillSummary[];
  strongest: SkillSummary | null;
  biggestGap: SkillSummary | null;
};

const RANK = { met: 0, moderate: 1, critical: 2 } as const;

function summarise(skill: string, rows: Array<{ a: CapabilityAssessment; item: AssessmentItem }>): SkillSummary {
  const affected = rows
    .filter((r) => gapOf(r.item)! > 0)
    .map(({ a, item }) => ({ employeeId: a.employeeId, name: a.employeeName, role: a.roleTitle, level: verifiedLevel(item)!, required: item.required }));
  const priority = rows
    .map((r) => priorityOf(r.item) as SkillSummary["priority"])
    .reduce((worst, p) => (RANK[p] > RANK[worst] ? p : worst), "met" as SkillSummary["priority"]);
  return {
    skill,
    people: rows.length,
    averageLevel: round1(average(rows.map((r) => verifiedLevel(r.item)!))!),
    averageRequired: round1(average(rows.map((r) => r.item.required))!),
    averageGap: round1(average(rows.map((r) => gapOf(r.item)!))!),
    metPct: Math.round((100 * rows.filter((r) => gapOf(r.item) === 0).length) / rows.length),
    priority,
    affected,
  };
}

export function reportFor(results: CapabilityAssessment[]): TeamReport {
  const bySkill = new Map<string, Array<{ a: CapabilityAssessment; item: AssessmentItem }>>();
  for (const a of results) {
    for (const item of a.items) {
      if (verifiedLevel(item) === null) continue;
      bySkill.set(item.name, [...(bySkill.get(item.name) ?? []), { a, item }]);
    }
  }
  const skills = [...bySkill.entries()]
    .map(([name, rows]) => summarise(name, rows))
    .sort((a, b) => b.averageGap - a.averageGap || a.skill.localeCompare(b.skill));
  const matches = results.map((a) => capabilityMatch(a.items).percent).filter((p): p is number => p !== null);
  const mean = average(matches);
  return {
    people: results.length,
    averageMatch: mean === null ? null : Math.round(mean),
    skills,
    strongest: [...skills].sort((a, b) => b.averageLevel - a.averageLevel)[0] ?? null,
    biggestGap: skills.find((s) => s.averageGap > 0) ?? null,
  };
}

/** Latest released results the person may see, optionally for one department. */
export function teamReport(user: MockUser, department?: string): TeamReport {
  return reportFor(latestResults(user).filter((a) => !department || a.department === department));
}

export function departmentsWithResults(user: MockUser): string[] {
  return [...new Set(latestResults(user).map((a) => a.department))].sort();
}

/** Average match per department in each cycle with released results, oldest cycle first. */
export function departmentTrend(user: MockUser) {
  const cycles = listCapabilityCycles(user.organisationId)
    .map((c) => ({ cycle: c, released: assessmentsInCycle(user, c.id).filter((a) => a.releasedAt) }))
    .filter((c) => c.released.length)
    .sort((a, b) => (a.cycle.startsOn ?? "").localeCompare(b.cycle.startsOn ?? ""));
  const departments = [...new Set(cycles.flatMap((c) => c.released.map((a) => a.department)))].sort();
  return {
    cycles: cycles.map((c) => c.cycle.name),
    rows: departments.map((department) => ({
      department,
      values: cycles.map((c) => reportFor(c.released.filter((a) => a.department === department)).averageMatch),
    })),
  };
}

export type Improvement = { name: string; skill: string; from: number; to: number };

/** Skills whose verified level rose between a person's last two released results. */
export function improvements(user: MockUser): { list: Improvement[]; gapsClosed: number; compared: number } {
  const released = listCapabilityCycles(user.organisationId)
    .flatMap((c) => assessmentsInCycle(user, c.id))
    .filter((a) => a.releasedAt)
    .sort((a, b) => b.releasedAt!.localeCompare(a.releasedAt!));
  const list: Improvement[] = [];
  let gapsClosed = 0;
  let compared = 0;
  for (const id of new Set(released.map((a) => a.employeeId))) {
    const [now, before] = released.filter((a) => a.employeeId === id);
    if (!now || !before) continue;
    compared += 1;
    for (const item of now.items) {
      const old = before.items.find((i) => i.skillId === item.skillId);
      const from = old ? verifiedLevel(old) : null;
      const to = verifiedLevel(item);
      if (!old || from === null || to === null) continue;
      if (to > from) list.push({ name: now.employeeName, skill: item.name, from, to });
      if (gapOf(old)! > 0 && gapOf(item) === 0) gapsClosed += 1;
    }
  }
  return { list, gapsClosed, compared };
}
