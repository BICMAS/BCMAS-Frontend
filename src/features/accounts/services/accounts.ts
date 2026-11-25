import { allOrganisations, allUsers, getMockOrganisation, mockUsers } from "@/config/mock-users";
import { registerProvisionedUser } from "@/config/provisioned-tenants";
import { initialsAvatar } from "@/features/employees/components/workforce-change-dialogs";
import { mockLatency } from "@/lib/mock/delay";
import type { UserPortal } from "@/types";
import type { MockUser } from "@/types/user";

/**
 * Sign-in accounts: who can sign in, and how each person sets up their own password.
 *
 * Nobody types or sees another person's password. An admin gets a one-time activation code to pass
 * on outside email; the person also confirms a code sent to their mailbox, so neither the admin nor
 * someone reading the mailbox can activate the account alone.
 *
 * SAMPLE DATA: it runs in the browser, so these rules are a working model, not protection. The
 * backend must create, hash, send, limit and check the codes and passwords, and check permissions.
 */

export const accessRoles = ["Organisation Admin", "HRBP", "Line Manager", "Employee"] as const;
export type AccessRole = (typeof accessRoles)[number];

export const setupMethods = ["code", "link", "sso"] as const;
export type SetupMethod = (typeof setupMethods)[number];

export const SETUP_METHOD_LABEL: Record<SetupMethod, string> = {
  code: "Activation code (no links in emails)",
  link: "Email link",
  sso: "Company sign-in (Microsoft)",
};

export const SETUP_METHOD_HINT: Record<SetupMethod, string> = {
  code: "An admin passes on a one-time code by phone, in person or on Teams. Emails contain no links.",
  link: "Only for organisations whose policy allows links in emails.",
  sso: "People sign in with their work Microsoft account. They have no BICMAS password.",
};

export type AccountStatus = "Invited" | "Code expired" | "Reset pending" | "Active" | "Locked" | "Suspended";

export type Account = {
  id: string;
  organisationId: string;
  name: string;
  email: string;
  accessRole: AccessRole;
  status: AccountStatus;
  /** The tenant's first Organisation Admin, created by the Platform Super Admin. */
  firstAdmin: boolean;
  employeeId: string | null;
  codeExpiresAt: string | null;
  lastSignInAt: string | null;
};

export type AccountEvent = { id: string; at: string; organisationId: string; actor: string; summary: string };

/** What an admin is shown once, after creating an account or a new code. */
export type Setup = { accountId: string; name: string; email: string; method: SetupMethod; code: string | null; expiresAt: string | null };

export type Actor = Pick<MockUser, "id" | "name" | "portal" | "organisationId">;

export const CODE_HOURS = 72;
export const EMAIL_CODE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 30;
/** Seeded people have not chosen a password, so they keep the demo one. */
const DEMO_PASSWORD = "Password123!";
/** The same words whether the email, the code or the time was wrong. */
const WRONG_CODE = "That email and activation code do not match, or the code has expired. Ask your administrator for a new code.";
const WRONG_EMAIL_CODE = "That code is wrong or has expired.";

type Secret = { hash: string; salt: string; expiresAt: number; attempts: number };
type Row = {
  id: string;
  organisationId: string;
  name: string;
  email: string;
  accessRole: AccessRole;
  firstAdmin: boolean;
  employeeId: string | null;
  active: boolean;
  everActive: boolean;
  suspended: boolean;
  lockedUntil: number;
  failed: number;
  seeded: boolean;
  password: { hash: string; salt: string } | null;
  code: Secret | null;
  emailCode: (Secret & { purpose: "activate" | "reset" }) | null;
  lastSignInAt: string | null;
};
type State = { rows: Row[]; methods: Record<string, SetupMethod>; events: AccountEvent[]; sequence: number };

