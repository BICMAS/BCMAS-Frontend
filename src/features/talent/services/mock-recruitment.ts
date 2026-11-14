import type { RoleRecord, RoleSkillRequirement } from "@/features/roles/types";
import { mockLatency } from "@/lib/mock/delay";
import type { ProfileLifecycleStatus } from "@/lib/mock/types";

import { resolveLibraryItems } from "./mock-library";

import type { Readiness } from "./mock-talent";

export type RecruitmentProgress = "Invited" | "In progress" | "Completed" | "Awaiting review";

export type RubricRow = {
  skill: string;
  requiredLevel: string;
  requiredRank: number;
  score: number | null;
  readiness: Readiness | null;
};

export type RecruitmentEvidence = {
  id: string;
  title: string;
  note: string;
};

export type RecruitmentAudit = {
  id: string;
  action: "Created" | "Reviewed" | "Submitted";
  actor: string;
  at: string;
};

export type RecruitmentAssessment = {
  id: string;
  candidateName: string;
  email: string;
  roleId: string | null;
  roleTitle: string;
  durationMinutes: number;
  deadline: string;
  progress: RecruitmentProgress;
  score: number | null;
  readiness: Readiness | null;
  inviteToken: string;
  libraryItemIds: string[];
  createdBy: string;
  reviewedBy: string | null;
  rubric: RubricRow[];
  evidence: RecruitmentEvidence[];
  audit: RecruitmentAudit[];
};

const LEVEL_RANK: Record<string, number> = {
  Foundation: 1,
  Intermediate: 2,
  Proficient: 3,
  Advanced: 4,
  Expert: 5,
};

/** Published profiles are the released form of an approved skills profile. */
const APPROVED_STATUSES: ProfileLifecycleStatus[] = ["approved", "published"];

let sequence = 10;
let recruitmentAssessments: RecruitmentAssessment[] = seedRecruitment();

const STORAGE_KEY = "bcms-recruitment-assessments";
const CHANGE_EVENT = "bcms-recruitment-change";

function loadPersisted() {
  if (typeof window === "undefined") return;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    recruitmentAssessments = JSON.parse(raw) as RecruitmentAssessment[];
  } catch {
    /* Keep the in-memory list when stored JSON cannot be read. */
  }
}

function persistRecruitment() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(recruitmentAssessments));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeRecruitment(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function recruitmentSnapshot() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(STORAGE_KEY) ?? "";
}

export function recruitmentRows(snapshot: string) {
  if (!snapshot) return listRecruitmentAssessments();
  try {
    return JSON.parse(snapshot) as RecruitmentAssessment[];
  } catch {
    return listRecruitmentAssessments();
  }
}

export function isApprovedRoleProfile(status: ProfileLifecycleStatus) {
  return APPROVED_STATUSES.includes(status);
}

export function readinessForScore(score: number, requiredRank: number): Readiness {
  if (score >= requiredRank) return "Ready";
  if (score === requiredRank - 1) return "Near Ready";
  return "Not Ready";
}

export function listRecruitmentAssessments() {
  return recruitmentAssessments.map((item) => ({ ...item }));
}

export function getRecruitmentAssessment(id: string) {
  const found = recruitmentAssessments.find((item) => item.id === id);
  return found ? { ...found, rubric: [...found.rubric], evidence: [...found.evidence], audit: [...found.audit] } : null;
}

export function getRecruitmentByToken(token: string) {
  const found = recruitmentAssessments.find((item) => item.inviteToken === token);
  return found ? getRecruitmentAssessment(found.id) : null;
}

export function invitePath(token: string) {
  return `/talent/invite/${token}`;
}

export type InviteState = "invalid" | "used" | "open";

export const knowledgeLevels = [
  { rank: 1, label: "Foundation" },
  { rank: 2, label: "Intermediate" },
  { rank: 3, label: "Proficient" },
  { rank: 4, label: "Advanced" },
  { rank: 5, label: "Expert" },
] as const;

