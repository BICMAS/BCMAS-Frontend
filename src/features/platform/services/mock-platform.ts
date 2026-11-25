import { allOrganisations, allUsers } from "@/config/mock-users";
import { registerProvisionedTenant } from "@/config/provisioned-tenants";
import { accountById, createFirstAdmin, emailHasAccount, subscribeAccounts, type Setup, type SetupMethod } from "@/features/accounts/services/accounts";
import { initialsAvatar } from "@/features/employees/components/workforce-change-dialogs";
import { mockLatency } from "@/lib/mock/delay";
import type { MockUser } from "@/types/user";

export type TenantStatus = "Active" | "MFA Pending" | "Provisioning" | "Awaiting Admin" | "Suspended";
export type TenantPlan = "Enterprise Plus" | "Standard" | "Pilot / Trial";
export type TicketStatus = "Open" | "Assigned" | "Resolved";
export type TicketPriority = "High" | "Medium" | "Low";
export type AuditCategory = "Security" | "Assumed Access" | "Provisioning";

export const tenantPlans: TenantPlan[] = ["Enterprise Plus", "Standard", "Pilot / Trial"];

/** The one list of tenant features, used by provisioning and by the Tenant Directory. */
export const entitlementOptions = [
  "AI Coaching",
  "L&D Library",
  "Assessments",
  "Talent Assessment",
  "Reports",
  "Multi-BU",
  "SAML",
] as const;
export type Entitlement = (typeof entitlementOptions)[number];

export const ENTITLEMENT_DESCRIPTION: Record<Entitlement, string> = {
  "AI Coaching": "AI Coaching workspace with the talking avatar coach",
  "L&D Library": "Capability resource library and development plans",
  Assessments: "Capability assessment cycles and evidence verification for employees",
  "Talent Assessment": "Recruitment: vacancies, candidate assessments and AI-avatar interviews",
  Reports: "Insights dashboards and exportable reports",
  "Multi-BU": "Several business units inside one tenant",
  SAML: "Sign-in through the customer's own identity provider (configured after provisioning)",
};

/** Features each plan starts with. Platform admins can still add or remove features per tenant. */
export const PLAN_ENTITLEMENTS: Record<TenantPlan, Entitlement[]> = {
  "Enterprise Plus": [...entitlementOptions],
  Standard: ["L&D Library", "Assessments", "Reports"],
  "Pilot / Trial": ["AI Coaching", "Assessments", "Reports"],
};

/** How long a new tenant takes to provision (shown on the page). */
export const PROVISIONING_SECONDS = 90;
const TRIAL_DAYS = 30;

export type TenantRecord = {
  id: string;
  /** The organisation (workspace) this tenant is. */
  organisationId: string;
  code: string;
  externalId: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  renewal: string;
  shards: number;
  status: TenantStatus;
  entitlements: string[];
  users: number;
  storageGb: number;
  apiRequests: string;
  /** First Organisation Admin (provisioned tenants). */
  adminUserId?: string;
  /** ISO time provisioning finishes; the tenant then becomes Active. */
  provisioningCompletesAt?: string;
  provisionedBy?: string;
};

export type SupportTicket = {
  id: string;
  tenantId: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
};

export type SupportSession = {
  id: string;
  actorName: string;
  actorAvatar: string;
  tenantId: string;
  ticketId: string;
  expiresLabel: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  adminName: string;
  adminAvatar: string;
  category: AuditCategory;
  tenantExternalId: string;
  summary: string;
  sessionId: string;
};

export type ProvisionDraft = {
  legalName: string;
  slug: string;
  plan: TenantPlan;
  entitlements: string[];
  adminName: string;
  adminEmail: string;
  /** How this customer's people set up their accounts. */
  setupMethod?: SetupMethod;
};

const ALEX_AVATAR =
  "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-9.jpg";
const SARAH_AVATAR =
  "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg";

