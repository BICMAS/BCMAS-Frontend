/**
 * Employee capability assessment: cycles, self-assessment, evidence, verification and results
 * (sample data). One store drives the employee, manager and admin screens.
 *
 * Behaviour the backend must provide (methodology):
 *  - Organisation Admins create, activate and close cycles. HRBPs view only.
 *  - Only employees with an approved mapping to an approved role profile are assessed. The profile
 *    is copied when the cycle is activated, so later profile changes do not alter a live assessment.
 *  - Employees rate every skill, add evidence and submit once. Self-ratings never become results.
 *  - Self-assessment closes at the end of the cycle's last day, unless an extension is agreed.
 *    Decisions after the verification deadline are accepted and flagged late.
 *  - Only the assigned reviewer decides, with feedback every time. Verified records the required level
 *    or a higher one the evidence supports;
 *    Not verified records the lower level the evidence supports; More evidence returns the skill.
 *  - Results stay hidden until every skill has a decision, calibration is recorded and an
 *    Organisation Admin releases them.
 *  - Within 10 working days an employee may disagree; a different reviewer looks again.
 *  - Every action is logged.
 */
import { mockUsers } from "@/config/mock-users";
import { mockEmployees } from "@/features/employees/data/mock-employees";
import { buildSchedule, ORGANISATION_SCOPE, type CyclesPerYear } from "@/features/ld/assessment-schedule";
import { listRoleRecords, roleDepartments } from "@/features/roles/services/mock-roles";
import { isEssentialSkill } from "@/features/roles/services/essential-skills";
import type { RoleRecord } from "@/features/roles/types";
import { frameworkLevels, skillLevelDescription } from "@/features/skills/services/mock-skills";
import type { MockUser } from "@/types/user";

import type {
  AssessmentItem,
  AssessmentStage,
  CapabilityAssessment,
  CapabilityCycle,
  Verification,
  VerificationDecision,
} from "../types";
import { capabilityMatch, disagreeBy, gapOf, isRecent, verifiedLevel } from "./scoring";

export class CapabilityError extends Error {}

type Person = Pick<MockUser, "id" | "name" | "email" | "portal" | "organisationId">;

const GEC = "org-gec";
const MICHAEL = { userId: "user-michael", name: "Michael Kyle" };
const ADMIN = "Sarah Jenkins";
/** Behavioural skills in a role profile have no level, so the independent level applies. */
export const DEFAULT_REQUIRED_LEVEL = 3;

const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();
/** Local calendar day, so a deadline runs to the end of that day. */
const today = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ── scale ─────────────────────────────────────────────────────────────── */

export function levelLabel(level: number | null): string {
  if (level === null) return "Not verified";
  if (level === 0) return "Below Level 1";
  const found = frameworkLevels().find((l) => l.rank === level);
  return found ? `Level ${level} – ${found.label}` : `Level ${level}`;
}

function rankOf(label: string) {
  return frameworkLevels().find((l) => l.label.toLowerCase() === label.trim().toLowerCase())?.rank ?? DEFAULT_REQUIRED_LEVEL;
}

/** The skill's own description of a level, or the framework's when the skill has none. */
export function levelDescription(skillId: string, level: number) {
  return skillLevelDescription(skillId, level) ?? frameworkLevels().find((l) => l.rank === level)?.description ?? "";
}

