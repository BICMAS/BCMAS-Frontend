import { listRoles } from "@/features/roles/services/mock-roles";
import type {
  BulkMappingRow,
  MappingException,
  MappingExceptionMetrics,
  MappingGap,
  MappingRoleOption,
  MappingSkillBar,
  MappingWorkspace,
} from "@/features/employees/types";
import { mockLatency } from "@/lib/mock/delay";

import {
  bulkAssignRole,
  listEmployees,
  updateEmployeeProfileVersion,
} from "./mock-employees";

const JAMES_VERIFIED: MappingSkillBar[] = [
  { name: "Cloud Architecture", level: 4, percent: 80 },
  { name: "Microservices", level: 4, percent: 80 },
  { name: "Cyber Security", level: 3, percent: 60 },
];

const JAMES_TARGET: MappingSkillBar[] = [
  { name: "Cloud Architecture", level: 4, percent: 80 },
  { name: "Microservices", level: 4, percent: 80 },
  { name: "Cyber Security", level: 3, percent: 60 },
];

const JAMES_GAPS: MappingGap[] = [
  {
    skill: "Advanced AI Governance",
    requiredLevel: 4,
    verifiedLevel: 2,
    suggestion: "Enroll in 'AI Compliance Masterclass'.",
  },
];

let suggestionsState: BulkMappingRow[] | null = null;
let exceptionsState: MappingException[] = [
  {
    id: "ex-priya",
    employeeId: "emp-6612",
    employeeCode: "EMP-6612",
    name: "Priya Shah",
    departmentName: "Human Resources",
    type: "role_mismatch",
    assignedProfile: '"HR Business Partner" (Not in dept library)',
    resolutionLabel: "Re-map Role",
  },
  {
    id: "ex-robert",
    employeeId: "emp-9042",
    employeeCode: "EMP-9042",
    name: "Robert Chen",
    departmentName: "IT Infrastructure",
    type: "outdated_version",
    assignedProfile: "Archived: V1.1",
    currentVersion: "V2.4",
    resolutionLabel: "Update to V2.4",
  },
  {
    id: "ex-aisha",
    employeeId: "emp-4408",
    employeeCode: "EMP-4408",
    name: "Aisha Khan",
    departmentName: "Cyber Security",
    type: "custom_override",
    assignedProfile: "Manual override · V0.9 (Draft)",
    resolutionLabel: "Review override",
  },
];

let exceptionMetrics: MappingExceptionMetrics = {
  role_mismatch: 12,
  outdated_version: 28,
  custom_override: 5,
};

const savedRoleByEmployee = new Map<string, string>();
const finalisedEmployees = new Set<string>();

function genericSkills(seed: number): MappingSkillBar[] {
  return [
    { name: "Cloud Architecture", level: 3 + (seed % 2), percent: 60 },
    { name: "Stakeholder Communication", level: 3, percent: 70 },
    { name: "Role Framework Literacy", level: 2, percent: 40 },
  ];
}

function buildWorkspace(
  employeeId: string,
  name: string,
  roleId: string,
): MappingWorkspace {
  const savedRole = savedRoleByEmployee.get(employeeId);
  const targetRoleId = savedRole ?? roleId;
  const finalised = finalisedEmployees.has(employeeId);

  if (employeeId === "emp-8721" && targetRoleId === "role-ssa") {
    return {
      employeeId,
      targetRoleId,
      matchPercent: 95,
      skillsMet: 10,
      skillsTotal: 12,
      verifiedSkills: JAMES_VERIFIED,
      targetSkills: JAMES_TARGET,
      gaps: finalised ? [] : JAMES_GAPS,
      saved: savedRoleByEmployee.has(employeeId),
      finalised,
    };
  }

  const matchPercent = finalised ? 96 : 74;
  return {
    employeeId,
    targetRoleId,
    matchPercent,
    skillsMet: finalised ? 8 : 6,
    skillsTotal: 8,
    verifiedSkills: genericSkills(name.length),
    targetSkills: genericSkills(name.length + 1).map((skill) => ({
      ...skill,
      level: Math.min(5, skill.level + 1),
      percent: Math.min(100, skill.percent + 15),
    })),
    gaps: finalised
      ? []
      : [
          {
            skill: "Role-specific proficiency",
            requiredLevel: 4,
            verifiedLevel: 2,
            suggestion: `Confirm ${name.split(" ")[0]}'s evidence before finalising.`,
          },
        ],
    saved: savedRoleByEmployee.has(employeeId),
    finalised,
  };
}

