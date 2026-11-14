import { getPromotionAssessment } from "./mock-promotion";
import { getRecruitmentAssessment } from "./mock-recruitment";
import {
  listTalentAssessments,
  roleReadiness,
  talentPipeline,
  talentPipelineTotal,
  type Readiness,
} from "./mock-talent";

export type RoleComparisonRow = {
  id: string;
  name: string;
  source: "External candidate" | "Internal employee";
  result: number;
  readiness: Readiness;
};

export type SkillSignalRow = {
  id: string;
  skill: string;
  external: string;
  internal: string;
  signal: "Strength" | "Gap";
};

export type WeakRoleRow = {
  role: string;
  percent: number;
};

export type OutcomeRow = {
  id: string;
  name: string;
  source: "Recruitment" | "Promotion";
  role: string;
  result: number;
  readiness: Readiness;
  outcome: string;
};

const completed = talentPipeline.find((slice) => slice.label === "Completed");

export const insightStats = {
  completionRate: completed?.share ?? "0%",
  completedCount: completed?.count ?? 0,
  totalCount: talentPipelineTotal,
  weakRoleCount: roleReadiness.filter((item) => item.percent < 70).length,
  recordedOutcomes: listTalentAssessments().length,
} as const;

export function regionalSalesComparison(): RoleComparisonRow[] {
  const external = getRecruitmentAssessment("david-kalu");
  const internal = getPromotionAssessment("tunde-martins");
  return [
    {
      id: "david-kalu",
      name: external?.candidateName ?? "David Kalu",
      source: "External candidate",
      result: external?.score ?? 72,
      readiness: external?.readiness ?? "Not Ready",
    },
    {
      id: "tunde-martins",
      name: internal?.employeeName ?? "Tunde Martins",
      source: "Internal employee",
      result: internal?.score ?? 76,
      readiness: internal?.readiness ?? "Near Ready",
    },
  ];
}

export function regionalSalesSkillSignals(): SkillSignalRow[] {
  const external = getRecruitmentAssessment("david-kalu");
  const internal = getPromotionAssessment("tunde-martins");
  const skills = new Set<string>([
    ...(external?.rubric.map((row) => row.skill) ?? []),
    ...(internal?.rubric.map((row) => row.skill) ?? []),
  ]);

  return [...skills].map((skill) => {
    const externalRow = external?.rubric.find((row) => row.skill === skill);
    const internalRow = internal?.rubric.find((row) => row.skill === skill);
    const bands = [externalRow?.readiness, internalRow?.readiness].filter(Boolean);
    const signal = bands.includes("Ready") && !bands.includes("Not Ready") ? "Strength" : "Gap";
    return {
      id: skill,
      skill,
      external: externalRow?.readiness ? `${externalRow.readiness} (${externalRow.score})` : "—",
      internal: internalRow?.readiness ? `${internalRow.readiness} (${internalRow.score})` : "—",
      signal,
    };
  });
}

export function weakInternalRoles(): WeakRoleRow[] {
  return roleReadiness.filter((item) => item.percent < 70).map((item) => ({ ...item }));
}

export function historicalOutcomes(): OutcomeRow[] {
  return listTalentAssessments().map((item) => ({
    id: item.id,
    name: item.name,
    source: item.type === "recruitment" ? "Recruitment" : "Promotion",
    role: item.targetRole,
    result: item.result,
    readiness: item.readiness,
    outcome: outcomeFor(item.readiness),
  }));
}

export function talentInsightsText() {
  const comparison = regionalSalesComparison()
    .map((row) => `${row.name}\t${row.source}\t${row.result}%\t${row.readiness}`)
    .join("\n");
  const skills = regionalSalesSkillSignals()
    .map((row) => `${row.skill}\t${row.external}\t${row.internal}\t${row.signal}`)
    .join("\n");
  const weak = weakInternalRoles()
    .map((row) => `${row.role}\t${row.percent}%`)
    .join("\n");
  const outcomes = historicalOutcomes()
    .map((row) => `${row.name}\t${row.source}\t${row.role}\t${row.result}%\t${row.readiness}\t${row.outcome}`)
    .join("\n");

  return [
    "Talent insights",
    `Completion rate: ${insightStats.completionRate} (${insightStats.completedCount} of ${insightStats.totalCount})`,
    `Roles with weak internal readiness: ${insightStats.weakRoleCount}`,
    "",
    "Regional Sales Manager comparison",
    "Name\tSource\tResult\tReadiness",
    comparison,
    "",
    "Skill\tExternal\tInternal\tSignal",
    skills,
    "",
    "Weak internal readiness",
    "Role\tReadiness",
    weak,
    "",
    "Historical outcomes",
    "Name\tSource\tRole\tResult\tReadiness\tOutcome",
    outcomes,
    "",
  ].join("\n");
}

function outcomeFor(readiness: Readiness) {
  if (readiness === "Ready") return "Progressed";
  if (readiness === "Near Ready") return "Held";
  return "Not progressed";
}