const ROLE_BY_PORTAL: Partial<Record<UserPortal, AccessRole>> = {
  organisation_admin: "Organisation Admin",
  hr_ld_admin: "HRBP",
  line_manager: "Line Manager",
  employee: "Employee",
};
const PORTAL_BY_ROLE: Record<AccessRole, UserPortal> = {
  "Organisation Admin": "organisation_admin",
  HRBP: "hr_ld_admin",
  "Line Manager": "line_manager",
  Employee: "employee",
};

function seed(): State {
  return {
    rows: mockUsers.flatMap((user) => {
      const accessRole = ROLE_BY_PORTAL[user.portal];
      return accessRole
        ? [blankRow({ id: user.id, organisationId: user.organisationId, name: user.name, email: user.email, accessRole, active: true, everActive: true, seeded: true })]
        : [];
    }),
    methods: {},
    events: [],
    sequence: 0,
  };
}

function blankRow(row: Pick<Row, "id" | "organisationId" | "name" | "email" | "accessRole"> & Partial<Row>): Row {
  return {
    firstAdmin: false,
    employeeId: null,
    active: false,
    everActive: false,
    suspended: false,
    lockedUntil: 0,
    failed: 0,
    seeded: false,
    password: null,
    code: null,
    emailCode: null,
    lastSignInAt: null,
    ...row,
  };
}

/* ── store (sample data, kept for the browser session like the other feature stores) ── */

const STORAGE_KEY = "bcms-accounts-v1";
const SIGNED_IN_KEY = "bcms-signed-in-account";
let state: State | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function db(): State {
  if (state) return state;
  if (typeof window === "undefined") return seed();
  state = seed();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw) as State;
  } catch {
    /* Unreadable storage: keep the seed data. */
  }
  return state;
}

function emit() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage unavailable: kept for this page only. */
  }
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeAccounts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function accountsRevision() {
  return revision;
}

/** Test helper: back to the seed data. */
export function resetAccounts() {
  state = seed();
  rememberSignIn(null);
  emit();
}

/* ── helpers ───────────────────────────────────────────────────────────── */

// No 0/O or 1/I. 32 characters, so each random byte maps evenly.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function newCode() {
  const letters = [...crypto.getRandomValues(new Uint8Array(12))].map((byte) => ALPHABET[byte % 32]);
  return [letters.slice(0, 4), letters.slice(4, 8), letters.slice(8)].map((part) => part.join("")).join("-");
}

function newEmailCode() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
}

const tidyCode = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
const tidyEmail = (text: string) => text.trim().toLowerCase();