function itemsFor(role: RoleRecord): AssessmentItem[] {
  const base = { essential: false, self: null, evidence: [], verification: null, disagreement: null };
  return [
    ...role.technicalSkills.map((s) => ({
      ...structuredClone(base),
      skillId: s.skillId,
      name: s.name,
      category: "technical" as const,
      required: rankOf(s.levelLabel),
      essential: isEssentialSkill(role.id, s.name),
    })),
    ...role.behaviouralSkills.map((name) => ({
      ...structuredClone(base),
      skillId: `beh-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      category: "behavioural" as const,
      essential: isEssentialSkill(role.id, name),
      required: DEFAULT_REQUIRED_LEVEL,
    })),
  ];
}

/* ── seed and store ────────────────────────────────────────────────────── */

type State = { cycles: CapabilityCycle[]; assessments: CapabilityAssessment[] };

function makeAssessment(cycleId: string, employeeId: string): CapabilityAssessment {
  const e = mockEmployees.find((x) => x.id === employeeId)!;
  const role = listRoleRecords().find((r) => r.id === e.roleId)!;
  return {
    id: `${cycleId}-${e.id}`,
    cycleId,
    organisationId: GEC,
    employeeId: e.id,
    employeeName: e.name,
    employeeEmail: e.email,
    department: e.departmentName,
    roleId: role.id,
    roleTitle: role.title,
    profileVersion: role.profileVersions[0]?.version ?? "V1.0",
    reviewer: { ...MICHAEL },
    items: itemsFor(role),
    submittedAt: null,
    extension: null,
    releasedAt: null,
    adjustments: [],
    events: [{ at: iso(-20), actor: "System", action: "Assessment opened", detail: role.title }],
  };
}

function seed(): State {
  const year = new Date().getFullYear();
  const cycle = (id: string, number: number, over: Partial<CapabilityCycle>): CapabilityCycle => {
    const w = buildSchedule(2, year)[number - 1]!;
    return {
      id,
      organisationId: GEC,
      name: `${year} H${number} Capability Review`,
      scope: ORGANISATION_SCOPE,
      year,
      cyclesPerYear: 2,
      number,
      period: w.period,
      verificationDeadline: w.verificationDeadline,
      status: "active",
      startsOn: today(-20),
      endsOn: today(12),
      verifyBy: today(26),
      createdBy: ADMIN,
      calibration: null,
      excluded: [
        { name: "Robert Chen", reason: "Role mapping is not approved" },
        { name: "Priya Shah", reason: "Role mapping is not approved" },
        { name: "Tom Nguyen", reason: "Not mapped to a role" },
        { name: "Aisha Khan", reason: "Role profile is not approved" },
      ],
      ...over,
    };
  };
  const previous = makeAssessment("cycle-h1", "emp-8721");
  const levels = [4, 3, 4, 4, 3, 3, 3, 2];
  previous.items.forEach((item, i) => {
    const level = levels[i]!;
    item.self = Math.min(5, level + (i === 1 ? 1 : 0));
    item.verification = {
      decision: level >= item.required ? "verified" : "not_verified",
      level,
      late: false,
      feedback: level >= item.required ? "Clear evidence of the required standard." : "Good progress. Show this in a second, independent piece of work.",
      by: MICHAEL.name,
      byUserId: MICHAEL.userId,
      at: iso(-150),
    };
  });
  previous.submittedAt = iso(-160);
  previous.releasedAt = iso(-140);
  previous.events.push(
    { at: iso(-160), actor: "James Miller", action: "Self-assessment submitted", detail: "8 skills" },
    { at: iso(-140), actor: ADMIN, action: "Results released", detail: "Calibration recorded" },
  );

  const james = makeAssessment("cycle-h2", "emp-8721");
  james.items[0]!.self = 4;
  james.items[0]!.evidence.push({
    id: "ev-james-1",
    title: "Payment gateway migration",
    fileNames: ["PaymentGateway_Arch_V2.pdf"],
    notes: "I led the migration of the core payment gateway to Azure. The diagram shows the multi-region design I defined.",
    workDate: today(-60),
    addedAt: iso(-10),
  });
  james.items[2]!.self = 3;

  const elena = makeAssessment("cycle-h2", "emp-7710");
  elena.items.forEach((item, i) => {
    item.self = [4, 4, 4, 3, 3, 2, 3, 3][i]!;
    if (i !== 3) {
      item.evidence.push({
        id: `ev-elena-${i}`,
        title: `${item.name} – project example`,
        fileNames: [`${item.name.replace(/[^A-Za-z]+/g, "_")}.pdf`],
        notes: "From the data platform rebuild.",
        workDate: today(i === 1 ? -500 : -45),
        addedAt: iso(-6),
      });
    }
  });
  elena.submittedAt = iso(-4);
  elena.events.push({ at: iso(-4), actor: "Elena Rodriguez", action: "Self-assessment submitted", detail: "8 skills" });

  return {
    cycles: [
      cycle("cycle-h2", 2, {}),
      cycle("cycle-h1", 1, {
        status: "completed",
        startsOn: today(-200),
        endsOn: today(-160),
        verifyBy: today(-150),
        calibration: { by: ADMIN, at: iso(-141), note: "Architect decisions compared with the data team." },
      }),
    ],
    assessments: [james, elena, previous],
  };
}

const STORAGE_KEY = "bcms-capability-v2";
let state: State | null = null;
let loaded = false;
let revision = 0;
let sequence = 0;
const listeners = new Set<() => void>();

function db(): State {
  if (!state) state = seed();
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw) as State;
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
  listeners.forEach((l) => l());
}

export function subscribeCapability(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function capabilityRevision() {
  return revision;
}

/** Test helper: back to the seed data. */
export function resetCapability() {
  state = seed();
  loaded = true;
  revision += 1;
  listeners.forEach((l) => l());
}

const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}`;

/* ── access ────────────────────────────────────────────────────────────── */

const isAdmin = (u: Person) => u.portal === "organisation_admin";
const isOrgViewer = (u: Person) => isAdmin(u) || u.portal === "hr_ld_admin";
const isOwner = (a: CapabilityAssessment, u: Person) => a.employeeEmail.toLowerCase() === u.email.toLowerCase();

function requireAdmin(u: Person) {
  if (!isAdmin(u)) throw new CapabilityError("Only an Organisation Admin can do this.");
}

/** Line Managers and Organisation Admins can review; never one's own assessment. */
export function reviewerOptions(a: CapabilityAssessment, excludeUserIds: string[] = []) {
  return mockUsers.filter(
    (u) =>
      u.organisationId === a.organisationId &&
      (u.portal === "line_manager" || u.portal === "organisation_admin") &&
      u.email.toLowerCase() !== a.employeeEmail.toLowerCase() &&
      !excludeUserIds.includes(u.id),
  );
}

function canSee(a: CapabilityAssessment, u: Person) {
  return (
    a.organisationId === u.organisationId &&
    (isOwner(a, u) ||
      isOrgViewer(u) ||
      a.reviewer.userId === u.id ||
      a.items.some((i) => i.disagreement?.reviewer?.userId === u.id))
  );
}

/** The employee does not see decisions or levels until release (requests for evidence are shown). */
function viewFor(a: CapabilityAssessment, u: Person): CapabilityAssessment {
  const copy = structuredClone(a);
  if (isOwner(a, u) && !a.releasedAt) {
    copy.items.forEach((item) => {
      if (item.verification && item.verification.decision !== "more_evidence") item.verification = null;
    });
    copy.events = copy.events.filter((e) => e.action !== "Decision recorded");
  }
  return copy;
}

/* ── queries ───────────────────────────────────────────────────────────── */

export function listCapabilityCycles(organisationId: string): CapabilityCycle[] {
  return structuredClone(db().cycles.filter((c) => c.organisationId === organisationId));
}

export function getCapabilityCycle(organisationId: string, id: string) {
  return listCapabilityCycles(organisationId).find((c) => c.id === id) ?? null;
}

export function activeCycle(organisationId: string) {
  return listCapabilityCycles(organisationId).find((c) => c.status === "active") ?? null;
}

export function getAssessment(user: Person, id: string): CapabilityAssessment | null {
  const found = db().assessments.find((a) => a.id === id);
  return found && canSee(found, user) ? viewFor(found, user) : null;
}

/** The employee's assessment in the active cycle. */
export function myAssessment(user: Person): CapabilityAssessment | null {
  const active = db().cycles.filter((c) => c.status === "active").map((c) => c.id);
  const found = db().assessments.find((a) => isOwner(a, user) && a.organisationId === user.organisationId && active.includes(a.cycleId));
  return found ? viewFor(found, user) : null;
}

/** The employee's latest released results. */
export function myLatestResults(user: Person): CapabilityAssessment | null {
  return latestReleased(db().assessments.filter((a) => isOwner(a, user) && a.organisationId === user.organisationId))[0] ?? null;
}

function latestReleased(list: CapabilityAssessment[]): CapabilityAssessment[] {
  const seen = new Set<string>();
  return list
    .filter((a) => a.releasedAt)
    .sort((a, b) => b.releasedAt!.localeCompare(a.releasedAt!))
    .filter((a) => !seen.has(a.employeeId) && seen.add(a.employeeId))
    .map((a) => structuredClone(a));
}

/** Latest released results per employee the person may see (HR and admins: everyone; managers: their own). */
export function latestResults(user: Person) {
  return latestReleased(db().assessments.filter((a) => canSee(a, user)));
}

/** Assessments a person reviews in active cycles. */
export function reviewQueue(user: Person) {
  const active = db().cycles.filter((c) => c.status === "active").map((c) => c.id);
  return structuredClone(
    db().assessments.filter((a) => a.reviewer.userId === user.id && a.organisationId === user.organisationId && active.includes(a.cycleId)),
  );
}

export function assessmentsInCycle(user: Person, cycleId: string) {
  return structuredClone(db().assessments.filter((a) => a.cycleId === cycleId && canSee(a, user)));
}

export function cycleOf(a: CapabilityAssessment) {
  return structuredClone(db().cycles.find((c) => c.id === a.cycleId) ?? null);
}

export function stageOf(a: CapabilityAssessment): AssessmentStage {
  if (a.releasedAt) return "released";
  if (!a.submittedAt) return a.items.some((i) => i.self !== null || i.evidence.length) ? "in_progress" : "not_started";
  if (a.items.every((i) => i.verification)) {
    return a.items.some((i) => i.verification?.decision === "more_evidence") ? "more_evidence" : "reviewed";
  }
  return a.items.some((i) => i.verification?.decision === "more_evidence") ? "more_evidence" : "awaiting_verification";
}

/** Disagreements waiting for a second reviewer or their decision. */
export function openDisagreements(user: Person) {
  return db()
    .assessments.filter((a) => a.organisationId === user.organisationId)
    .flatMap((a) =>
      a.items
        .filter((i) => i.disagreement && !i.disagreement.outcome && (isAdmin(user) || i.disagreement.reviewer?.userId === user.id))
        .map((i) => ({ assessment: structuredClone(a), item: structuredClone(i) })),
    );
}

/* ── monitoring (methodology §8) ───────────────────────────────────────── */

export type CycleStats = {
  total: number;
  selfAssessed: number;
  verified: number;
  remaining: number;
  /** Average days from submission to the last decision. */
  averageDays: number | null;
  /** Average self-rating minus verified level, over skills with both. */
  selfVsVerified: number | null;
  skillsMetPct: number | null;
  gapsClosed: number;
  lateDecisions: number;
};

const average = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

function statsFor(list: CapabilityAssessment[]): CycleStats {
  const decided = (a: CapabilityAssessment) => a.items.every((i) => verifiedLevel(i) !== null);
  const items = list.flatMap((a) => a.items).filter((i) => verifiedLevel(i) !== null);
  const days = list
    .filter((a) => a.submittedAt && decided(a))
    .map((a) => {
      const last = Math.max(...a.items.map((i) => Date.parse(i.verification!.at)));
      return Math.max(0, (last - Date.parse(a.submittedAt!)) / 86_400_000);
    });
  let gapsClosed = 0;
  for (const a of list) {
    const before = db().assessments
      .filter((p) => p.employeeId === a.employeeId && p.organisationId === a.organisationId && p.id !== a.id && p.releasedAt && (!a.releasedAt || p.releasedAt < a.releasedAt))
      .sort((x, y) => y.releasedAt!.localeCompare(x.releasedAt!))[0];
    for (const item of a.items) {
      const old = before?.items.find((i) => i.skillId === item.skillId);
      if (old && (gapOf(old) ?? 0) > 0 && gapOf(item) === 0) gapsClosed += 1;
    }
  }
  return {
    total: list.length,
    selfAssessed: list.filter((a) => a.submittedAt && !decided(a)).length,
    verified: list.filter(decided).length,
    remaining: list.filter((a) => !a.submittedAt).length,
    averageDays: round1(average(days)),
    selfVsVerified: round1(average(items.filter((i) => i.self !== null).map((i) => i.self! - verifiedLevel(i)!))),
    skillsMetPct: items.length ? Math.round((100 * items.filter((i) => gapOf(i) === 0).length) / items.length) : null,
    gapsClosed,
    lateDecisions: items.filter((i) => i.verification!.late).length,
  };
}

export function cycleStats(user: Person, cycleId: string) {
  const list = assessmentsInCycle(user, cycleId);
  const group = (key: (a: CapabilityAssessment) => string) =>
    [...new Set(list.map(key))].sort().map((name) => ({ name, ...statsFor(list.filter((a) => key(a) === name)) }));
  return { overall: statsFor(list), byDepartment: group((a) => a.department), byReviewer: group((a) => a.reviewer.name) };
}

/** Gaps from the latest released results, for the Training Plan. */
export function releasedGaps(user: Person) {
  return latestResults(user).flatMap((a) =>
    a.items.filter((i) => (gapOf(i) ?? 0) > 0).map((i) => ({ assessment: a, item: i, level: verifiedLevel(i)! })),
  );
}

/* ── cycles (Organisation Admin) ───────────────────────────────────────── */

export type NewCycle = { name: string; scope: string; year: number; cyclesPerYear: CyclesPerYear; number: number };

export function createCapabilityCycle(user: Person, input: NewCycle): string {
  requireAdmin(user);
  const name = input.name.trim();
  if (name.length < 3) throw new CapabilityError("Enter a cycle name of at least 3 characters.");
  const window = buildSchedule(input.cyclesPerYear, input.year)[input.number - 1];
  if (!window) throw new CapabilityError("Choose a cycle from the timetable.");
  const clash = db().cycles.some(
    (c) => c.organisationId === user.organisationId && c.scope === input.scope && c.year === input.year && c.cyclesPerYear === input.cyclesPerYear && c.number === input.number,
  );
  if (clash) throw new CapabilityError("That cycle already exists for this scope and year.");
  const cycle: CapabilityCycle = {
    id: nextId("cycle"),
    organisationId: user.organisationId,
    ...input,
    name,
    period: window.period,
    verificationDeadline: window.verificationDeadline,
    status: "scheduled",
    startsOn: null,
    endsOn: null,
    verifyBy: null,
    createdBy: user.name,
    calibration: null,
    excluded: [],
  };
  db().cycles.unshift(cycle);
  save();
  return cycle.id;
}

/** Saves a timetable as scheduled cycles; cycles that already exist are left alone. */
export function scheduleProgramme(user: Person, scope: string, cyclesPerYear: CyclesPerYear, year: number): number {
  requireAdmin(user);
  let created = 0;
  for (const w of buildSchedule(cyclesPerYear, year)) {
    const exists = db().cycles.some(
      (c) => c.organisationId === user.organisationId && c.scope === scope && c.year === year && c.cyclesPerYear === cyclesPerYear && c.number === w.cycle,
    );
    if (exists) continue;
    createCapabilityCycle(user, { name: `${year} Cycle ${w.cycle} of ${cyclesPerYear} – ${scope}`, scope, year, cyclesPerYear, number: w.cycle });
    created += 1;
  }
  return created;
}

function inScope(scope: string, e: (typeof mockEmployees)[number]) {
  if (scope === ORGANISATION_SCOPE) return true;
  const department = roleDepartments.find((d) => d.name === scope);
  return department ? e.departmentId === department.id : e.departmentName === scope;
}

/** Why an employee cannot be assessed, or null. */
function exclusion(e: (typeof mockEmployees)[number]): string | null {
  if (!e.roleId) return "Not mapped to a role";
  if (e.mappingStatus !== "aligned") return "Role mapping is not approved";
  const role = listRoleRecords().find((r) => r.id === e.roleId);
  if (!role || !["approved", "published"].includes(role.status)) return "Role profile is not approved";
  if (!itemsFor(role).length) return "Role profile has no skills";
  return null;
}

/** Opens a cycle with exact dates and creates an assessment for everyone eligible. */
export function activateCycle(user: Person, id: string, dates: { startsOn: string; endsOn: string; verifyBy: string }) {
  requireAdmin(user);
  const cycle = db().cycles.find((c) => c.id === id && c.organisationId === user.organisationId);
  if (!cycle) throw new CapabilityError("Cycle not found.");
  if (cycle.status !== "scheduled") throw new CapabilityError("Only a scheduled cycle can be activated.");
  if (!dates.startsOn || !dates.endsOn || !dates.verifyBy) throw new CapabilityError("Enter all three dates.");
  if (dates.startsOn > dates.endsOn || dates.endsOn > dates.verifyBy) {
    throw new CapabilityError("The dates must run in order: start, self-assessment end, verification deadline.");
  }
  const activeIds = db().cycles.filter((c) => c.organisationId === user.organisationId && c.status === "active").map((c) => c.id);
  // Sample employees belong to the seeded organisation.
  const people = user.organisationId === GEC ? mockEmployees.filter((e) => inScope(cycle.scope, e)) : [];
  const excluded: CapabilityCycle["excluded"] = [];
  const created: CapabilityAssessment[] = [];
  for (const e of people) {
    const reason =
      exclusion(e) ??
      (db().assessments.some((a) => a.employeeId === e.id && activeIds.includes(a.cycleId)) ? "Already in an active cycle" : null);
    if (reason) excluded.push({ name: e.name, reason });
    else {
      const a = makeAssessment(cycle.id, e.id);
      a.events = [{ at: iso(), actor: user.name, action: "Assessment opened", detail: cycle.name }];
      created.push(a);
    }
  }
  if (!created.length) throw new CapabilityError("Nobody in this scope can be assessed yet. Check role mapping and role profiles.");
  Object.assign(cycle, dates, { status: "active", excluded });
  db().assessments.push(...created);
  save();
  return { assessed: created.length, excluded };
}

export function closeCycle(user: Person, id: string) {
  requireAdmin(user);
  const cycle = db().cycles.find((c) => c.id === id && c.organisationId === user.organisationId);
  if (!cycle || cycle.status !== "active") throw new CapabilityError("Only an active cycle can be closed.");
  const waiting = db().assessments.filter((a) => a.cycleId === id && a.submittedAt && !a.releasedAt).length;
  if (waiting) throw new CapabilityError(`${waiting} submitted assessment${waiting === 1 ? " is" : "s are"} not released yet.`);
  cycle.status = "completed";
  save();
}

/* ── employee ──────────────────────────────────────────────────────────── */

function own(user: Person, id: string) {
  const a = db().assessments.find((x) => x.id === id && isOwner(x, user) && x.organisationId === user.organisationId);
  if (!a) throw new CapabilityError("This assessment is not yours.");
  return a;
}

function itemOf(a: CapabilityAssessment, skillId: string) {
  const item = a.items.find((i) => i.skillId === skillId);
  if (!item) throw new CapabilityError("That skill is not part of this assessment.");
  return item;
}

function requireOpen(a: CapabilityAssessment) {
  if (db().cycles.find((c) => c.id === a.cycleId)?.status !== "active") throw new CapabilityError("This assessment cycle is not open.");
}

/** Last day to self-assess: the cycle's end date, or this person's extension. */
export function selfAssessmentEnds(a: CapabilityAssessment) {
  return a.extension?.until ?? db().cycles.find((c) => c.id === a.cycleId)?.endsOn ?? null;
}

/** True when the self-assessment was not submitted in time. */
export function selfAssessmentClosed(a: CapabilityAssessment) {
  const ends = selfAssessmentEnds(a);
  return !a.submittedAt && ends !== null && today() > ends;
}

function requireInTime(a: CapabilityAssessment) {
  if (selfAssessmentClosed(a)) throw new CapabilityError("Self-assessment has closed. Ask your reviewer or Organisation Admin for an extension.");
}

/** Agreed by the reviewer or an Organisation Admin; never past the verification deadline. */
export function grantExtension(user: Person, id: string, until: string, reason: string) {
  const a = db().assessments.find((x) => x.id === id && x.organisationId === user.organisationId);
  if (!a || (!isAdmin(user) && a.reviewer.userId !== user.id)) throw new CapabilityError("Only the reviewer or an Organisation Admin can agree an extension.");
  if (a.submittedAt) throw new CapabilityError("This self-assessment has already been submitted.");
  requireOpen(a);
  const cycle = db().cycles.find((c) => c.id === a.cycleId)!;
  if (!until || until < today() || (cycle.endsOn && until <= cycle.endsOn)) throw new CapabilityError("Choose a date after the cycle's end date.");
  if (cycle.verifyBy && until > cycle.verifyBy) throw new CapabilityError("The extension cannot go past the verification deadline.");
  if (!reason.trim()) throw new CapabilityError("Give a reason.");
  a.extension = { until, reason: reason.trim(), by: user.name, at: iso() };
  log(a, user.name, "Extension agreed", `Until ${until}: ${reason.trim()}`);
  save();
}

function log(a: CapabilityAssessment, actor: string, action: string, detail: string) {
  a.events.push({ at: iso(), actor, action, detail });
}

export function saveSelfRating(user: Person, id: string, skillId: string, level: number) {
  const a = own(user, id);
  requireOpen(a);
  if (a.submittedAt) throw new CapabilityError("You have already submitted this self-assessment.");
  requireInTime(a);
  if (!frameworkLevels().some((l) => l.rank === level)) throw new CapabilityError("Choose a level from the scale.");
  itemOf(a, skillId).self = level;
  save();
}

export type NewEvidence = { title: string; fileNames: string[]; notes: string; workDate: string };

/** Evidence can be added until a decision is made, when more is requested, and with a disagreement. */
export function addCapabilityEvidence(user: Person, id: string, skillId: string, input: NewEvidence) {
  const a = own(user, id);
  const item = itemOf(a, skillId);
  const decision = item.verification?.decision;
  const disputed = !!item.disagreement && !item.disagreement.outcome;
  if (!disputed) {
    if (!a.releasedAt || decision !== "more_evidence") requireOpen(a);
    requireInTime(a);
    if (decision && decision !== "more_evidence") throw new CapabilityError("This skill has already been reviewed.");
  }
  if (!input.title.trim()) throw new CapabilityError("Give the evidence a title.");
  if (!input.fileNames.length) throw new CapabilityError("Attach at least one file.");
  if (!input.workDate) throw new CapabilityError("Say when the work was done.");
  if (input.workDate > today()) throw new CapabilityError("The work date cannot be in the future.");
  item.evidence.push({
    id: nextId("ev"),
    title: input.title.trim(),
    fileNames: [...input.fileNames],
    notes: input.notes.trim(),
    workDate: input.workDate,
    addedAt: iso(),
  });
  log(a, a.employeeName, "Evidence added", `${item.name}: ${input.title.trim()}`);
  if (decision === "more_evidence") {
    // Back to the reviewer; the earlier request stays in the log.
    item.verification = null;
    log(a, a.employeeName, "Returned for verification", item.name);
  }
  save();
}

/** Skills in the active assessment that can take evidence now (Growth Hub uses this). */
export function evidenceTargets(user: Person): Array<{ assessmentId: string; skillId: string; name: string }> {
  const found = db().assessments.find((a) => isOwner(a, user) && a.organisationId === user.organisationId && db().cycles.some((c) => c.id === a.cycleId && c.status === "active"));
  if (!found || selfAssessmentClosed(found)) return [];
  return found.items
    .filter((i) => (!found.releasedAt && !i.verification) || i.verification?.decision === "more_evidence")
    .map((i) => ({ assessmentId: found.id, skillId: i.skillId, name: i.name }));
}

export function submitSelfAssessment(user: Person, id: string) {
  const a = own(user, id);
  requireOpen(a);
  if (a.submittedAt) throw new CapabilityError("You have already submitted this self-assessment.");
  requireInTime(a);
  const missing = a.items.filter((i) => i.self === null);
  if (missing.length) throw new CapabilityError(`Rate every skill first. ${missing.length} left: ${missing.map((i) => i.name).join(", ")}.`);
  a.submittedAt = iso();
  log(a, a.employeeName, "Self-assessment submitted", `${a.items.length} skills, shared with ${a.reviewer.name}`);
  save();
}

export function requestAdjustment(user: Person, id: string, request: string) {
  const a = own(user, id);
  if (!request.trim()) throw new CapabilityError("Say what you need.");
  a.adjustments.push({ request: request.trim().slice(0, 500), at: iso(), response: null });
  log(a, a.employeeName, "Adjustment requested", request.trim().slice(0, 500));
  save();
}

export function canDisagree(a: CapabilityAssessment, item: AssessmentItem, now = new Date()) {
  return !!a.releasedAt && !item.disagreement && verifiedLevel(item) !== null && now <= disagreeBy(a.releasedAt);
}

export function disagree(user: Person, id: string, skillId: string, reason: string) {
  const a = own(user, id);
  const item = itemOf(a, skillId);
  if (!a.releasedAt) throw new CapabilityError("Results have not been released yet.");
  if (item.disagreement) throw new CapabilityError("You have already asked for a second review of this skill.");
  if (!canDisagree(a, item)) throw new CapabilityError("The time to ask for a second review has passed.");
  if (reason.trim().length < 15) throw new CapabilityError("Explain why you disagree (at least 15 characters).");
  item.disagreement = { reason: reason.trim(), at: iso(), reviewer: null, outcome: null };
  log(a, a.employeeName, "Second review requested", `${item.name}: ${reason.trim()}`);
  save();
}

/* ── reviewers ─────────────────────────────────────────────────────────── */

export type DecisionInput = { decision: VerificationDecision; level?: number | null; feedback: string };

function buildVerification(user: Person, a: CapabilityAssessment, item: AssessmentItem, input: DecisionInput, second = false): Verification {
  if (!input.feedback.trim()) throw new CapabilityError("Feedback is required with every decision.");
  let level: number | null = null;
  if (input.decision === "verified") {
    if (!item.evidence.some((e) => isRecent(e))) {
      throw new CapabilityError("Verified needs at least one piece of evidence from the last 12 months.");
    }
    level = input.level ?? item.required;
    const top = Math.max(...frameworkLevels().map((l) => l.rank));
    if (!Number.isInteger(level) || level < item.required || level > top) {
      throw new CapabilityError(`Verified means Level ${item.required} or above.`);
    }
  } else if (input.decision === "not_verified") {
    if (input.level === null || input.level === undefined) throw new CapabilityError("Choose the level the evidence supports.");
    if (!Number.isInteger(input.level) || input.level < 0 || input.level >= item.required) {
      throw new CapabilityError(`Not verified means a level below the required Level ${item.required}.`);
    }
    level = input.level;
  }
  const verifyBy = db().cycles.find((c) => c.id === a.cycleId)?.verifyBy;
  const late = !second && !!verifyBy && today() > verifyBy;
  return { decision: input.decision, level, late, feedback: input.feedback.trim(), by: user.name, byUserId: user.id, at: iso() };
}

const describe = (v: Verification) => (v.decision === "more_evidence" ? "More evidence requested" : `${v.decision === "verified" ? "Verified" : "Not verified"}: ${levelLabel(v.level)}`);

export function decide(user: Person, id: string, skillId: string, input: DecisionInput) {
  const a = db().assessments.find((x) => x.id === id && x.organisationId === user.organisationId);
  if (!a || a.reviewer.userId !== user.id) throw new CapabilityError("Only the assigned reviewer can decide.");
  if (isOwner(a, user)) throw new CapabilityError("You cannot review your own assessment.");
  if (!a.submittedAt) throw new CapabilityError("The employee has not submitted this self-assessment yet.");
  const item = itemOf(a, skillId);
  // After release, only a skill whose requested evidence has arrived can still be decided.
  if (a.releasedAt && item.verification) throw new CapabilityError("Results have been released. Changes go through a second review.");
  item.verification = buildVerification(user, a, item, input);
  log(a, user.name, input.decision === "more_evidence" ? "More evidence requested" : "Decision recorded", `${item.name} – ${describe(item.verification)}`);
  save();
}

/** Conflict of interest or an absent manager: an admin, or the reviewer, hands the assessment on. */
export function reassignReviewer(user: Person, id: string, newReviewerId: string, reason: string) {
  const a = db().assessments.find((x) => x.id === id && x.organisationId === user.organisationId);
  if (!a || (!isAdmin(user) && a.reviewer.userId !== user.id)) throw new CapabilityError("Only the reviewer or an Organisation Admin can change the reviewer.");
  if (a.releasedAt) throw new CapabilityError("Results have already been released.");
  if (!reason.trim()) throw new CapabilityError("Give a reason.");
  const next = reviewerOptions(a, [a.reviewer.userId]).find((u) => u.id === newReviewerId);
  if (!next) throw new CapabilityError("Choose another eligible reviewer.");
  log(a, user.name, "Reviewer changed", `${a.reviewer.name} → ${next.name}: ${reason.trim()}`);
  a.reviewer = { userId: next.id, name: next.name };
  save();
}

export function respondToAdjustment(user: Person, id: string, index: number, text: string) {
  const a = db().assessments.find((x) => x.id === id && x.organisationId === user.organisationId);
  if (!a || (!isAdmin(user) && a.reviewer.userId !== user.id)) throw new CapabilityError("You cannot answer this request.");
  const request = a.adjustments[index];
  if (!request || request.response) throw new CapabilityError("This request has already been answered.");
  if (!text.trim()) throw new CapabilityError("Write a response.");
  request.response = { text: text.trim(), by: user.name, at: iso() };
  log(a, user.name, "Adjustment answered", text.trim());
  save();
}

/* ── calibration, release and second review ────────────────────────────── */

export function recordCalibration(user: Person, cycleId: string, note: string) {
  requireAdmin(user);
  const cycle = db().cycles.find((c) => c.id === cycleId && c.organisationId === user.organisationId);
  if (!cycle) throw new CapabilityError("Cycle not found.");
  if (note.trim().length < 15) throw new CapabilityError("Say which decisions were compared and what was agreed (at least 15 characters).");
  cycle.calibration = { by: user.name, at: iso(), note: note.trim() };
  save();
}

/** Makes reviewed assessments final and visible to their employees. */
export function releaseResults(user: Person, cycleId: string): number {
  requireAdmin(user);
  const cycle = db().cycles.find((c) => c.id === cycleId && c.organisationId === user.organisationId);
  if (!cycle) throw new CapabilityError("Cycle not found.");
  if (!cycle.calibration) throw new CapabilityError("Record the calibration before releasing results.");
  // A skill still waiting for evidence does not hold the rest back; it is reported as not verified.
  const ready = db().assessments.filter((a) => a.cycleId === cycleId && a.submittedAt && !a.releasedAt && a.items.every((i) => i.verification) && a.items.some((i) => verifiedLevel(i) !== null));
  if (!ready.length) throw new CapabilityError("No assessment has a decision for every skill yet.");
  for (const a of ready) {
    a.releasedAt = iso();
    const m = capabilityMatch(a.items);
    log(a, user.name, "Results released", `${m.percent}% match, ${m.met} of ${m.total} skills met, ${m.counted} counted`);
  }
  save();
  return ready.length;
}

export function assignSecondReviewer(user: Person, id: string, skillId: string, reviewerId: string) {
  requireAdmin(user);
  const a = db().assessments.find((x) => x.id === id && x.organisationId === user.organisationId);
  if (!a) throw new CapabilityError("Assessment not found.");
  const item = itemOf(a, skillId);
  if (!item.disagreement || item.disagreement.outcome) throw new CapabilityError("There is no open disagreement for this skill.");
  const next = reviewerOptions(a, [item.verification!.byUserId]).find((u) => u.id === reviewerId);
  if (!next) throw new CapabilityError("The second reviewer must be a different, eligible person.");
  item.disagreement.reviewer = { userId: next.id, name: next.name };
  log(a, user.name, "Second reviewer assigned", `${item.name}: ${next.name}`);
  save();
}

export function decideSecondReview(user: Person, id: string, skillId: string, input: DecisionInput) {
  const a = db().assessments.find((x) => x.id === id && x.organisationId === user.organisationId);
  const item = a && itemOf(a, skillId);
  if (!a || !item?.disagreement?.reviewer || item.disagreement.reviewer.userId !== user.id) {
    throw new CapabilityError("Only the assigned second reviewer can decide.");
  }
  if (item.disagreement.outcome) throw new CapabilityError("This second review is finished.");
  if (input.decision === "more_evidence") throw new CapabilityError("A second review ends with a level.");
  const before = item.verification!.level;
  item.verification = buildVerification(user, a, item, input, true);
  item.disagreement.outcome = { changed: item.verification.level !== before, by: user.name, at: iso() };
  log(a, user.name, "Second review decided", `${item.name} – ${describe(item.verification)}${item.disagreement.outcome.changed ? "" : " (unchanged)"}`);
  save();
}
