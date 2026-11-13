import { sleep } from "@/lib/utils";

import {
  mockDepartments,
  mockOrgChart,
  mockOrgOverview,
  mockOrgUploads,
} from "@/features/organisation/data/mock-organisation";
import type {
  Department,
  OrgChartNode,
  OrgOverviewData,
  OrgUploadRecord,
} from "@/features/organisation/types";

export async function getOrgOverview(): Promise<OrgOverviewData> {
  return mockOrgOverview;
}

export async function getDepartments(): Promise<Department[]> {
  return mockDepartments;
}

export async function getOrgChart(): Promise<OrgChartNode> {
  return mockOrgChart;
}

export async function getOrgUploads(): Promise<OrgUploadRecord[]> {
  return mockOrgUploads;
}

export async function createDepartment(input: {
  name: string;
  tag?: "core" | null;
}): Promise<Department> {
  await sleep(700);
  return {
    id: `dept-${Date.now()}`,
    name: input.name.trim(),
    tag: input.tag ?? null,
    roleCount: 0,
    teamSize: 0,
    healthPercent: 0,
    roles: [],
  };
}

export async function exportDepartments(): Promise<{ fileName: string }> {
  await sleep(600);
  return { fileName: "departments-export.csv" };
}

export async function deactivateRole(roleId: string): Promise<{ roleId: string }> {
  await sleep(500);
  return { roleId };
}

export async function uploadOrgStructure(file: File): Promise<OrgUploadRecord> {
  await sleep(1200);
  return {
    id: `up-${Date.now()}`,
    fileName: file.name,
    status: "completed",
    relativeTime: "Just now",
  };
}

export const ORG_UPLOAD_ACCEPT = ".csv,.xls,.xlsx";
export const ORG_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