export const scenarioChoices = [
  { id: "defer", label: "Defer the decision", rank: 2 },
  { id: "minimum", label: "Apply the minimum standard", rank: 3 },
  { id: "required", label: "Meet the required standard and explain the trade-off", rank: 4 },
  { id: "exceed", label: "Exceed the standard with a documented plan", rank: 5 },
] as const;

export function inviteState(token: string): InviteState {
  const found = recruitmentAssessments.find((item) => item.inviteToken === token);
  if (!found) return "invalid";
  if (found.progress !== "Invited") return "used";
  return "open";
}

export async function submitCandidateInvite(
  token: string,
  input: { knowledge: { skill: string; score: number }[]; scenarioChoiceId: string },
) {
  await mockLatency(400);
  loadPersisted();
  const choice = scenarioChoices.find((item) => item.id === input.scenarioChoiceId);
  if (!choice) return null;
  let updatedId: string | null = null;
  recruitmentAssessments = recruitmentAssessments.map((item) => {
    if (item.inviteToken !== token || item.progress !== "Invited") return item;
    const knowledge = item.rubric.map((row) => {
      const answer = input.knowledge.find((entry) => entry.skill === row.skill);
      if (!answer) return row;
      return {
        ...row,
        score: answer.score,
        readiness: readinessForScore(answer.score, row.requiredRank),
      };
    });
    const scenario: RubricRow = {
      skill: "Scenario judgement",
      requiredLevel: "Advanced",
      requiredRank: 4,
      score: choice.rank,
      readiness: readinessForScore(choice.rank, 4),
    };
    const rubric = [...knowledge, scenario];
    const next: RecruitmentAssessment = {
      ...item,
      rubric,
      progress: "Awaiting review",
      readiness: overallReadiness(rubric),
      score: overallScore(rubric),
      evidence: [
        ...item.evidence,
        { id: `${item.id}-scenario`, title: "Scenario response", note: choice.label },
      ],
      audit: [
        ...item.audit,
        { id: `${item.id}-submitted`, action: "Submitted", actor: "Candidate", at: "2026-11-14" },
      ],
    };
    updatedId = next.id;
    return next;
  });
  persistRecruitment();
  return updatedId ? getRecruitmentAssessment(updatedId) : null;
}

function overallReadiness(rubric: RubricRow[]): Readiness {
  if (rubric.some((row) => row.readiness === "Not Ready")) return "Not Ready";
  if (rubric.some((row) => row.readiness === "Near Ready")) return "Near Ready";
  return "Ready";
}

function overallScore(rubric: RubricRow[]) {
  const scored = rubric.filter((row) => row.score != null);
  if (!scored.length) return null;
  const total = scored.reduce((sum, row) => sum + (row.score ?? 0), 0);
  return Math.round((total / scored.length / 5) * 100);
}

export async function createRecruitmentAssessment(input: {
  role: RoleRecord;
  candidateName: string;
  email: string;
  durationMinutes: number;
  deadline: string;
  createdBy: string;
  libraryItemIds: string[];
}): Promise<RecruitmentAssessment> {
  await mockLatency(400);
  loadPersisted();
  if (!isApprovedRoleProfile(input.role.status)) {
    throw new Error("Role skills profile is not approved");
  }
  const libraryItems = resolveLibraryItems(input.libraryItemIds);
  if (!libraryItems.length) {
    throw new Error("Select at least one library item");
  }
  sequence += 1;
  const id = `recruit-${sequence}`;
  const token = `inv-${sequence}-${slug(input.candidateName)}`;
  const record: RecruitmentAssessment = {
    id,
    candidateName: input.candidateName.trim(),
    email: input.email.trim(),
    roleId: input.role.id,
    roleTitle: input.role.title,
    durationMinutes: input.durationMinutes,
    deadline: input.deadline,
    progress: "Invited",
    score: null,
    readiness: null,
    inviteToken: token,
    libraryItemIds: libraryItems.map((item) => item.id),
    createdBy: input.createdBy,
    reviewedBy: null,
    rubric: rubricFromRole(input.role),
    evidence: [],
    audit: [
      {
        id: `${id}-created`,
        action: "Created",
        actor: input.createdBy,
        at: "2026-11-14",
      },
    ],
  };
  recruitmentAssessments = [record, ...recruitmentAssessments];
  persistRecruitment();
  return getRecruitmentAssessment(id)!;
}

