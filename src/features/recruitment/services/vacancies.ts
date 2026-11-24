/**
 * Vacancies, Hiring Manager threshold approval and public applications (sample data).
 *
 * Behaviour the backend must provide (BCMS Talent Assessment guide §8–10, §17):
 *  - Status flow: Draft → Pending Approval → Approved → Published ⇄ Paused → Closed. Invalid
 *    transitions are refused. Editing a vacancy awaiting or holding approval sends it back to
 *    Draft, so the Hiring Manager always approves exactly what is published.
 *  - A vacancy uses an approved BCMS role profile and the exact approved version of an
 *    organisation assessment. Thresholds are a simple minimum pass score per scored stage.
 *  - Only the named Hiring Manager (a Line Manager) can approve or return the thresholds; the
 *    approval is stored as a versioned snapshot that applications reference.
 *  - Publishing creates a unique public application link. Candidates apply without a login;
 *    the confirmed email they enter is their contact email. Email + vacancy is a duplicate
 *    signal that is flagged for HR, never merged.
 *  - Every record is scoped to one organisation.
 */
import { getMockOrganisation, mockUsers } from "@/config/mock-users";
import { listAssignableAssessments } from "@/features/assessment-library/services/org-library";
import { listRoleRecords } from "@/features/roles/services/mock-roles";

import type {
  AssessmentAttempt,
  InterviewSession,
  Application,
  AssessmentRef,
  OutboxEmail,
  Vacancy,
  VacancyEvent,
  VacancyStatus,
} from "../types";

export class RecruitmentError extends Error {}

export const DEFAULT_CONSENT =
  "I agree that {organisation} may process my application, CV and assessment responses to assess my suitability for this vacancy, including with AI-assisted tools reviewed by people. My data is kept for 12 months after the vacancy closes and then deleted. I can ask for a copy or deletion at any time.";

export const CV_TYPES = [".pdf", ".docx"] as const;
export const CV_MAX_BYTES = 5 * 1024 * 1024;

/* ── seed data ─────────────────────────────────────────────────────────── */

const GEC = "org-gec";
const HRBP = "Priya Nair";
const MICHAEL = { userId: "user-michael", name: "Michael Kyle" };

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const at = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

function salesInterviewRef(): AssessmentRef {
  return { assessmentId: "oa-sales-interview", version: "1.0", name: "Sales Executive – Interview Set", itemCount: 4, durationMinutes: 15 };
}

function salesRef(): AssessmentRef {
  return { assessmentId: "oa-sales-custom", version: "1.0", name: "Sales Executive – Custom", itemCount: 5, durationMinutes: 30 };
}

