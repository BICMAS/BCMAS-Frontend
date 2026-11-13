import { mockRoles } from "@/features/roles/data/mock-roles";
import type { RoleRecord } from "@/features/roles/types";
import { mockLatency } from "@/lib/mock/delay";
import type { ProfileLifecycleStatus } from "@/lib/mock/types";

let rolesState: RoleRecord[] = structuredClone(mockRoles);

export async function listRoles(): Promise<RoleRecord[]> {
  return structuredClone(rolesState);
}

export async function getRole(roleId: string): Promise<RoleRecord | null> {
  return structuredClone(rolesState.find((r) => r.id === roleId) ?? null);
}

export async function createRole(input: {
  title: string;
  departmentId: string;
  departmentName: string;
  overview: string;
}): Promise<RoleRecord> {
  await mockLatency(700);
  const role: RoleRecord = {
    id: `role-${Date.now()}`,
    title: input.title.trim(),
    departmentId: input.departmentId,
    departmentName: input.departmentName,
    employeeCount: 0,
    status: "draft",
    updatedAt: new Date().toISOString().slice(0, 10),
    overview: input.overview.trim(),
    technicalSkills: [],
    behaviouralSkills: [],
    mappedEmployees: [],
    profileVersions: [],
  };
  rolesState = [role, ...rolesState];
  return structuredClone(role);
}

export async function deactivateRole(roleId: string): Promise<void> {
  await mockLatency(500);
  rolesState = rolesState.filter((r) => r.id !== roleId);
}

export async function updateRoleStatus(
  roleId: string,
  status: ProfileLifecycleStatus,
): Promise<RoleRecord | null> {
  await mockLatency(500);
  rolesState = rolesState.map((role) =>
    role.id === roleId
      ? { ...role, status, updatedAt: new Date().toISOString().slice(0, 10) }
      : role,
  );
  return getRole(roleId);
}

export async function saveProfileDraft(
  roleId: string,
  input: { title: string; overview: string; jdText?: string },
): Promise<RoleRecord | null> {
  await mockLatency(900);
  rolesState = rolesState.map((role) => {
    if (role.id !== roleId) return role;
    return {
      ...role,
      title: input.title.trim() || role.title,
      overview: input.overview.trim() || role.overview,
      status: "awaiting_review",
      updatedAt: new Date().toISOString().slice(0, 10),
      technicalSkills:
        role.technicalSkills.length > 0
          ? role.technicalSkills
          : [
              {
                skillId: "skill-cloud",
                name: "Cloud Infrastructure Design",
                levelLabel: "Advanced",
                category: "technical",
              },
            ],
      profileVersions: [
        {
          id: `v-${Date.now()}`,
          version: `V${role.profileVersions.length + 1}.0`,
          status: "awaiting_review",
          changedBy: "AI Assistant",
          changedAt: new Date().toISOString().slice(0, 10),
          summary: input.jdText
            ? "Generated from uploaded / pasted job description."
            : "Draft saved without JD attachment.",
        },
        ...role.profileVersions,
      ],
    };
  });
  return getRole(roleId);
}

export async function restoreProfileVersion(
  roleId: string,
  versionId: string,
): Promise<RoleRecord | null> {
  await mockLatency(600);
  const role = rolesState.find((r) => r.id === roleId);
  const version = role?.profileVersions.find((v) => v.id === versionId);
  if (!role || !version) return null;
  rolesState = rolesState.map((r) =>
    r.id === roleId
      ? {
          ...r,
          status: version.status,
          updatedAt: new Date().toISOString().slice(0, 10),
          profileVersions: [
            {
              ...version,
              id: `v-restore-${Date.now()}`,
              summary: `Restored from ${version.version}`,
              changedAt: new Date().toISOString().slice(0, 10),
              changedBy: "Sarah Jenkins",
            },
            ...r.profileVersions,
          ],
        }
      : r,
  );
  return getRole(roleId);
}

export const roleDepartments = [
  { id: "it", name: "Information Technology" },
  { id: "hr", name: "Human Resources" },
  { id: "finance", name: "Finance & Accounting" },
] as const;