function seed() {
  return {
    tenants: [
      {
        id: "gec",
        organisationId: "org-gec",
        code: "GEC",
        externalId: "GEC-8821-X9",
        name: "Global Enterprise Corp",
        slug: "gec",
        plan: "Enterprise Plus",
        renewal: "12 Jan 2027",
        shards: 3,
        status: "Active",
        entitlements: [...entitlementOptions],
        users: 2450,
        storageGb: 12.4,
        apiRequests: "124k",
      },
      {
        id: "ths",
        organisationId: "org-ths",
        code: "THS",
        externalId: "THS-4412-A2",
        name: "TechHub Solutions",
        slug: "techhub",
        plan: "Standard",
        renewal: "Monthly",
        shards: 1,
        status: "MFA Pending",
        entitlements: ["Assessments", "Reports"],
        users: 420,
        storageGb: 2.1,
        apiRequests: "12k",
      },
    ] as TenantRecord[],
    tickets: [
      { id: "TIC-10291", tenantId: "gec", category: "SSO Configuration Error", status: "Assigned", priority: "High" },
      { id: "TIC-10285", tenantId: "ths", category: "Billing Inquiry", status: "Resolved", priority: "Low" },
    ] as SupportTicket[],
    sessions: [
      {
        id: "SID_7721_AB",
        actorName: "Sarah Jenkins",
        actorAvatar: SARAH_AVATAR,
        tenantId: "gec",
        ticketId: "TIC-0982",
        expiresLabel: "42m",
      },
    ] as SupportSession[],
    audits: [
      {
        id: "audit-7721",
        at: "12 Nov 2024, 11:20 AM",
        adminName: "Sarah Jenkins",
        adminAvatar: SARAH_AVATAR,
        category: "Assumed Access",
        tenantExternalId: "GEC-8821-X9",
        summary: "Accessed employee records for Ticket #TIC-0982",
        sessionId: "SID_7721_AB",
      },
      {
        id: "audit-7715",
        at: "12 Nov 2024, 10:45 AM",
        adminName: "Alex Root",
        adminAvatar: ALEX_AVATAR,
        category: "Provisioning",
        tenantExternalId: "THS-4412-A2",
        summary: "Updated Entitlements: Enabled AI Coaching",
        sessionId: "SID_7715_XC",
      },
    ] as AuditEvent[],
    draft: null as ProvisionDraft | null,
    sequence: 30,
  };
}

/* ── store (sample data, kept for the browser session like the other feature stores) ── */

const STORAGE_KEY = "bcms-platform-v2";
let state: ReturnType<typeof seed> | null = null;
let loaded = false;
let revision = 0;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

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
    state.tenants.forEach(scheduleCompletion);
  }
  return state;
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage unavailable: changes still apply for this page. */
  }
}

function emit() {
  persist();
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function subscribePlatform(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  // An activated first admin makes a waiting tenant Active.
  const stopAccounts = subscribeAccounts(() => {
    if (settle()) emit();
  });
  return () => {
    listeners.delete(onStoreChange);
    stopAccounts();
  };
}

export function platformRevision() {
  db();
  return revision;
}

/** Test helper: back to the seed data. */
export function resetPlatform() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  state = seed();
  loaded = true;
  revision += 1;
  listeners.forEach((listener) => listener());
}

/* ── provisioning completion ───────────────────────────────────────────── */

/** A provisioned tenant's first admin has set up their account. */
function adminReady(tenant: TenantRecord) {
  const account = tenant.adminUserId ? accountById(tenant.adminUserId) : null;
  return !account || !["Invited", "Code expired"].includes(account.status);
}

/**
 * Moves tenants on when provisioning time has passed: to Active, or to Awaiting Admin until the first
 * admin has activated their account. Returns true when any changed.
 */