async function ensureSuggestions(): Promise<BulkMappingRow[]> {
  if (suggestionsState) return suggestionsState;
  const employees = await listEmployees();
  suggestionsState = employees.map((employee) => ({
    id: employee.id,
    employeeId: employee.id,
    name: employee.name,
    avatarUrl: employee.avatarUrl,
    departmentName: employee.departmentName,
    suggestedRoleId: employee.roleId ?? "role-ssa",
    suggestedRoleTitle: employee.roleTitle ?? "Senior Solutions Architect",
    confidence:
      employee.mappingStatus === "aligned"
        ? 92
        : employee.mappingStatus === "unmapped"
          ? 72
          : 88,
    status:
      employee.mappingStatus === "aligned"
        ? "aligned"
        : employee.mappingStatus === "unmapped"
          ? "unmapped"
          : "draft",
  }));
  return suggestionsState;
}

export async function listMappingRoles(): Promise<MappingRoleOption[]> {
  const roles = await listRoles();
  return roles.map((role) => ({ id: role.id, title: role.title }));
}

export async function listMappingWorkspaces(): Promise<MappingWorkspace[]> {
  const employees = await listEmployees();
  return employees.map((employee) =>
    buildWorkspace(
      employee.id,
      employee.name,
      employee.roleId ?? "role-ssa",
    ),
  );
}

export async function listBulkMappingRows(): Promise<BulkMappingRow[]> {
  return structuredClone(await ensureSuggestions());
}

export async function listMappingExceptions(): Promise<{
  rows: MappingException[];
  metrics: MappingExceptionMetrics;
}> {
  return {
    rows: structuredClone(exceptionsState),
    metrics: { ...exceptionMetrics },
  };
}

export async function saveMappingProgress(
  employeeId: string,
  roleId: string,
): Promise<void> {
  await mockLatency(400);
  savedRoleByEmployee.set(employeeId, roleId);
}

export async function finaliseMapping(
  employeeId: string,
  roleId: string,
  roleTitle: string,
): Promise<void> {
  await mockLatency(700);
  savedRoleByEmployee.set(employeeId, roleId);
  finalisedEmployees.add(employeeId);
  await bulkAssignRole([employeeId], roleId, roleTitle);
}

export async function autoMapSuggestions(): Promise<number> {
  await mockLatency(800);
  const rows = await ensureSuggestions();
  let count = 0;
  suggestionsState = rows.map((row) => {
    if (row.status === "aligned") return row;
    count += 1;
    return { ...row, status: "draft" as const };
  });
  return count;
}

export async function assignSuggestedRoles(
  employeeIds: string[],
  roleId: string,
  roleTitle: string,
): Promise<number> {
  await mockLatency(700);
  const rows = await ensureSuggestions();
  let count = 0;
  suggestionsState = rows.map((row) => {
    if (!employeeIds.includes(row.employeeId)) return row;
    count += 1;
    return {
      ...row,
      suggestedRoleId: roleId,
      suggestedRoleTitle: roleTitle,
      status: "aligned" as const,
      confidence: Math.max(row.confidence, 90),
    };
  });
  await bulkAssignRole(employeeIds, roleId, roleTitle);
  return count;
}

export async function finaliseAllDrafts(): Promise<number> {
  await mockLatency(800);
  const rows = await ensureSuggestions();
  const drafts = rows.filter((row) => row.status === "draft");
  suggestionsState = rows.map((row) =>
    row.status === "draft" ? { ...row, status: "aligned" as const } : row,
  );
  const groups = new Map<string, { title: string; ids: string[] }>();
  for (const row of drafts) {
    const group = groups.get(row.suggestedRoleId) ?? {
      title: row.suggestedRoleTitle,
      ids: [],
    };
    group.ids.push(row.employeeId);
    groups.set(row.suggestedRoleId, group);
  }
  for (const [roleId, group] of groups) {
    await bulkAssignRole(group.ids, roleId, group.title);
  }
  return drafts.length;
}

export async function resolveMappingException(
  exceptionId: string,
): Promise<MappingException | null> {
  await mockLatency(500);
  const exception = exceptionsState.find((row) => row.id === exceptionId);
  if (!exception) return null;
  if (exception.type === "outdated_version" && exception.currentVersion) {
    await updateEmployeeProfileVersion(
      exception.employeeId,
      `${exception.currentVersion} (Published)`,
    );
  }
  exceptionMetrics = {
    ...exceptionMetrics,
    [exception.type]: Math.max(0, exceptionMetrics[exception.type] - 1),
  };
  exceptionsState = exceptionsState.filter((row) => row.id !== exceptionId);
  return structuredClone(exception);
}
