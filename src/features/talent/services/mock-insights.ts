import { listRecruitmentAssessments } from "./mock-recruitment";
import {
  listTalentAssessments,
  talentPipeline,
  talentPipelineTotal,
  type Readiness,
} from "./mock-talent";

export type CandidateComparisonRow = {
  id: string;
  name: string;
  role: string;
  result: number;
  readiness: Readiness;
};

export type SkillSignalRow = {
  id: string;
  skill: string;
  assessed: number;
  ready: number;
  signal: "Strength" | "Gap";
};

export type OutcomeRow = {
  id: string;
  name: string;
  role: string;
  result: number;
  readiness: Readiness;
  outcome: string;
};

const completed = talentPipeline.find((slice) => slice.label === "Completed");

function readyRate() {
  const all = listTalentAssessments();
  if (all.length === 0) return "0%";
  const ready = all.filter((item) => item.readiness === "Ready").length;
  return `${Math.round((ready / all.length) * 100)}%`;
}

export const insightStats = {
  completionRate: completed?.share ?? "0%",
  completedCount: completed?.count ?? 0,
  totalCount: talentPipelineTotal,
  readyRate: readyRate(),
  recordedOutcomes: listTalentAssessments().length,
} as const;

export function candidateComparison(): CandidateComparisonRow[] {
  return listTalentAssessments()
    .map((item) => ({
      id: item.id,
      name: item.name,
      role: item.targetRole,
      result: item.result,
      readiness: item.readiness,
    }))
    .sort((a, b) => b.result - a.result);
}

/** Per-skill signal across every scored recruitment rubric. */
export function skillSignals(): SkillSignalRow[] {
  const bySkill = new Map<string, { assessed: number; ready: number }>();
  for (const assessment of listRecruitmentAssessments()) {
    for (const row of assessment.rubric) {
      if (!row.readiness) continue;
      const entry = bySkill.get(row.skill) ?? { assessed: 0, ready: 0 };
      entry.assessed += 1;
      if (row.readiness === "Ready") entry.ready += 1;
      bySkill.set(row.skill, entry);
    }
  }
  return [...bySkill.entries()].map(([skill, entry]) => ({
    id: skill,
    skill,
    assessed: entry.assessed,
    ready: entry.ready,
    signal: entry.ready * 2 >= entry.assessed ? "Strength" : "Gap",
  }));
}

export function historicalOutcomes(): OutcomeRow[] {
  return listTalentAssessments().map((item) => ({
    id: item.id,
    name: item.name,
    role: item.targetRole,
    result: item.result,
    readiness: item.readiness,
    outcome: outcomeFor(item.readiness),
  }));
}

export function talentInsightsText() {
  const comparison = candidateComparison()
    .map((row) => `${row.name}\t${row.role}\t${row.result}%\t${row.readiness}`)
    .join("\n");
  const skills = skillSignals()
    .map((row) => `${row.skill}\t${row.ready} of ${row.assessed} ready\t${row.signal}`)
    .join("\n");
  const outcomes = historicalOutcomes()
    .map((row) => `${row.name}\t${row.role}\t${row.result}%\t${row.readiness}\t${row.outcome}`)
    .join("\n");

  return [
    "Talent insights",
    `Completion rate: ${insightStats.completionRate} (${insightStats.completedCount} of ${insightStats.totalCount})`,
    `Candidates rated Ready: ${insightStats.readyRate}`,
    "",
    "Candidate comparison",
    "Name\tRole\tResult\tReadiness",
    comparison,
    "",
    "Skills strengths and gaps",
    "Skill\tReady\tSignal",
    skills,
    "",
    "Historical outcomes",
    "Name\tRole\tResult\tReadiness\tOutcome",
    outcomes,
    "",
  ].join("\n");
}

function outcomeFor(readiness: Readiness) {
  if (readiness === "Ready") return "Progressed";
  if (readiness === "Near Ready") return "Held";
  return "Not progressed";
}