function settle(): boolean {
  const data = db();
  let changed = false;
  for (const tenant of data.tenants) {
    if (tenant.status === "Awaiting Admin" && adminReady(tenant)) {
      tenant.status = "Active";
      changed = true;
      auditCompletion(tenant, new Date(), `${tenant.name} is active: the first admin has set up their account`);
      continue;
    }
    if (tenant.status !== "Provisioning" || !tenant.provisioningCompletesAt) continue;
    const done = new Date(tenant.provisioningCompletesAt);
    if (done.getTime() > Date.now()) continue;
    const ready = adminReady(tenant);
    tenant.status = ready ? "Active" : "Awaiting Admin";
    changed = true;
    auditCompletion(tenant, done, `Provisioning completed: ${tenant.name} is ${ready ? "active" : "waiting for its first admin"}`);
  }
  if (changed) persist();
  return changed;
}

function auditCompletion(tenant: TenantRecord, at: Date, summary: string) {
  const data = db();
  data.sequence += 1;
  data.audits.unshift({
    id: `audit-${data.sequence}`,
    at: stamp(at),
    adminName: tenant.provisionedBy ?? "BICMAS Platform",
    adminAvatar: avatarFor(tenant.provisionedBy ?? ""),
    category: "Provisioning",
    tenantExternalId: tenant.externalId,
    summary,
    sessionId: nextSessionId(),
  });
}

/** Records an action on a tenant's first admin account. Never includes a code. */
export function auditFirstAdmin(tenantId: string, actorName: string, summary: string) {
  const data = db();
  const tenant = data.tenants.find((item) => item.id === tenantId);
  if (!tenant) return;
  data.sequence += 1;
  data.audits.unshift({
    id: `audit-${data.sequence}`,
    at: stamp(),
    adminName: actorName,
    adminAvatar: avatarFor(actorName),
    category: "Security",
    tenantExternalId: tenant.externalId,
    summary,
    sessionId: nextSessionId(),
  });
  emit();
}

function scheduleCompletion(tenant: TenantRecord) {
  if (typeof window === "undefined") return;
  if (tenant.status !== "Provisioning" || !tenant.provisioningCompletesAt || timers.has(tenant.id)) return;
  const wait = Math.max(0, new Date(tenant.provisioningCompletesAt).getTime() - Date.now());
  timers.set(
    tenant.id,
    setTimeout(() => {
      timers.delete(tenant.id);
      if (settle()) emit();
    }, wait),
  );
}

