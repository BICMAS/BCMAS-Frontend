import type { RoleRecord } from "@/features/roles/types";
import { mockLatency } from "@/lib/mock/delay";

import { resolveLibraryItems } from "./mock-library";
import { readinessForScore } from "./mock-recruitment";
import type { Readiness } from "./mock-talent";

export type PromotionStatus = "Assigned" | "In progress" | "Submitted" | "Reviewed";

export type ManagerDecision = "Support" | "Defer" | "Do not support";

export type PromotionRubricRow = {
  skill: string;
  requiredLevel: string;
  requiredRank: number;
  score: number | null;
  readiness: Readiness | null;
};

export type PromotionAssessment = {
  id: string;
  employeeId: string;
  employeeUserId: string | null;
  employeeName: string;
  currentRole: string;
  roleId: string | null;
  roleTitle: string;
  status: PromotionStatus;
  score: number | null;
  readiness: Readiness | null;
  rubric: PromotionRubricRow[];
  createdBy: string;
  libraryItemIds: string[];
  managerComment: string | null;
  managerDecision: ManagerDecision | null;
  reviewedBy: string | null;
};

const LEVEL_RANK: Record<string, number> = {
  Foundation: 1,
  Intermediate: 2,
  Proficient: 3,
  Advanced: 4,
  Expert: 5,
};

/** Michael Kyle's direct reports in the employee directory. */
const DIRECT_REPORT_IDS = ["emp-8721", "emp-9042"];

const USER_BY_EMPLOYEE: Record<string, string> = {
  "emp-8721": "user-james",
};

let sequence = 20;
let promotions: PromotionAssessment[] = seedPromotions();

export function isDirectReport(employeeId: string) {
  return DIRECT_REPORT_IDS.includes(employeeId);
}

export function listPromotionAssessments() {
  return promotions.map(clonePromotion);
}

export function listOwnPromotions(userId: string) {
  return promotions.filter((item) => item.employeeUserId === userId).map(clonePromotion);
}

export function listDirectReportPromotions() {
  return promotions.filter((item) => isDirectReport(item.employeeId)).map(clonePromotion);
}

export function getPromotionAssessment(id: string) {
  const found = promotions.find((item) => item.id === id);
  return found ? clonePromotion(found) : null;
}

export function getOwnPromotion(id: string, userId: string) {
  const found = promotions.find((item) => item.id === id && item.employeeUserId === userId);
  return found ? clonePromotion(found) : null;
}

export async function createPromotionAssessment(input: {
  employeeId: string;
  employeeName: string;
  currentRole: string;
  role: RoleRecord;
  createdBy: string;
  libraryItemIds: string[];
}) {
  await mockLatency(400);
  const libraryItems = resolveLibraryItems(input.libraryItemIds);
  if (!libraryItems.length) {
    throw new Error("Select at least one library item");
  }
  sequence += 1;
  const id = `promo-${sequence}`;
  const record: PromotionAssessment = {
    id,
    employeeId: input.employeeId,
    employeeUserId: USER_BY_EMPLOYEE[input.employeeId] ?? null,
    employeeName: input.employeeName,
    currentRole: input.currentRole,
    roleId: input.role.id,
    roleTitle: input.role.title,
    status: "Assigned",
    score: null,
    readiness: null,
    rubric: rubricFromRole(input.role),
    createdBy: input.createdBy,
    libraryItemIds: libraryItems.map((item) => item.id),
    managerComment: null,
    managerDecision: null,
    reviewedBy: null,
  };
  promotions = [record, ...promotions];
  return getPromotionAssessment(id)!;
}

export async function submitPromotionAnswers(
  id: string,
  userId: string,
  answers: { skill: string; score: number }[],
) {
  await mockLatency(400);
  promotions = promotions.map((item) => {
    if (item.id !== id || item.employeeUserId !== userId) return item;
    const rubric = item.rubric.map((row) => {
      const answer = answers.find((entry) => entry.skill === row.skill);
      if (!answer) return row;
      return {
        ...row,
        score: answer.score,
        readiness: readinessForScore(answer.score, row.requiredRank),
      };
    });
    return {
      ...item,
      rubric,
      status: "Submitted" as const,
      readiness: overallReadiness(rubric),
      score: overallScore(rubric),
    };
  });
  return getOwnPromotion(id, userId);
}

export async function saveManagerReview(
  id: string,
  input: { reviewer: string; comment: string; decision: ManagerDecision },
) {
  await mockLatency(400);
  promotions = promotions.map((item) => {
    if (item.id !== id || !isDirectReport(item.employeeId)) return item;
    return {
      ...item,
      status: "Reviewed" as const,
      managerComment: input.comment.trim(),
      managerDecision: input.decision,
      reviewedBy: input.reviewer,
    };
  });
  return getPromotionAssessment(id);
}