export async function reviewRecruitmentAssessment(id: string, reviewer: string) {
  await mockLatency(400);
  loadPersisted();
  recruitmentAssessments = recruitmentAssessments.map((item) => {
    if (item.id !== id || item.reviewedBy) return item;
    return {
      ...item,
      reviewedBy: reviewer,
      audit: [
        ...item.audit,
        {
          id: `${id}-reviewed`,
          action: "Reviewed",
          actor: reviewer,
          at: "2026-11-14",
        },
      ],
    };
  });
  persistRecruitment();
  return getRecruitmentAssessment(id);
}

export function recruitmentReportText(record: RecruitmentAssessment) {
  const rubric = record.rubric
    .map(
      (row) =>
        `${row.skill}\t${row.requiredLevel}\t${row.score ?? "—"}\t${row.readiness ?? "Not scored"}`,
    )
    .join("\n");
  const evidence = record.evidence.map((item) => `${item.title}: ${item.note}`).join("\n") || "None";
  const audit = record.audit.map((item) => `${item.action} by ${item.actor} on ${item.at}`).join("\n");
  return [
    `Recruitment assessment: ${record.candidateName}`,
    `Role: ${record.roleTitle}`,
    `Deadline: ${record.deadline}`,
    `Progress: ${record.progress}`,
    `Score: ${record.score ?? "—"}`,
    `Readiness: ${record.readiness ?? "Not scored"}`,
    `Library items: ${record.libraryItemIds?.join(", ") || "None"}`,
    `Created by: ${record.createdBy}`,
    `Reviewed by: ${record.reviewedBy ?? "—"}`,
    "",
    "Skill\tRequired level\tScore\tReadiness",
    rubric,
    "",
    "Evidence",
    evidence,
    "",
    "Audit",
    audit,
    "",
  ].join("\n");
}

function rubricFromRole(role: RoleRecord): RubricRow[] {
  const technical = role.technicalSkills.map((skill) => rowFromSkill(skill));
  const behavioural = role.behaviouralSkills.map((skill) => ({
    skill,
    requiredLevel: "Advanced",
    requiredRank: 4,
    score: null,
    readiness: null,
  }));
  return [...technical, ...behavioural];
}

function rowFromSkill(skill: RoleSkillRequirement): RubricRow {
  return {
    skill: skill.name,
    requiredLevel: skill.levelLabel,
    requiredRank: LEVEL_RANK[skill.levelLabel] ?? 3,
    score: null,
    readiness: null,
  };
}

