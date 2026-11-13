import {
  mockEmployeeImports,
  mockEmployeeMetrics,
  mockEmployees,
} from "@/features/employees/data/mock-employees";
import type {
  EmployeeDirectoryMetrics,
  EmployeeImportRecord,
  EmployeeRecord,
} from "@/features/employees/types";
import { mockLatency } from "@/lib/mock/delay";

let employeesState = structuredClone(mockEmployees);
let importsState = structuredClone(mockEmployeeImports);

export async function listEmployees(): Promise<EmployeeRecord[]> {
  return structuredClone(employeesState);
}

export async function getEmployeeDirectoryMetrics(): Promise<EmployeeDirectoryMetrics> {
  return structuredClone(mockEmployeeMetrics);
}

export async function getEmployee(
  employeeId: string,
): Promise<EmployeeRecord | null> {
  return structuredClone(
    employeesState.find((e) => e.id === employeeId) ?? null,
  );
}

export async function bulkMarkAssessmentReady(
  employeeIds: string[],
): Promise<number> {
  await mockLatency(700);
  let count = 0;
  employeesState = employeesState.map((employee) => {
    if (!employeeIds.includes(employee.id)) return employee;
    count += 1;
    return { ...employee, assessmentReady: true };
  });
  return count;
}

export async function bulkAssignRole(
  employeeIds: string[],
  roleId: string,
  roleTitle: string,
): Promise<number> {
  await mockLatency(800);
  let count = 0;
  employeesState = employeesState.map((employee) => {
    if (!employeeIds.includes(employee.id)) return employee;
    count += 1;
    return {
      ...employee,
      roleId,
      roleTitle,
      mappingStatus: "aligned",
      profileVersion: employee.profileVersion ?? "V1.0 (Draft)",
    };
  });
  return count;
}

export async function updateEmployeeProfileVersion(
  employeeId: string,
  profileVersion: string,
): Promise<EmployeeRecord | null> {
  await mockLatency(500);
  let updated: EmployeeRecord | null = null;
  employeesState = employeesState.map((employee) => {
    if (employee.id !== employeeId) return employee;
    updated = {
      ...employee,
      profileVersion,
      mappingStatus: "aligned",
    };
    return updated;
  });
  return updated ? structuredClone(updated) : null;
}

export async function listEmployeeImports(): Promise<EmployeeImportRecord[]> {
  return structuredClone(importsState);
}

export async function uploadEmployees(file: File): Promise<EmployeeImportRecord> {
  await mockLatency(1100);
  const record: EmployeeImportRecord = {
    id: `imp-${Date.now()}`,
    fileName: file.name,
    status: "completed",
    relativeTime: "Just now",
  };
  importsState = [record, ...importsState];
  return structuredClone(record);
}
