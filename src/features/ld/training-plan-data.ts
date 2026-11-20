/**
 * Training Plan (mock, development only): what each employee will learn to close their
 * identified skill gaps. Replace with the development-plan API when available.
 */

export type TrainingStatus = "Planned" | "In Progress" | "Completed" | "Overdue";
export type LearningFormat = "E-Learning" | "Workshop" | "AI Coaching" | "Workplace Practice" | "Classroom";

export type TrainingPlanRow = {
  id: string;
  employeeName: string;
  employeeId: string;
  department: string;
  jobRole: string;
  skillGap: string;
  requiredProficiency: number;
  currentProficiency: number;
  /** null when no intervention has been allocated yet. */
  intervention: string | null;
  format: LearningFormat | null;
  provider: string | null;
  startDate: string | null;
  completionDate: string | null;
  status: TrainingStatus | null;
};

export const trainingPlanRows: TrainingPlanRow[] = [
  {
    id: "tp-1",
    employeeName: "James Miller",
    employeeId: "EMP-8721",
    department: "IT Infrastructure",
    jobRole: "Senior Solutions Architect",
    skillGap: "Microservices",
    requiredProficiency: 4,
    currentProficiency: 2,
    intervention: "Microservices Architecture Pathway",
    format: "E-Learning",
    provider: "Coursera (external)",
    startDate: "2027-01-11",
    completionDate: "2027-03-26",
    status: "Planned",
  },
  {
    id: "tp-2",
    employeeName: "James Miller",
    employeeId: "EMP-8721",
    department: "IT Infrastructure",
    jobRole: "Senior Solutions Architect",
    skillGap: "Advanced AI Governance",
    requiredProficiency: 4,
    currentProficiency: 2,
    intervention: "Advanced AI Governance 2024",
    format: "E-Learning",
    provider: "Coursera (external)",
    startDate: "2026-10-01",
    completionDate: "2026-11-15",
    status: "Overdue",
  },
  {
    id: "tp-3",
    employeeName: "Aisha Khan",
    employeeId: "EMP-4408",
    department: "Cyber Security",
    jobRole: "Cyber Security Analyst",
    skillGap: "Cyber Security",
    requiredProficiency: 4,
    currentProficiency: 3,
    intervention: "AI Governance Stakeholder Simulation",
    format: "AI Coaching",
    provider: "BCMS AI Coach (internal)",
    startDate: "2027-01-18",
    completionDate: "2027-02-12",
    status: "Planned",
  },
  {
    id: "tp-4",
    employeeName: "Robert Chen",
    employeeId: "EMP-9042",
    department: "IT Infrastructure",
    jobRole: "Lead Data Engineer",
    skillGap: "Data Engineering",
    requiredProficiency: 4,
    currentProficiency: 3,
    intervention: "Strategic Influence Masterclass",
    format: "Workshop",
    provider: "Internal L&D",
    startDate: "2027-04-06",
    completionDate: "2027-04-07",
    status: "Planned",
  },
  {
    id: "tp-5",
    employeeName: "Elena Rodriguez",
    employeeId: "EMP-7710",
    department: "IT Infrastructure",
    jobRole: "Senior Solutions Architect",
    skillGap: "Cloud Architecture",
    requiredProficiency: 4,
    currentProficiency: 3,
    intervention: "Cloud Migration Mentoring",
    format: "Workplace Practice",
    provider: "Internal (mentor: James Miller)",
    startDate: "2026-09-01",
    completionDate: "2026-12-18",
    status: "In Progress",
  },
  {
    id: "tp-6",
    employeeName: "Priya Shah",
    employeeId: "EMP-6612",
    department: "Human Resources",
    jobRole: "HR Business Partner",
    skillGap: "Workforce Planning",
    requiredProficiency: 3,
    currentProficiency: 2,
    intervention: "Workforce Planning Fundamentals",
    format: "Classroom",
    provider: "CIPD (external)",
    startDate: "2026-06-02",
    completionDate: "2026-06-04",
    status: "Completed",
  },
  {
    id: "tp-7",
    employeeName: "Tom Nguyen",
    employeeId: "EMP-5501",
    department: "Finance & Accounting",
    jobRole: "Financial Controller",
    skillGap: "Data Storytelling",
    requiredProficiency: 3,
    currentProficiency: 1,
    intervention: null,
    format: null,
    provider: null,
    startDate: null,
    completionDate: null,
    status: null,
  },
];

/** Column definitions shared by the table and the Excel export (in the agreed order). */
export const TRAINING_PLAN_COLUMNS: { header: string; width: number; value: (r: TrainingPlanRow) => string | number }[] = [
  { header: "Employee Name", width: 22, value: (r) => r.employeeName },
  { header: "Employee ID", width: 14, value: (r) => r.employeeId },
  { header: "Department", width: 22, value: (r) => r.department },
  { header: "Job Role", width: 28, value: (r) => r.jobRole },
  { header: "Identified Skill Gap", width: 26, value: (r) => r.skillGap },
  { header: "Required Proficiency", width: 12, value: (r) => r.requiredProficiency },
  { header: "Current Proficiency", width: 12, value: (r) => r.currentProficiency },
  { header: "Development Intervention", width: 36, value: (r) => r.intervention ?? "Awaiting allocation" },
  { header: "Learning Format", width: 18, value: (r) => r.format ?? "" },
  { header: "Training Provider", width: 28, value: (r) => r.provider ?? "" },
  { header: "Start Date", width: 12, value: (r) => r.startDate ?? "" },
  { header: "Completion Date", width: 14, value: (r) => r.completionDate ?? "" },
  { header: "Status", width: 14, value: (r) => r.status ?? "Awaiting allocation" },
];