/* ── helpers ───────────────────────────────────────────────────────────── */

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** e.g. "23 Nov 2026, 7:31 AM" (the audit log's format). */
function stamp(date = new Date()) {
  return DATE_TIME.format(date).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Renewal shown in the directory: annual from today, monthly, or the trial end date. */
export function renewalFor(plan: TenantPlan, from = new Date()) {
  if (plan === "Standard") return "Monthly";
  if (plan === "Pilot / Trial") return `Trial ends ${DATE.format(addDays(from, TRIAL_DAYS))}`;
  const next = new Date(from);
  next.setFullYear(next.getFullYear() + 1);
  return DATE.format(next);
}

/** The signed-in person's photo, or their initials when there is none. */
function avatarFor(name: string) {
  return allUsers().find((user) => user.name === name)?.avatarUrl || initialsAvatar(name || "BICMAS");
}

function nextSessionId() {
  const data = db();
  data.sequence += 1;
  return `SID_${data.sequence}_PL`;
}

/* ── queries ───────────────────────────────────────────────────────────── */

export function listTenants() {
  settle();
  return db().tenants.map((tenant) => ({ ...tenant, entitlements: [...tenant.entitlements] }));
}

export function listTickets() {
  return db().tickets.map((ticket) => ({ ...ticket }));
}

export function listSupportSessions() {
  return db().sessions.map((session) => ({ ...session }));
}

export function listAuditEvents() {
  settle();
  return db().audits.map((event) => ({ ...event }));
}

export function getProvisioningDraft() {
  const draft = db().draft;
  return draft ? { ...draft, entitlements: [...draft.entitlements] } : null;
}

export function tenantById(id: string) {
  return listTenants().find((tenant) => tenant.id === id) ?? null;
}

/** The tenant behind an organisation (workspace), if it was provisioned on the platform. */
export function tenantForOrganisation(organisationId: string) {
  return listTenants().find((tenant) => tenant.organisationId === organisationId) ?? null;
}

export const platformHeadline = {
  activeTenants: "142",
  activeTenantsDelta: "+4 this week",
  users: "124,582",
  apiRequests: "8.4M",
  apiLoad: 68,
  storage: "4.2 TB",
};

export const activityTrend = [
  { month: "Jul", value: 12.4 },
  { month: "Aug", value: 18.2 },
  { month: "Sep", value: 24.5 },
  { month: "Oct", value: 32.1 },
  { month: "Nov", value: 48.4 },
] as const;

/* ── commands ──────────────────────────────────────────────────────────── */

/** Saves whatever has been entered so far; nothing is required for a draft. */
export async function saveProvisioningDraft(input: ProvisionDraft) {
  await mockLatency(280);
  db().draft = { ...input, entitlements: [...input.entitlements] };
  emit();
  return getProvisioningDraft();
}

export async function discardProvisioningDraft() {
  db().draft = null;
  emit();
}

/** The returned `setup` holds the first admin's activation code. It is shown once and never stored. */
export async function provisionTenant(input: ProvisionDraft, actorName: string): Promise<TenantRecord & { setup: Setup }> {
  await mockLatency(400);
  const data = db();
  const slug = input.slug.trim().toLowerCase();
  const organisationId = `org-${slug}`;
  if (data.tenants.some((tenant) => tenant.slug === slug) || allOrganisations().some((org) => org.id === organisationId)) {
    throw new Error("That tenant URL is already in use");
  }
  const adminEmail = input.adminEmail.trim().toLowerCase();
  if (emailHasAccount(adminEmail) || allUsers().some((user) => user.email.toLowerCase() === adminEmail)) {
    throw new Error("That admin email already has a BICMAS account");
  }
  data.sequence += 1;
  const sequence = data.sequence;
  const code = slug.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "NEW";
  const entitlements = entitlementOptions.filter((option) => input.entitlements.includes(option));
  const now = new Date();
  const admin: MockUser = {
    id: `user-${slug}-admin`,
    name: input.adminName.trim(),
    email: adminEmail,
    roleLabel: "Organisation Admin",
    portal: "organisation_admin",
    jobTitle: "Organisation Administrator",
    avatarUrl: initialsAvatar(input.adminName.trim()),
    organisationId,
    unreadNotifications: 0,
  };
  const record: TenantRecord = {
    id: `tenant-${sequence}`,
    organisationId,
    code,
    externalId: `${code}-${8800 + sequence}-N${sequence}`,
    name: input.legalName.trim(),
    slug,
    plan: input.plan,
    renewal: renewalFor(input.plan, now),
    shards: 1,
    status: "Provisioning",
    entitlements,
    users: 1,
    storageGb: 0,
    apiRequests: "0",
    adminUserId: admin.id,
    provisioningCompletesAt: new Date(now.getTime() + PROVISIONING_SECONDS * 1000).toISOString(),
    provisionedBy: actorName,
  };
  const setup = await createFirstAdmin({ user: admin, method: input.setupMethod ?? "code", actorName });
  registerProvisionedTenant({ id: organisationId, name: record.name, shortName: code }, admin);
  data.tenants = [record, ...data.tenants];
  data.draft = null;
  data.audits = [
    {
      id: `audit-${sequence}`,
      at: stamp(now),
      adminName: actorName,
      adminAvatar: avatarFor(actorName),
      category: "Provisioning",
      tenantExternalId: record.externalId,
      summary: `Provisioned ${record.name} on ${record.plan}; first admin ${admin.name} (${admin.email})`,
      sessionId: nextSessionId(),
    },
    ...data.audits,
  ];
  scheduleCompletion(record);
  emit();
  return { ...record, entitlements: [...record.entitlements], setup };
}

export async function updateTenantEntitlements(
  tenantId: string,
  entitlements: string[],
  actorName: string,
) {
  await mockLatency(280);
  const data = db();
  const current = data.tenants.find((tenant) => tenant.id === tenantId);
  if (!current) return null;
  const ordered = entitlementOptions.filter((option) => entitlements.includes(option));
  data.tenants = data.tenants.map((tenant) =>
    tenant.id === tenantId ? { ...tenant, entitlements: ordered } : tenant,
  );
  data.sequence += 1;
  data.audits = [
    {
      id: `audit-${data.sequence}`,
      at: stamp(),
      adminName: actorName,
      adminAvatar: avatarFor(actorName),
      category: "Provisioning",
      tenantExternalId: current.externalId,
      summary: `Updated entitlements: ${ordered.join(", ") || "none"}`,
      sessionId: nextSessionId(),
    },
    ...data.audits,
  ];
  emit();
  return tenantById(tenantId);
}

export async function assumeTenantAccess(input: {
  tenantId: string;
  ticketId: string;
  reason: string;
  actorName: string;
  actorAvatar: string;
}) {
  await mockLatency(400);
  const data = db();
  const tenant = data.tenants.find((item) => item.id === input.tenantId);
  if (!tenant) return null;
  data.sequence += 1;
  const auditId = `audit-${data.sequence}`;
  const sessionId = nextSessionId();
  const session: SupportSession = {
    id: sessionId,
    actorName: input.actorName,
    actorAvatar: input.actorAvatar,
    tenantId: tenant.id,
    ticketId: input.ticketId.replace(/^#/, ""),
    expiresLabel: "60m",
  };
  data.sessions = [session, ...data.sessions];
  data.audits = [
    {
      id: auditId,
      at: stamp(),
      adminName: input.actorName,
      adminAvatar: input.actorAvatar,
      category: "Assumed Access",
      tenantExternalId: tenant.externalId,
      summary: `Assumed access for Ticket #${session.ticketId}. ${input.reason.trim()}`,
      sessionId,
    },
    ...data.audits,
  ];
  emit();
  return { ...session };
}

export async function terminateSupportSession(sessionId: string, actorName: string) {
  await mockLatency(280);
  const data = db();
  const current = data.sessions.find((session) => session.id === sessionId);
  if (!current) return false;
  const tenant = data.tenants.find((item) => item.id === current.tenantId);
  data.sessions = data.sessions.filter((session) => session.id !== sessionId);
  data.sequence += 1;
  data.audits = [
    {
      id: `audit-${data.sequence}`,
      at: stamp(),
      adminName: actorName,
      adminAvatar: avatarFor(actorName),
      category: "Security",
      tenantExternalId: tenant?.externalId ?? current.tenantId,
      summary: `Force-terminated support session ${current.id}`,
      sessionId: current.id,
    },
    ...data.audits,
  ];
  emit();
  return true;
}

export async function createSupportTicket(input: {
  tenantId: string;
  category: string;
  priority: TicketPriority;
  actorName: string;
}) {
  await mockLatency(280);
  const data = db();
  const tenant = data.tenants.find((item) => item.id === input.tenantId);
  if (!tenant) return null;
  data.sequence += 1;
  const ticket: SupportTicket = {
    id: `TIC-${10200 + data.sequence}`,
    tenantId: tenant.id,
    category: input.category.trim(),
    status: "Open",
    priority: input.priority,
  };
  data.tickets = [ticket, ...data.tickets];
  data.audits = [
    {
      id: `audit-${data.sequence}`,
      at: stamp(),
      adminName: input.actorName,
      adminAvatar: avatarFor(input.actorName),
      category: "Security",
      tenantExternalId: tenant.externalId,
      summary: `Logged ticket #${ticket.id}: ${ticket.category}`,
      sessionId: nextSessionId(),
    },
    ...data.audits,
  ];
  emit();
  return { ...ticket };
}

export function auditExportText(rows: AuditEvent[]) {
  const header = "Timestamp\tAdmin\tCategory\tTenant\tSummary\tSession";
  const body = rows.map(
    (row) =>
      `${row.at}\t${row.adminName}\t${row.category}\t${row.tenantExternalId}\t${row.summary}\t${row.sessionId}`,
  );
  return [header, ...body].join("\n");
}