function scoredRow(skill: string, requiredLevel: string, score: number): RubricRow {
  const requiredRank = LEVEL_RANK[requiredLevel] ?? 3;
  return {
    skill,
    requiredLevel,
    requiredRank,
    score,
    readiness: readinessForScore(score, requiredRank),
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function seedRecruitment(): RecruitmentAssessment[] {
  return [
    {
      id: "david-kalu",
      candidateName: "David Kalu",
      email: "david.kalu@example.com",
      roleId: null,
      roleTitle: "Regional Sales Manager",
      durationMinutes: 60,
      deadline: "2026-11-30",
      progress: "Completed",
      score: 72,
      readiness: "Not Ready",
      inviteToken: "inv-david-kalu",
      libraryItemIds: ["lib-rsm-knowledge", "lib-rsm-case"],
      createdBy: "Priya Nair",
      reviewedBy: "Priya Nair",
      rubric: [
        scoredRow("Regional sales planning", "Advanced", 3),
        scoredRow("Key account negotiation", "Expert", 2),
      ],
      evidence: [
        { id: "ev-david-1", title: "Case study response", note: "Territory plan submitted as PDF." },
        { id: "ev-david-2", title: "Knowledge test", note: "Scored against the role rubric." },
      ],
      audit: [
        { id: "david-created", action: "Created", actor: "Priya Nair", at: "2026-11-02" },
        { id: "david-reviewed", action: "Reviewed", actor: "Priya Nair", at: "2026-11-10" },
      ],
    },
    {
      id: "aisha-okafor",
      candidateName: "Aisha Okafor",
      email: "aisha.okafor@example.com",
      roleId: null,
      roleTitle: "Key Account Manager",
      durationMinutes: 60,
      deadline: "2026-11-28",
      progress: "Completed",
      score: 88,
      readiness: "Ready",
      inviteToken: "inv-aisha-okafor",
      libraryItemIds: ["lib-kam-knowledge", "lib-kam-sjt"],
      createdBy: "Priya Nair",
      reviewedBy: "Priya Nair",
      rubric: [
        scoredRow("Account planning", "Advanced", 5),
        scoredRow("Commercial negotiation", "Advanced", 4),
      ],
      evidence: [{ id: "ev-aisha-1", title: "Scenario response", note: "Client meeting case." }],
      audit: [
        { id: "aisha-created", action: "Created", actor: "Priya Nair", at: "2026-11-03" },
        { id: "aisha-reviewed", action: "Reviewed", actor: "Priya Nair", at: "2026-11-11" },
      ],
    },
    {
      id: "ifeoma-obi",
      candidateName: "Ifeoma Obi",
      email: "ifeoma.obi@example.com",
      roleId: null,
      roleTitle: "Sales Manager",
      durationMinutes: 45,
      deadline: "2026-12-02",
      progress: "Awaiting review",
      score: 85,
      readiness: "Ready",
      inviteToken: "inv-ifeoma-obi",
      libraryItemIds: ["lib-sales-practical"],
      createdBy: "Priya Nair",
      reviewedBy: null,
      rubric: [
        scoredRow("Team selling", "Advanced", 4),
        scoredRow("Pipeline management", "Advanced", 5),
      ],
      evidence: [{ id: "ev-ifeoma-1", title: "Practical task", note: "Quarterly forecast workbook." }],
      audit: [{ id: "ifeoma-created", action: "Created", actor: "Priya Nair", at: "2026-11-06" }],
    },
    {
      id: "nora-ade",
      candidateName: "Nora Adeyemi",
      email: "nora.adeyemi@example.com",
      roleId: "role-ssa",
      roleTitle: "Senior Solutions Architect",
      durationMinutes: 90,
      deadline: "2026-12-12",
      progress: "Invited",
      score: null,
      readiness: null,
      inviteToken: "inv-nora-adeyemi",
      libraryItemIds: ["lib-ssa-practical", "lib-behaviour"],
      createdBy: "Priya Nair",
      reviewedBy: null,
      rubric: [
        { skill: "Cloud Infrastructure Design", requiredLevel: "Expert", requiredRank: 5, score: null, readiness: null },
        { skill: "Microservices Design", requiredLevel: "Expert", requiredRank: 5, score: null, readiness: null },
        { skill: "Kubernetes & Docker", requiredLevel: "Advanced", requiredRank: 4, score: null, readiness: null },
        { skill: "SQL & NoSQL Databases", requiredLevel: "Advanced", requiredRank: 4, score: null, readiness: null },
        { skill: "Strategic Thinking", requiredLevel: "Advanced", requiredRank: 4, score: null, readiness: null },
      ],
      evidence: [],
      audit: [{ id: "nora-created", action: "Created", actor: "Priya Nair", at: "2026-11-12" }],
    },
    {
      id: "liam-cole",
      candidateName: "Liam Cole",
      email: "liam.cole@example.com",
      roleId: "role-eng-lead",
      roleTitle: "Engineering Lead",
      durationMinutes: 60,
      deadline: "2026-12-08",
      progress: "In progress",
      score: null,
      readiness: null,
      inviteToken: "inv-liam-cole",
      libraryItemIds: ["lib-behaviour"],
      createdBy: "Priya Nair",
      reviewedBy: null,
      rubric: [
        { skill: "Leadership & Mentoring", requiredLevel: "Advanced", requiredRank: 4, score: null, readiness: null },
      ],
      evidence: [],
      audit: [{ id: "liam-created", action: "Created", actor: "Priya Nair", at: "2026-11-09" }],
    },
  ];
}
