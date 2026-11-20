/**
 * Organisation Admin role insights (mock, development only): role structure details, skills
 * profile coverage and the employees counted for each role. Replace with backend data when
 * the roles/workforce APIs are available.
 */

export type RoleDetails = {
  reportsTo: string;
  directReports: string[];
  grade: string;
  location: string;
  employmentType: string;
  roleOwner: string;
};

/** Skills profile coverage: required skills with an approved definition, out of all required skills. */
export type SkillCoverage = { approved: number; required: number };

export type RosterEntry = {
  name: string;
  employeeCode: string;
  /** Present when the employee has a profile page in the Employee Directory. */
  employeeId?: string;
  mapping: "aligned" | "pending";
};

export type UnmappedEmployee = {
  name: string;
  employeeCode: string;
  employeeId?: string;
  reason: string;
};

export const roleDetails: Record<string, RoleDetails> = {
  "role-ssa": {
    reportsTo: "Head of Architecture",
    directReports: ["Solutions Architect", "Cloud Engineer"],
    grade: "Grade 7 · Senior Professional",
    location: "Lagos (Hybrid)",
    employmentType: "Full-time, permanent",
    roleOwner: "Michael Kyle, IT Infrastructure Manager",
  },
  "role-lde": {
    reportsTo: "Head of Data & Analytics",
    directReports: ["Data Engineer"],
    grade: "Grade 6 · Lead Professional",
    location: "Lagos (Hybrid)",
    employmentType: "Full-time, permanent",
    roleOwner: "Michael Kyle, IT Infrastructure Manager",
  },
  "role-eng-lead": {
    reportsTo: "Chief Technology Officer",
    directReports: ["Senior Software Engineer", "Software Engineer"],
    grade: "Grade 7 · Senior Professional",
    location: "Lagos",
    employmentType: "Full-time, permanent",
    roleOwner: "Chief Technology Officer",
  },
  "role-cyber": {
    reportsTo: "Information Security Manager",
    directReports: [],
    grade: "Grade 5 · Professional",
    location: "Abuja",
    employmentType: "Full-time, permanent",
    roleOwner: "Information Security Manager",
  },
  "role-fc": {
    reportsTo: "Chief Financial Officer",
    directReports: ["Financial Accountant", "Management Accountant"],
    grade: "Grade 7 · Senior Professional",
    location: "Lagos",
    employmentType: "Full-time, permanent",
    roleOwner: "Chief Financial Officer",
  },
  "role-hrbp": {
    reportsTo: "HR Director",
    directReports: ["HR Officer"],
    grade: "Grade 6 · Lead Professional",
    location: "Lagos (Hybrid)",
    employmentType: "Full-time, permanent",
    roleOwner: "HR Director",
  },
};

export const skillCoverage: Record<string, SkillCoverage> = {
  "role-ssa": { approved: 18, required: 18 },
  "role-lde": { approved: 12, required: 18 },
  "role-eng-lead": { approved: 12, required: 12 },
  "role-cyber": { approved: 6, required: 14 },
  "role-fc": { approved: 9, required: 9 },
  "role-hrbp": { approved: 0, required: 10 },
};

/** Employees counted in each role's Employee Count (lengths match the directory counts). */
export const roleRoster: Record<string, RosterEntry[]> = {
  "role-ssa": [
    { name: "James Miller", employeeCode: "EMP-8721", employeeId: "emp-8721", mapping: "aligned" },
    { name: "Elena Rodriguez", employeeCode: "EMP-7710", employeeId: "emp-7710", mapping: "aligned" },
    { name: "Chidi Okafor", employeeCode: "EMP-6120", mapping: "aligned" },
    { name: "Grace Adeyemi", employeeCode: "EMP-6134", mapping: "aligned" },
    { name: "Daniel Mensah", employeeCode: "EMP-6201", mapping: "aligned" },
    { name: "Fatima Bello", employeeCode: "EMP-6255", mapping: "aligned" },
    { name: "Samuel Eze", employeeCode: "EMP-6302", mapping: "pending" },
    { name: "Ngozi Uche", employeeCode: "EMP-6347", mapping: "aligned" },
  ],
  "role-lde": [
    { name: "Robert Chen", employeeCode: "EMP-9042", employeeId: "emp-9042", mapping: "pending" },
    { name: "Kemi Lawal", employeeCode: "EMP-7015", mapping: "aligned" },
    { name: "Ibrahim Musa", employeeCode: "EMP-7022", mapping: "aligned" },
    { name: "Ada Nwosu", employeeCode: "EMP-7040", mapping: "aligned" },
  ],
  "role-eng-lead": [
    { name: "Tunde Bakare", employeeCode: "EMP-5101", mapping: "aligned" },
    { name: "Zainab Yusuf", employeeCode: "EMP-5117", mapping: "aligned" },
    { name: "Peter Obi-Ade", employeeCode: "EMP-5130", mapping: "pending" },
  ],
  "role-cyber": [
    { name: "Aisha Khan", employeeCode: "EMP-4408", employeeId: "emp-4408", mapping: "aligned" },
    { name: "Emeka Nnadi", employeeCode: "EMP-4412", mapping: "aligned" },
    { name: "Bola Akin", employeeCode: "EMP-4420", mapping: "aligned" },
    { name: "Yemi Ogun", employeeCode: "EMP-4433", mapping: "pending" },
    { name: "Halima Sani", employeeCode: "EMP-4441", mapping: "aligned" },
  ],
  "role-fc": [
    { name: "Olu Adebayo", employeeCode: "EMP-3301", mapping: "aligned" },
    { name: "Mary Johnson", employeeCode: "EMP-3318", mapping: "aligned" },
  ],
  "role-hrbp": [
    { name: "Priya Shah", employeeCode: "EMP-6612", employeeId: "emp-6612", mapping: "pending" },
    { name: "Funke Alade", employeeCode: "EMP-2201", mapping: "aligned" },
    { name: "Kunle Ojo", employeeCode: "EMP-2214", mapping: "aligned" },
    { name: "Amaka Obi", employeeCode: "EMP-2230", mapping: "aligned" },
    { name: "Segun Ade", employeeCode: "EMP-2245", mapping: "aligned" },
    { name: "Ruth Danjuma", employeeCode: "EMP-2251", mapping: "aligned" },
  ],
};

/** Employees in each department not yet mapped to any role: possibly missing from role counts. */
export const departmentUnmapped: Record<string, UnmappedEmployee[]> = {
  it: [
    { name: "Victor Ikenna", employeeCode: "EMP-6410", reason: "No role assigned after import" },
    { name: "Joy Etim", employeeCode: "EMP-6422", reason: "Job title did not match a defined role" },
  ],
  finance: [{ name: "Tom Nguyen", employeeCode: "EMP-5501", employeeId: "emp-5501", reason: "No role assigned" }],
  hr: [],
};