function seed(): {
  vacancies: Vacancy[];
  applications: Application[];
  outbox: OutboxEmail[];
  attempts: AssessmentAttempt[];
  interviews: InterviewSession[];
} {
  const base = {
    organisationId: GEC,
    consentText: DEFAULT_CONSENT,
    camera: "optional" as const,
    owner: HRBP,
    hiringManager: MICHAEL,
    publicToken: null,
    approvals: [],
  };
  const ev = (action: VacancyEvent["action"], actor: string, offset: number, note?: string): VacancyEvent => ({
    id: `${action}-${offset}`,
    action,
    actor,
    at: at(offset),
    note,
  });
  const vacancies: Vacancy[] = [
    {
      ...base,
      id: "vac-sales-exec",
      title: "Sales Executive",
      department: "Commercial",
      location: "Lagos",
      employmentType: "Full-time",
      openings: 4,
      summary: "Grow volume across a portfolio of general-trade outlets, build strong customer relationships and deliver monthly sales targets.",
      closingDate: day(8),
      roleId: "role-sales-exec",
      roleTitle: "Sales Executive",
      assessment: salesRef(),
      stages: { assessment: { enabled: true, threshold: 70 }, interview: { enabled: true, threshold: 65, questionSet: salesInterviewRef() } },
      status: "published",
      approvals: [{ version: 1, assessment: 70, interview: 65, assessmentRef: salesRef(), interviewRef: salesInterviewRef(), approvedBy: MICHAEL.name, approvedAt: at(-12) }],
      publicToken: "gec-sales-executive-7k2p",
      history: [ev("Created", HRBP, -14), ev("Sent for approval", HRBP, -13), ev("Approved", MICHAEL.name, -12), ev("Published", HRBP, -12)],
      createdAt: at(-14),
    },
    {
      ...base,
      id: "vac-kam",
      title: "Key Account Manager",
      department: "Modern Trade",
      location: "Abuja",
      employmentType: "Full-time",
      openings: 1,
      summary: "Own the relationship and joint business plan with two national supermarket chains.",
      closingDate: day(21),
      roleId: "role-kam",
      roleTitle: "Key Account Manager",
      assessment: salesRef(),
      stages: { assessment: { enabled: true, threshold: 75 }, interview: { enabled: false, threshold: null, questionSet: null } },
      status: "pending_approval",
      history: [ev("Created", HRBP, -2), ev("Sent for approval", HRBP, -1)],
      createdAt: at(-2),
    },
    {
      ...base,
      id: "vac-ops-supervisor",
      title: "Operations Supervisor",
      department: "Operations",
      location: "Ibadan",
      employmentType: "Full-time",
      openings: 2,
      summary: "Lead a production shift, keep the line safe and on plan, and solve day-to-day problems with the team.",
      closingDate: day(30),
      roleId: null,
      roleTitle: null,
      assessment: null,
      stages: { assessment: { enabled: true, threshold: null }, interview: { enabled: false, threshold: null, questionSet: null } },
      status: "draft",
      history: [ev("Created", HRBP, -1)],
      createdAt: at(-1),
    },
  ];
  const app = (n: number, fullName: string, email: string, offset: number, cvText: string | null): Application => ({
    id: `app-se-${n}`,
    reference: `GEC-SE-2611-${String(n).padStart(4, "0")}`,
    vacancyId: "vac-sales-exec",
    organisationId: GEC,
    fullName,
    email,
    phone: null,
    cv: { fileName: `${fullName.split(" ")[0]}_CV.pdf`, sizeBytes: 182_000, mimeType: "application/pdf" },
    consentText: DEFAULT_CONSENT.replace("{organisation}", "Global Enterprise Corp"),
    consentAt: at(offset),
    submittedAt: at(offset),
    stage: "new_application",
    thresholdVersion: 1,
    possibleDuplicateOf: null,
    cvText,
    cvAnalysis: null,
    extractionIssue: null,
    notes: [],
    decisions: [],
    stageHistory: [{ stage: "new_application", at: at(offset), actor: "Candidate", note: "Applied through the public link" }],
  });
  return {
    vacancies,
    applications: [
      app(1, "Adaeze Okonkwo", "adaeze.okonkwo@example.com", -6, SEED_CVS.adaeze),
      app(2, "Bola Adeyemi", "bola.adeyemi@example.com", -3, SEED_CVS.bola),
      app(3, "Chinedu Eze", "chinedu.eze@example.com", 0, null),
    ],
    outbox: [] as OutboxEmail[],
    attempts: [] as AssessmentAttempt[],
    interviews: [] as InterviewSession[],
  };
}

/** Sample CV text for the seeded candidates (Chinedu's scanned PDF had no readable text). */
const SEED_CVS = {
  adaeze: `Adaeze Okonkwo
Sales Executive, Northwind Foods, Lagos (2021 - 2026)
I negotiated annual trading terms with 40 retail outlets and grew volume by 18%.
Planned weekly outlet visits and route coverage for a territory of 120 stores.
Resolved problems with stock-outs by agreeing a weekly reorder plan with distributors.
Customer service lead for complaints from supermarket buyers.
BSc Marketing, University of Lagos, 2020`,
  bola: `Bola Adeyemi
Merchandiser, Apex Beverages, Ibadan (2023 - 2026)
Kept shelves stocked and compliant with planograms in 25 stores.
Built strong relationships with store managers and handled customer focus visits every week.
Diploma in Business Administration, 2022`,
};