function rubricFromRole(role: RoleRecord): PromotionRubricRow[] {
  const technical = role.technicalSkills.map((skill) => ({
    skill: skill.name,
    requiredLevel: skill.levelLabel,
    requiredRank: LEVEL_RANK[skill.levelLabel] ?? 3,
    score: null,
    readiness: null,
  }));
  const behavioural = role.behaviouralSkills.map((skill) => ({
    skill,
    requiredLevel: "Advanced",
    requiredRank: 4,
    score: null,
    readiness: null,
  }));
  return [...technical, ...behavioural];
}

function overallReadiness(rubric: PromotionRubricRow[]): Readiness | null {
  const bands = rubric.map((row) => row.readiness).filter((band) => band != null);
  if (!bands.length) return null;
  if (bands.includes("Not Ready")) return "Not Ready";
  if (bands.includes("Near Ready")) return "Near Ready";
  return "Ready";
}

function overallScore(rubric: PromotionRubricRow[]) {
  const scored = rubric.filter((row) => row.score != null);
  if (!scored.length) return null;
  const total = scored.reduce((sum, row) => sum + (row.score ?? 0), 0);
  return Math.round((total / scored.length / 5) * 100);
}

function clonePromotion(item: PromotionAssessment): PromotionAssessment {
  return { ...item, rubric: item.rubric.map((row) => ({ ...row })) };
}

function scored(skill: string, requiredLevel: string, score: number): PromotionRubricRow {
  const requiredRank = LEVEL_RANK[requiredLevel] ?? 3;
  return {
    skill,
    requiredLevel,
    requiredRank,
    score,
    readiness: readinessForScore(score, requiredRank),
  };
}

function seedPromotions(): PromotionAssessment[] {
  return [
    {
      id: "tunde-martins",
      employeeId: "emp-tunde",
      employeeUserId: null,
      employeeName: "Tunde Martins",
      currentRole: "Area Sales Lead",
      roleId: null,
      roleTitle: "Regional Sales Manager",
      status: "Submitted",
      score: 76,
      readiness: "Near Ready",
      rubric: [scored("Regional sales planning", "Advanced", 4), scored("Team leadership", "Expert", 3)],
      createdBy: "Priya Nair",
      libraryItemIds: ["lib-rsm-knowledge", "lib-rsm-roleplay"],
      managerComment: null,
      managerDecision: null,
      reviewedBy: null,
    },
    {
      id: "funmi-nwosu",
      employeeId: "emp-funmi",
      employeeUserId: null,
      employeeName: "Funmi Nwosu",
      currentRole: "Marketing Executive",
      roleId: null,
      roleTitle: "Trade Marketing Manager",
      status: "Submitted",
      score: 62,
      readiness: "Not Ready",
      rubric: [scored("Trade planning", "Advanced", 2), scored("Campaign leadership", "Advanced", 3)],
      createdBy: "Priya Nair",
      libraryItemIds: ["lib-tmm-case"],
      managerComment: null,
      managerDecision: null,
      reviewedBy: null,
    },
    {
      id: "promo-james",
      employeeId: "emp-8721",
      employeeUserId: "user-james",
      employeeName: "James Miller",
      currentRole: "Senior Solutions Architect",
      roleId: "role-eng-lead",
      roleTitle: "Engineering Lead",
      status: "Assigned",
      score: null,
      readiness: null,
      rubric: [
        {
          skill: "Leadership & Mentoring",
          requiredLevel: "Advanced",
          requiredRank: 4,
          score: null,
          readiness: null,
        },
      ],
      createdBy: "Priya Nair",
      libraryItemIds: ["lib-behaviour"],
      managerComment: null,
      managerDecision: null,
      reviewedBy: null,
    },
    {
      id: "promo-robert",
      employeeId: "emp-9042",
      employeeUserId: null,
      employeeName: "Robert Chen",
      currentRole: "Lead Data Engineer",
      roleId: "role-ssa",
      roleTitle: "Senior Solutions Architect",
      status: "Submitted",
      score: 80,
      readiness: "Near Ready",
      rubric: [
        scored("Cloud Infrastructure Design", "Expert", 4),
        scored("Strategic Thinking", "Advanced", 4),
      ],
      createdBy: "Priya Nair",
      libraryItemIds: ["lib-ssa-practical"],
      managerComment: null,
      managerDecision: null,
      reviewedBy: null,
    },
  ];
}