async function digest(text: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${text}`);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function protect(text: string) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { salt, hash: await digest(text, salt) };
}

async function secret(text: string, lifeMs: number): Promise<Secret> {
  return { ...(await protect(text)), expiresAt: Date.now() + lifeMs, attempts: 0 };
}

/** Checks a code, counts wrong attempts, and cancels it after too many. */
async function matches(row: Row, field: "code" | "emailCode", text: string) {
  const current = row[field];
  if (!current || current.expiresAt <= Date.now()) return false;
  current.attempts += 1;
  // Counted before the check, so attempts sent at the same moment are all counted.
  const ok = current.attempts <= MAX_ATTEMPTS && (await digest(text, current.salt)) === current.hash;
  if (!ok && current.attempts >= MAX_ATTEMPTS && row[field] === current) {
    row[field] = null;
    record(row.organisationId, "BICMAS", `${field === "code" ? "Activation" : "Emailed"} code cancelled for ${row.name} after ${MAX_ATTEMPTS} wrong attempts`);
  }
  emit();
  return ok && row[field] === current;
}

function record(organisationId: string, actor: string, summary: string) {
  const data = db();
  data.sequence += 1;
  data.events.unshift({ id: `acc-ev-${data.sequence}`, at: new Date().toISOString(), organisationId, actor, summary });
}

const byId = (id: string) => db().rows.find((row) => row.id === id);
const byEmail = (email: string) => db().rows.find((row) => row.email === tidyEmail(email));

function statusOf(row: Row): AccountStatus {
  if (row.suspended) return "Suspended";
  if (!row.active) {
    if (setupMethodFor(row.organisationId) !== "sso" && (!row.code || row.code.expiresAt <= Date.now())) return "Code expired";
    return row.everActive ? "Reset pending" : "Invited";
  }
  return row.lockedUntil > Date.now() ? "Locked" : "Active";
}

function view(row: Row): Account {
  return {
    id: row.id,
    organisationId: row.organisationId,
    name: row.name,
    email: row.email,
    accessRole: row.accessRole,
    status: statusOf(row),
    firstAdmin: row.firstAdmin,
    employeeId: row.employeeId,
    codeExpiresAt: row.code && row.code.expiresAt > Date.now() ? new Date(row.code.expiresAt).toISOString() : null,
    lastSignInAt: row.lastSignInAt,
  };
}

/** The person's profile, so the rest of the app knows them. */
function publish(row: Row) {
  const known = allUsers().find((user) => user.id === row.id);
  if (known && mockUsers.some((user) => user.id === row.id)) return;
  registerProvisionedUser({
    id: row.id,
    name: row.name,
    email: row.email,
    roleLabel: row.accessRole,
    portal: PORTAL_BY_ROLE[row.accessRole],
    jobTitle: row.accessRole === "Organisation Admin" ? "Organisation Administrator" : row.accessRole,
    avatarUrl: known?.avatarUrl ?? initialsAvatar(row.name),
    organisationId: row.organisationId,
    unreadNotifications: 0,
  });
}

/* ── permissions ───────────────────────────────────────────────────────── */

const otherWorkingAdmins = (row: Row) =>
  db().rows.filter((r) => r.organisationId === row.organisationId && r.id !== row.id && r.accessRole === "Organisation Admin" && r.active && !r.suspended);

const isOrgAdmin = (actor: Actor, organisationId: string) => actor.portal === "organisation_admin" && actor.organisationId === organisationId;

function managed(actor: Actor, accountId: string): Row {
  const row = byId(accountId);
  if (!row || !isOrgAdmin(actor, row.organisationId)) throw new Error("You cannot manage this account");
  return row;
}

/** Account setup may also be done by the platform, for a tenant's first admin when it has no working admin. */
function setupManaged(actor: Actor, accountId: string): Row {
  const row = byId(accountId);
  if (row && actor.portal === "platform_super_admin" && platformMayHelp(row)) return row;
  return managed(actor, accountId);
}

const platformMayHelp = (row: Row) => row.firstAdmin && !row.suspended && !otherWorkingAdmins(row).length;

function notSelf(actor: Actor, row: Row) {
  if (actor.id === row.id) throw new Error("You cannot do this to your own account. Ask another Organisation Admin.");
}

function keepAnAdmin(row: Row) {
  if (row.accessRole === "Organisation Admin" && row.active && !row.suspended && !otherWorkingAdmins(row).length) {
    throw new Error("This is the last working Organisation Admin. Add another one first.");
  }
}

/* ── queries ───────────────────────────────────────────────────────────── */

export function listAccounts(organisationId: string): Account[] {
  return db().rows.filter((row) => row.organisationId === organisationId).map(view);
}

export function accountById(id: string): Account | null {
  const row = byId(id);
  return row ? view(row) : null;
}

export function listAccountEvents(organisationId: string): AccountEvent[] {
  return db().events.filter((event) => event.organisationId === organisationId);
}

export function setupMethodFor(organisationId: string): SetupMethod {
  return db().methods[organisationId] ?? "code";
}

/** Whether the Platform Super Admin may issue a code for this first admin. */
export function platformCanHelp(accountId: string) {
  const row = byId(accountId);
  return row ? platformMayHelp(row) : false;
}

/* ── creating accounts ─────────────────────────────────────────────────── */

async function issue(row: Row): Promise<Setup> {
  const method = setupMethodFor(row.organisationId);
  const code = method === "sso" ? null : newCode();
  row.emailCode = null;
  row.code = code ? await secret(tidyCode(code), CODE_HOURS * 3_600_000) : null;
  return {
    accountId: row.id,
    name: row.name,
    email: row.email,
    method,
    code,
    expiresAt: row.code ? new Date(row.code.expiresAt).toISOString() : null,
  };
}

function assertEmailFree(email: string, organisationId: string, exceptId?: string) {
  const taken = byEmail(email);
  if (taken && taken.id !== exceptId && taken.organisationId === organisationId) throw new Error("That email already has an account here");
  // Says nothing about other customers' accounts.
  if ((taken && taken.id !== exceptId) || allUsers().some((user) => user.id !== exceptId && user.email.toLowerCase() === tidyEmail(email))) {
    throw new Error("That email cannot be used. Contact BICMAS support.");
  }
}

/** Whether any account, including one not yet activated, uses this email. */
export function emailHasAccount(email: string) {
  return Boolean(byEmail(email));
}

/** Called by tenant provisioning, which has already checked the email. */
export async function createFirstAdmin(input: { user: MockUser; method: SetupMethod; actorName: string }): Promise<Setup> {
  const data = db();
  data.methods[input.user.organisationId] = input.method;
  const row = blankRow({
    id: input.user.id,
    organisationId: input.user.organisationId,
    name: input.user.name,
    email: tidyEmail(input.user.email),
    accessRole: "Organisation Admin",
    firstAdmin: true,
  });
  const setup = await issue(row);
  data.rows.push(row);
  record(row.organisationId, input.actorName, `Invited ${row.name} as the first Organisation Admin`);
  emit();
  return setup;
}

export async function inviteUser(
  input: { organisationId: string; name: string; email: string; accessRole: AccessRole; employeeId?: string | null },
  actor: Actor,
): Promise<Setup> {
  await mockLatency();
  if (!isOrgAdmin(actor, input.organisationId)) throw new Error("Only an Organisation Admin can invite people");
  const email = tidyEmail(input.email);
  assertEmailFree(email, input.organisationId);
  if (input.employeeId && db().rows.some((row) => row.organisationId === input.organisationId && row.employeeId === input.employeeId)) {
    throw new Error("That employee already has an account");
  }
  const data = db();
  data.sequence += 1;
  const row = blankRow({
    id: `user-${input.organisationId}-${data.sequence}`,
    organisationId: input.organisationId,
    name: input.name.trim(),
    email,
    accessRole: input.accessRole,
    employeeId: input.employeeId ?? null,
  });
  data.rows.push(row);
  const setup = await issue(row);
  record(row.organisationId, actor.name, `Invited ${row.name} as ${row.accessRole}`);
  emit();
  return setup;
}

/* ── admin actions ─────────────────────────────────────────────────────── */

/** A new activation code for someone who has not finished setting up; the old one stops working. */
export async function newActivationCode(accountId: string, actor: Actor): Promise<Setup> {
  await mockLatency();
  const row = setupManaged(actor, accountId);
  if (row.suspended) throw new Error("Reactivate the account first");
  if (row.active) throw new Error("This account is active. Use Reset sign-in instead.");
  const setup = await issue(row);
  record(row.organisationId, actor.name, `Created a new activation code for ${row.name}`);
  emit();
  return setup;
}

export async function cancelActivationCode(accountId: string, actor: Actor) {
  await mockLatency();
  const row = setupManaged(actor, accountId);
  if (row.active) throw new Error("This account is already active");
  row.code = null;
  row.emailCode = null;
  record(row.organisationId, actor.name, `Cancelled the activation code for ${row.name}`);
  emit();
}

/** Correcting the email cancels the old code, which may have gone to the wrong person. */
export async function correctEmail(accountId: string, email: string, actor: Actor): Promise<Setup> {
  await mockLatency();
  const row = setupManaged(actor, accountId);
  if (row.active || row.everActive) throw new Error("The email can only be corrected before the account is first used");
  assertEmailFree(email, row.organisationId, row.id);
  row.email = tidyEmail(email);
  const setup = await issue(row);
  if (row.firstAdmin) publish(row);
  record(row.organisationId, actor.name, `Corrected the email for ${row.name}`);
  emit();
  return setup;
}

/** For someone who lost their password and MFA: ends their access until they activate again. */
export async function resetSignIn(accountId: string, actor: Actor): Promise<Setup> {
  await mockLatency();
  const row = setupManaged(actor, accountId);
  notSelf(actor, row);
  if (row.suspended) throw new Error("Reactivate the account first");
  if (actor.portal !== "platform_super_admin") keepAnAdmin(row);
  row.active = false;
  row.password = null;
  row.lockedUntil = 0;
  row.failed = 0;
  const setup = await issue(row);
  record(row.organisationId, actor.name, `Reset sign-in for ${row.name}`);
  emit();
  return setup;
}

export async function changeAccessRole(accountId: string, accessRole: AccessRole, actor: Actor) {
  await mockLatency();
  const row = managed(actor, accountId);
  notSelf(actor, row);
  if (row.accessRole === accessRole) return;
  if (accessRole !== "Organisation Admin") keepAnAdmin(row);
  const before = row.accessRole;
  row.accessRole = accessRole;
  if (row.active || row.firstAdmin) publish(row);
  record(row.organisationId, actor.name, `Changed ${row.name} from ${before} to ${accessRole}`);
  emit();
}

export async function suspendAccount(accountId: string, actor: Actor) {
  await mockLatency();
  const row = managed(actor, accountId);
  notSelf(actor, row);
  keepAnAdmin(row);
  row.suspended = true;
  row.code = null;
  row.emailCode = null;
  record(row.organisationId, actor.name, `Suspended ${row.name}`);
  emit();
}

export async function reactivateAccount(accountId: string, actor: Actor) {
  await mockLatency();
  const row = managed(actor, accountId);
  row.suspended = false;
  record(row.organisationId, actor.name, `Reactivated ${row.name}`);
  emit();
}

export async function unlockAccount(accountId: string, actor: Actor) {
  await mockLatency();
  const row = managed(actor, accountId);
  row.lockedUntil = 0;
  row.failed = 0;
  record(row.organisationId, actor.name, `Unlocked ${row.name}`);
  emit();
}

/* ── the person's own steps ────────────────────────────────────────────── */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function emailCode(row: Row, purpose: "activate" | "reset") {
  const code = newEmailCode();
  row.emailCode = { ...(await secret(code, EMAIL_CODE_MINUTES * 60_000)), purpose };
  return code;
}

/** Step 1: work email + the activation code from the admin. Sends the confirmation code by email. */
export async function startActivation(email: string, code: string): Promise<Result<{ demoCode: string; name: string; organisation: string }>> {
  await mockLatency(400);
  const row = byEmail(email);
  if (!row || row.suspended || row.active || !(await matches(row, "code", tidyCode(code)))) return { ok: false, message: WRONG_CODE };
  // A right code is not a wrong attempt.
  row.code!.attempts -= 1;
  const demoCode = await emailCode(row, "activate");
  emit();
  return { ok: true, demoCode, name: row.name, organisation: getMockOrganisation(row.organisationId).name };
}

async function confirmed(row: Row | undefined, code: string, purpose: "activate" | "reset") {
  return Boolean(row && !row.suspended && row.emailCode?.purpose === purpose && (await matches(row, "emailCode", code.trim())));
}

/** Step 2: the emailed code and the password the person chose. Both codes stop working. */
export async function completeActivation(input: { email: string; code: string; emailCode: string; password: string }): Promise<Result> {
  await mockLatency(400);
  const row = byEmail(input.email);
  if (!row || row.active || !(await matches(row, "code", tidyCode(input.code)))) return { ok: false, message: WRONG_CODE };
  row.code!.attempts -= 1;
  if (!(await confirmed(row, input.emailCode, "activate"))) return { ok: false, message: WRONG_EMAIL_CODE };
  row.password = await protect(input.password);
  activate(row);
  rememberSignIn(row.id);
  return { ok: true };
}

function activate(row: Row) {
  row.active = true;
  row.everActive = true;
  row.seeded = false;
  row.code = null;
  row.emailCode = null;
  row.failed = 0;
  row.lockedUntil = 0;
  publish(row);
  record(row.organisationId, row.name, "Activated the account");
  emit();
}

/** Forgotten password, step 1. The answer is the same whether or not the email has an account. */
export async function startPasswordReset(email: string): Promise<{ demoCode: string | null }> {
  await mockLatency(400);
  const row = byEmail(email);
  if (!row || !row.active || row.suspended || setupMethodFor(row.organisationId) === "sso") return { demoCode: null };
  const demoCode = await emailCode(row, "reset");
  emit();
  return { demoCode };
}

/** Forgotten password, step 2: emailed code, MFA code and the new password. */
export async function completePasswordReset(input: { email: string; emailCode: string; mfaCode: string; password: string }): Promise<Result> {
  await mockLatency(400);
  const row = byEmail(input.email);
  // Both are checked together, so the answer does not say which one was right.
  const ok = row?.active ? await confirmed(row, input.emailCode, "reset") : false;
  if (!row || !ok || input.mfaCode !== DEMO_MFA) return { ok: false, message: "Those codes are wrong or have expired." };
  row.password = await protect(input.password);
  row.seeded = false;
  row.emailCode = null;
  row.failed = 0;
  row.lockedUntil = 0;
  record(row.organisationId, row.name, "Changed their password");
  emit();
  return { ok: true };
}

/** Sample data: no authenticator is enrolled, so everyone has the same code. */
export const DEMO_MFA = "123456";

/** "unknown" keeps the demo's any-email sign-in for emails that have no account. */
export type PasswordCheck = "ok" | "wrong" | "locked" | "unknown";

export async function checkPassword(email: string, password: string): Promise<PasswordCheck> {
  const row = byEmail(email);
  rememberSignIn(null);
  if (!row) return "unknown";
  if (row.lockedUntil > Date.now()) return "locked";
  if (!row.active || row.suspended || setupMethodFor(row.organisationId) === "sso") return "wrong";
  const ok = row.password ? (await digest(password, row.password.salt)) === row.password.hash : row.seeded && password === DEMO_PASSWORD;
  if (!ok) {
    row.failed += 1;
    if (row.failed >= MAX_ATTEMPTS) {
      row.failed = 0;
      row.lockedUntil = Date.now() + LOCK_MINUTES * 60_000;
      record(row.organisationId, "BICMAS", `Locked ${row.name} after ${MAX_ATTEMPTS} wrong passwords`);
    }
    emit();
    return row.lockedUntil > Date.now() ? "locked" : "wrong";
  }
  row.failed = 0;
  row.lastSignInAt = new Date().toISOString();
  rememberSignIn(row.id);
  emit();
  return "ok";
}

/**
 * Microsoft has confirmed this email. Sample data: the sign-in page's email stands in for it.
 * Returns "refused" for a person who may not sign in.
 */
export function signInWithCompany(email: string): "ok" | "refused" | "unknown" {
  rememberSignIn(null);
  const row = byEmail(email);
  if (!row) return "unknown";
  if (setupMethodFor(row.organisationId) !== "sso" || row.suspended) return "refused";
  row.lastSignInAt = new Date().toISOString();
  if (!row.active) activate(row);
  rememberSignIn(row.id);
  emit();
  return "ok";
}

function rememberSignIn(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(SIGNED_IN_KEY, id);
    else window.sessionStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* Storage unavailable: the workspace page lists the demo workspaces. */
  }
}

/** The account that has just signed in, if it is one of ours. */
export function signedInAccount(): Account | null {
  try {
    const id = window.sessionStorage.getItem(SIGNED_IN_KEY);
    return id ? accountById(id) : null;
  } catch {
    return null;
  }
}

export function organisationName(organisationId: string) {
  return allOrganisations().find((org) => org.id === organisationId)?.name ?? "";
}