/* ── store ─────────────────────────────────────────────────────────────── */

/** Bump the version when the stored shape changes, so older saved sample data is not misread. */
const STORAGE_KEY = "bcms-recruitment-v6";
let state: ReturnType<typeof seed> | null = null;
let loaded = false;
let revision = 0;
let sequence = 100;
const listeners = new Set<() => void>();

function db() {
  if (!state) state = seed();
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw) as ReturnType<typeof seed>;
    } catch {
      /* Keep the seed data when stored JSON cannot be read. */
    }
  }
  return state;
}

function save() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage unavailable: changes still apply for this page. */
  }
  revision += 1;
  listeners.forEach((listener) => listener());
}

/** Shared store access for the candidate pipeline service (same feature, same records). */
export const recruitmentStore = {
  data: () => db(),
  save: () => save(),
  nextId: (prefix: string) => nextId(prefix),
};

export function subscribeRecruitment(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function recruitmentRevision() {
  db();
  return revision;
}

/** Test helper: back to the seed data. */
export function resetRecruitment() {
  state = seed();
  loaded = true;
  revision += 1;
  listeners.forEach((listener) => listener());
}

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

function log(v: Vacancy, action: VacancyEvent["action"], actor: string, note?: string) {
  v.history.push({ id: nextId("ev"), action, actor, at: new Date().toISOString(), note });
}

/* ── queries ───────────────────────────────────────────────────────────── */

export function listVacancies(organisationId: string): Vacancy[] {
  return db()
    .vacancies.filter((v) => v.organisationId === organisationId)
    .map((v) => structuredClone(v));
}

export function getVacancy(organisationId: string, id: string): Vacancy | null {
  const found = db().vacancies.find((v) => v.id === id && v.organisationId === organisationId);
  return found ? structuredClone(found) : null;
}

export function listApplications(organisationId: string, vacancyId?: string): Application[] {
  return db()
    .applications.filter((a) => a.organisationId === organisationId && (!vacancyId || a.vacancyId === vacancyId))
    .map((a) => structuredClone(a));
}

export function listOutbox(organisationId: string, vacancyId?: string): OutboxEmail[] {
  return db()
    .outbox.filter((e) => e.organisationId === organisationId && (!vacancyId || e.vacancyId === vacancyId))
    .map((e) => ({ ...e }));
}

export function applicantCount(vacancyId: string) {
  return db().applications.filter((a) => a.vacancyId === vacancyId).length;
}

const isToday = (iso: string) => iso.slice(0, 10) === new Date().toISOString().slice(0, 10);

export function vacancyCounts(organisationId: string) {
  const list = listVacancies(organisationId);
  const soon = day(7);
  return {
    open: list.filter((v) => v.status === "published").length,
    pendingApproval: list.filter((v) => v.status === "pending_approval").length,
    applicationsToday: listApplications(organisationId).filter((a) => isToday(a.submittedAt)).length,
    closingSoon: list.filter((v) => v.status === "published" && v.closingDate <= soon).length,
  };
}

/** Line Managers in the organisation who can act as Hiring Manager. */
export function hiringManagerOptions(organisationId: string) {
  return mockUsers
    .filter((u) => u.portal === "line_manager" && u.organisationId === organisationId)
    .map((u) => ({ userId: u.id, name: u.name, jobTitle: u.jobTitle }));
}

export function approvedRoleProfiles() {
  return listRoleRecords().filter((r) => r.status === "approved" || r.status === "published");
}

export function vacanciesForHiringManager(organisationId: string, userId: string) {
  return listVacancies(organisationId).filter((v) => v.hiringManager?.userId === userId);
}

export function publicApplyPath(token: string) {
  return `/apply/${token}`;
}

export function latestApproval(v: Vacancy) {
  return v.approvals[v.approvals.length - 1] ?? null;
}

/** Problems that stop a vacancy being sent for approval or published. */
export function vacancyProblems(v: Vacancy): string[] {
  const problems: string[] = [];
  if (!v.title.trim()) problems.push("Enter a vacancy title.");
  if (!v.department.trim()) problems.push("Enter the department.");
  if (!v.location.trim()) problems.push("Enter the location.");
  if (!v.summary.trim()) problems.push("Write a job summary for candidates.");
  if (!Number.isInteger(v.openings) || v.openings < 1) problems.push("Number of openings must be at least 1.");
  if (!v.closingDate || v.closingDate < day(0)) problems.push("Set a closing date in the future.");
  if (!v.roleId) problems.push("Select an approved BCMS role profile.");
  else if (!approvedRoleProfiles().some((r) => r.id === v.roleId)) problems.push("The selected role profile is no longer approved.");
  if (!v.hiringManager) problems.push("Choose the Hiring Manager who approves the thresholds.");
  if (!v.consentText.trim()) problems.push("Add the consent and privacy wording candidates agree to.");
  if (v.stages.assessment.enabled) {
    if (!v.assessment) problems.push("Assign an approved assessment version.");
    else if (!assessmentStillAssignable(v.organisationId, v.assessment)) {
      problems.push(`${v.assessment.name} v${v.assessment.version} is no longer approved and active.`);
    }
    if (!validThreshold(v.stages.assessment.threshold)) problems.push("Set the assessment pass threshold (1–100%).");
  }
  if (v.stages.interview.enabled) {
    const set = v.stages.interview.questionSet;
    if (!set) problems.push("Choose the approved interview question set.");
    else if (!interviewSetOptions(v.organisationId).some((o) => o.assessmentId === set.assessmentId && o.version === set.version)) {
      problems.push(`${set.name} v${set.version} is no longer an approved interview question set.`);
    }
    if (!validThreshold(v.stages.interview.threshold)) problems.push("Set the AI-avatar interview pass threshold (1–100%).");
  }
  return problems;
}

function validThreshold(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 1 && value <= 100;
}

function assessmentStillAssignable(organisationId: string, ref: AssessmentRef) {
  return listAssignableAssessments(organisationId).some(
    (a) => a.assessmentId === ref.assessmentId && a.version.version === ref.version,
  );
}

/** Approved, active organisation assessments, as references a vacancy can store. */
export function assessmentOptions(organisationId: string): AssessmentRef[] {
  return listAssignableAssessments(organisationId).map((a) => ({
    assessmentId: a.assessmentId,
    version: a.version.version,
    name: a.version.name,
    itemCount: a.version.items.length,
    durationMinutes: a.version.durationMinutes,
  }));
}

/**
 * Approved organisation assessments usable as an interview question set: written questions with
 * rubrics only (the avatar asks them aloud; answers are spoken or typed).
 */
export function interviewSetOptions(organisationId: string): AssessmentRef[] {
  return listAssignableAssessments(organisationId)
    .filter((a) => a.version.items.length > 0 && a.version.items.every((i) => i.responseType === "case_response"))
    .map((a) => ({
      assessmentId: a.assessmentId,
      version: a.version.version,
      name: a.version.name,
      itemCount: a.version.items.length,
      durationMinutes: a.version.durationMinutes,
    }));
}

/* ── commands ──────────────────────────────────────────────────────────── */

function mutate(organisationId: string, id: string, fn: (v: Vacancy) => void) {
  const v = db().vacancies.find((x) => x.id === id && x.organisationId === organisationId);
  if (!v) throw new RecruitmentError("Vacancy not found in your organisation.");
  fn(v);
  save();
}

function requireStatus(v: Vacancy, allowed: VacancyStatus[], message: string) {
  if (!allowed.includes(v.status)) throw new RecruitmentError(message);
}

export type VacancyDetails = Pick<
  Vacancy,
  | "title"
  | "department"
  | "location"
  | "employmentType"
  | "openings"
  | "summary"
  | "closingDate"
  | "roleId"
  | "assessment"
  | "stages"
  | "camera"
  | "consentText"
  | "hiringManager"
>;

export function emptyDetails(): VacancyDetails {
  return {
    title: "",
    department: "",
    location: "",
    employmentType: "Full-time",
    openings: 1,
    summary: "",
    closingDate: day(28),
    roleId: null,
    assessment: null,
    stages: { assessment: { enabled: true, threshold: 70 }, interview: { enabled: false, threshold: null, questionSet: null } },
    camera: "off",
    consentText: DEFAULT_CONSENT,
    hiringManager: null,
  };
}

function applyDetails(v: Vacancy, details: VacancyDetails) {
  const role = details.roleId ? listRoleRecords().find((r) => r.id === details.roleId) ?? null : null;
  Object.assign(v, structuredClone(details), { roleTitle: role?.title ?? null });
}

export function createVacancy(organisationId: string, details: VacancyDetails, actor: string): string {
  if (!details.title.trim()) throw new RecruitmentError("Enter a vacancy title.");
  const v: Vacancy = {
    id: nextId("vac"),
    organisationId,
    title: "",
    department: "",
    location: "",
    employmentType: "Full-time",
    openings: 1,
    summary: "",
    closingDate: "",
    roleId: null,
    roleTitle: null,
    assessment: null,
    stages: emptyDetails().stages,
    camera: "off",
    consentText: DEFAULT_CONSENT,
    hiringManager: null,
    owner: actor,
    status: "draft",
    approvals: [],
    publicToken: null,
    history: [],
    createdAt: new Date().toISOString(),
  };
  applyDetails(v, details);
  log(v, "Created", actor);
  db().vacancies.push(v);
  save();
  return v.id;
}

/** Saves changes. A vacancy awaiting or holding approval returns to Draft (approval must be redone). */
export function updateVacancy(organisationId: string, id: string, details: VacancyDetails, actor: string) {
  mutate(organisationId, id, (v) => {
    requireStatus(v, ["draft", "pending_approval", "approved"], "A published, paused or closed vacancy cannot be edited.");
    const reset = v.status !== "draft";
    applyDetails(v, details);
    v.status = "draft";
    log(v, "Edited", actor, reset ? "Changes need the Hiring Manager's approval again." : undefined);
  });
}

export function sendForApproval(organisationId: string, id: string, actor: string) {
  mutate(organisationId, id, (v) => {
    requireStatus(v, ["draft"], "Only a draft vacancy can be sent for approval.");
    const problems = vacancyProblems(v);
    if (problems.length) throw new RecruitmentError(problems[0]!);
    v.status = "pending_approval";
    log(v, "Sent for approval", actor, `To ${v.hiringManager?.name}`);
  });
}

function requireHiringManager(v: Vacancy, approver: { userId: string }) {
  if (v.hiringManager?.userId !== approver.userId) {
    throw new RecruitmentError("Only the vacancy's Hiring Manager can approve or return it.");
  }
  requireStatus(v, ["pending_approval"], "This vacancy is not waiting for approval.");
}

/** Hiring Manager approves the thresholds; the snapshot is stored as the next version. */
export function approveVacancy(organisationId: string, id: string, approver: { userId: string; name: string }) {
  mutate(organisationId, id, (v) => {
    requireHiringManager(v, approver);
    const problems = vacancyProblems(v);
    if (problems.length) throw new RecruitmentError(problems[0]!);
    v.approvals.push({
      version: v.approvals.length + 1,
      assessment: v.stages.assessment.enabled ? v.stages.assessment.threshold : null,
      interview: v.stages.interview.enabled ? v.stages.interview.threshold : null,
      assessmentRef: v.stages.assessment.enabled ? structuredClone(v.assessment) : null,
      interviewRef: v.stages.interview.enabled ? structuredClone(v.stages.interview.questionSet) : null,
      approvedBy: approver.name,
      approvedAt: new Date().toISOString(),
    });
    v.status = "approved";
    log(v, "Approved", approver.name, `Threshold snapshot v${v.approvals.length}`);
  });
}

export function returnVacancy(organisationId: string, id: string, approver: { userId: string; name: string }, comment: string) {
  mutate(organisationId, id, (v) => {
    requireHiringManager(v, approver);
    if (!comment.trim()) throw new RecruitmentError("Say what needs to change.");
    v.status = "draft";
    log(v, "Returned for changes", approver.name, comment.trim());
  });
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

export function publishVacancy(organisationId: string, id: string, actor: string): string {
  let token = "";
  mutate(organisationId, id, (v) => {
    requireStatus(v, ["approved"], "Only a vacancy approved by the Hiring Manager can be published.");
    const problems = vacancyProblems(v);
    if (problems.length) throw new RecruitmentError(problems[0]!);
    const org = getMockOrganisation(organisationId);
    token = v.publicToken ?? `${org.shortName.toLowerCase()}-${slug(v.title)}-${Math.random().toString(36).slice(2, 6)}`;
    v.publicToken = token;
    v.status = "published";
    log(v, "Published", actor);
  });
  return token;
}

export function pauseVacancy(organisationId: string, id: string, actor: string) {
  mutate(organisationId, id, (v) => {
    requireStatus(v, ["published"], "Only a published vacancy can be paused.");
    v.status = "paused";
    log(v, "Paused", actor);
  });
}

export function resumeVacancy(organisationId: string, id: string, actor: string) {
  mutate(organisationId, id, (v) => {
    requireStatus(v, ["paused"], "Only a paused vacancy can be resumed.");
    v.status = "published";
    log(v, "Resumed", actor);
  });
}

export function closeVacancy(organisationId: string, id: string, actor: string, reason: string) {
  mutate(organisationId, id, (v) => {
    requireStatus(v, ["published", "paused", "draft", "approved"], "This vacancy is already closed or awaiting approval.");
    if (!reason.trim()) throw new RecruitmentError("Give a reason for closing the vacancy.");
    v.status = "closed";
    log(v, "Closed", actor, reason.trim());
  });
}

/* ── public application (no login) ─────────────────────────────────────── */

export type PublicVacancy = {
  organisationName: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  summary: string;
  closingDate: string;
  consentText: string;
  /** Why applications are not open, if they are not. */
  closedReason: string | null;
};

/** What a candidate may see for a public link. Internal details (thresholds, assessment) are never exposed. */
export function getPublicVacancy(token: string): PublicVacancy | null {
  const v = db().vacancies.find((x) => x.publicToken === token);
  if (!v) return null;
  const organisationName = getMockOrganisation(v.organisationId).name;
  const closedReason =
    v.status === "closed"
      ? "This vacancy is closed."
      : v.status === "paused"
        ? "Applications for this vacancy are paused. Please check back later."
        : v.status !== "published"
          ? "This vacancy is not open for applications."
          : v.closingDate < day(0)
            ? "The closing date for this vacancy has passed."
            : null;
  return {
    organisationName,
    title: v.title,
    department: v.department,
    location: v.location,
    employmentType: v.employmentType,
    summary: v.summary,
    closingDate: v.closingDate,
    consentText: v.consentText.replace("{organisation}", organisationName),
    closedReason,
  };
}

export type ApplicationInput = {
  fullName: string;
  email: string;
  confirmEmail: string;
  phone: string;
  cv: { fileName: string; sizeBytes: number; mimeType: string } | null;
  consent: boolean;
  /** Text read from the CV in the browser (null when it could not be read, e.g. a scanned PDF). */
  cvText?: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field-level validation messages for the public form (empty when valid). */
export function validateApplication(input: ApplicationInput): Partial<Record<keyof ApplicationInput, string>> {
  const errors: Partial<Record<keyof ApplicationInput, string>> = {};
  if (input.fullName.trim().length < 2) errors.fullName = "Enter your full name.";
  if (!EMAIL.test(input.email.trim())) errors.email = "Enter a valid email address.";
  if (input.confirmEmail.trim().toLowerCase() !== input.email.trim().toLowerCase()) {
    errors.confirmEmail = "The email addresses do not match.";
  }
  if (input.phone.trim() && !/^[+\d][\d\s()-]{6,19}$/.test(input.phone.trim())) errors.phone = "Enter a valid phone number or leave it blank.";
  if (!input.cv) errors.cv = "Upload your CV (PDF or DOCX).";
  else if (!CV_TYPES.some((ext) => input.cv!.fileName.toLowerCase().endsWith(ext))) errors.cv = "Your CV must be a PDF or DOCX file.";
  else if (input.cv.sizeBytes > CV_MAX_BYTES) errors.cv = "Your CV must be 5 MB or smaller.";
  else if (input.cv.sizeBytes === 0) errors.cv = "The CV file is empty.";
  if (!input.consent) errors.consent = "You must agree before submitting your application.";
  return errors;
}

function initials(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3);
}

export function submitApplication(token: string, input: ApplicationInput): { reference: string; applicationId: string } {
  const data = db();
  const v = data.vacancies.find((x) => x.publicToken === token);
  if (!v) throw new RecruitmentError("This application link is not valid.");
  const publicView = getPublicVacancy(token)!;
  if (publicView.closedReason) throw new RecruitmentError(publicView.closedReason);
  const errors = validateApplication(input);
  const first = Object.values(errors)[0];
  if (first) throw new RecruitmentError(first);
  const approval = latestApproval(v);
  if (!approval) throw new RecruitmentError("This vacancy is not open for applications.");

  const email = input.email.trim().toLowerCase();
  const existing = data.applications.find((a) => a.vacancyId === v.id && a.email === email);
  const org = getMockOrganisation(v.organisationId);
  const count = data.applications.filter((a) => a.vacancyId === v.id).length + 1;
  const now = new Date();
  const reference = `${org.shortName}-${initials(v.title)}-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}-${String(count).padStart(4, "0")}`;
  const application: Application = {
    id: nextId("app"),
    reference,
    vacancyId: v.id,
    organisationId: v.organisationId,
    fullName: input.fullName.trim(),
    email,
    phone: input.phone.trim() || null,
    cv: { ...input.cv! },
    consentText: publicView.consentText,
    consentAt: now.toISOString(),
    submittedAt: now.toISOString(),
    stage: "new_application",
    thresholdVersion: approval.version,
    possibleDuplicateOf: existing?.id ?? null,
    cvText: input.cvText?.trim() ? input.cvText.trim().slice(0, 60_000) : null,
    cvAnalysis: null,
    extractionIssue: null,
    notes: [],
    decisions: [],
    stageHistory: [{ stage: "new_application", at: now.toISOString(), actor: "Candidate", note: "Applied through the public link" }],
  };
  data.applications.push(application);
  data.outbox.push({
    id: nextId("mail"),
    organisationId: v.organisationId,
    vacancyId: v.id,
    applicationId: application.id,
    to: email,
    subject: `Application received: ${v.title} (${reference})`,
    body: `Dear ${application.fullName},\n\nThank you for applying for ${v.title} at ${org.name}. Your application reference is ${reference}. We will email you about the next steps.\n\n${org.name} Recruitment`,
    kind: "application_confirmation",
    at: now.toISOString(),
  });
  save();
  return { reference, applicationId: application.id };
}
