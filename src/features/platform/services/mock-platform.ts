import { mockLatency } from "@/lib/mock/delay";

export type TenantStatus = "Active" | "MFA Pending" | "Provisioning" | "Suspended";
export type TenantPlan = "Enterprise Plus" | "Standard" | "Pilot / Trial";
export type TicketStatus = "Open" | "Assigned" | "Resolved";
export type TicketPriority = "High" | "Medium" | "Low";
export type AuditCategory = "Security" | "Assumed Access" | "Provisioning";

export const tenantPlans: TenantPlan[] = ["Enterprise Plus", "Standard", "Pilot / Trial"];
export const tenantRegions = [
  "AU-EAST-1 (Sydney)",
  "US-WEST-2 (Oregon)",
  "EU-CENTRAL-1 (Frankfurt)",
] as const;
export const entitlementOptions = [
  "AI Coaching",
  "L&D Library",
  "Multi-BU",
  "Assessments",
  "Reports",
  "SAML",
] as const;

export type TenantRecord = {
  id: string;
  code: string;
  externalId: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  renewal: string;
  region: string;
  shards: number;
  status: TenantStatus;
  entitlements: string[];
  users: number;
  storageGb: number;
  apiRequests: string;
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
  region: string;
  plan: TenantPlan;
  aiCoaching: boolean;
  multiBu: boolean;
  saml: boolean;
  adminName: string;
  adminEmail: string;
};

const ALEX_AVATAR =
  "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-9.jpg";
const SARAH_AVATAR =
  "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg";

let tenants: TenantRecord[] = [
  {
    id: "gec",
    code: "GEC",
    externalId: "GEC-8821-X9",
    name: "Global Enterprise Corp",
    slug: "gec",
    plan: "Enterprise Plus",
    renewal: "12 Jan 2025",
    region: "AU-EAST-1",
    shards: 3,
    status: "Active",
    entitlements: ["AI Coaching", "L&D Library", "Multi-BU"],
    users: 2450,
    storageGb: 12.4,
    apiRequests: "124k",
  },
  {
    id: "ths",
    code: "THS",
    externalId: "THS-4412-A2",
    name: "TechHub Solutions",
    slug: "techhub",
    plan: "Standard",
    renewal: "Monthly",
    region: "US-WEST-2",
    shards: 1,
    status: "MFA Pending",
    entitlements: ["Assessments", "Reports"],
    users: 420,
    storageGb: 2.1,
    apiRequests: "12k",
  },
];

let tickets: SupportTicket[] = [
  {
    id: "TIC-10291",
    tenantId: "gec",
    category: "SSO Configuration Error",
    status: "Assigned",
    priority: "High",
  },
  {
    id: "TIC-10285",
    tenantId: "ths",
    category: "Billing Inquiry",
    status: "Resolved",
    priority: "Low",
  },
];

let sessions: SupportSession[] = [
  {
    id: "SID_7721_AB",
    actorName: "Sarah Jenkins",
    actorAvatar: SARAH_AVATAR,
    tenantId: "gec",
    ticketId: "TIC-0982",
    expiresLabel: "42m",
  },
];

let audits: AuditEvent[] = [
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
];

let draft: ProvisionDraft | null = null;
let revision = 0;
let sequence = 30;
const listeners = new Set<() => void>();

function emit() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function subscribePlatform(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function platformRevision() {
  return revision;
}

export function listTenants() {
  return tenants.map((tenant) => ({ ...tenant, entitlements: [...tenant.entitlements] }));
}

export function listTickets() {
  return tickets.map((ticket) => ({ ...ticket }));
}

export function listSupportSessions() {
  return sessions.map((session) => ({ ...session }));
}

export function listAuditEvents() {
  return audits.map((event) => ({ ...event }));
}

export function getProvisioningDraft() {
  return draft ? { ...draft } : null;
}

export function tenantById(id: string) {
  return listTenants().find((tenant) => tenant.id === id) ?? null;
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

function stamp() {
  return "15 Nov 2026, 3:32 PM";
}

function nextSessionId() {
  sequence += 1;
  return `SID_${sequence}_PL`;
}

export async function saveProvisioningDraft(input: ProvisionDraft) {
  await mockLatency(280);
  draft = { ...input };
  emit();
  return getProvisioningDraft();
}

export async function provisionTenant(input: ProvisionDraft, actorName: string) {
  await mockLatency(400);
  const slug = input.slug.trim().toLowerCase();
  if (tenants.some((tenant) => tenant.slug === slug)) {
    throw new Error("That tenant URL is already in use");
  }
  sequence += 1;
  const code = slug.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "NEW";
  const entitlements = [
    input.aiCoaching ? "AI Coaching" : null,
    input.multiBu ? "Multi-BU" : null,
    input.saml ? "SAML" : null,
  ].filter((item): item is string => Boolean(item));
  const region = input.region.split(" ")[0] ?? input.region;
  const record: TenantRecord = {
    id: `tenant-${sequence}`,
    code,
    externalId: `${code}-${8800 + sequence}-N${sequence}`,
    name: input.legalName.trim(),
    slug,
    plan: input.plan,
    renewal: input.plan === "Standard" ? "Monthly" : "12 Jan 2026",
    region,
    shards: 1,
    status: "Provisioning",
    entitlements,
    users: 1,
    storageGb: 0,
    apiRequests: "0",
  };
  tenants = [record, ...tenants];
  draft = null;
  audits = [
    {
      id: `audit-${sequence}`,
      at: stamp(),
      adminName: actorName,
      adminAvatar: ALEX_AVATAR,
      category: "Provisioning",
      tenantExternalId: record.externalId,
      summary: `Provisioned ${record.name} on ${record.plan}`,
      sessionId: nextSessionId(),
    },
    ...audits,
  ];
  emit();
  return { ...record, entitlements: [...record.entitlements] };
}

export async function updateTenantEntitlements(
  tenantId: string,
  entitlements: string[],
  actorName: string,
) {
  await mockLatency(280);
  const current = tenants.find((tenant) => tenant.id === tenantId);
  if (!current) return null;
  tenants = tenants.map((tenant) =>
    tenant.id === tenantId ? { ...tenant, entitlements: [...entitlements] } : tenant,
  );
  sequence += 1;
  audits = [
    {
      id: `audit-${sequence}`,
      at: stamp(),
      adminName: actorName,
      adminAvatar: ALEX_AVATAR,
      category: "Provisioning",
      tenantExternalId: current.externalId,
      summary: `Updated entitlements: ${entitlements.join(", ") || "none"}`,
      sessionId: nextSessionId(),
    },
    ...audits,
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
  const tenant = tenants.find((item) => item.id === input.tenantId);
  if (!tenant) return null;
  sequence += 1;
  const sessionId = nextSessionId();
  const session: SupportSession = {
    id: sessionId,
    actorName: input.actorName,
    actorAvatar: input.actorAvatar,
    tenantId: tenant.id,
    ticketId: input.ticketId.replace(/^#/, ""),
    expiresLabel: "60m",
  };
  sessions = [session, ...sessions];
  audits = [
    {
      id: `audit-${sequence}`,
      at: stamp(),
      adminName: input.actorName,
      adminAvatar: input.actorAvatar,
      category: "Assumed Access",
      tenantExternalId: tenant.externalId,
      summary: `Assumed access for Ticket #${session.ticketId}. ${input.reason.trim()}`,
      sessionId,
    },
    ...audits,
  ];
  emit();
  return { ...session };
}

export async function terminateSupportSession(sessionId: string, actorName: string) {
  await mockLatency(280);
  const current = sessions.find((session) => session.id === sessionId);
  if (!current) return false;
  const tenant = tenants.find((item) => item.id === current.tenantId);
  sessions = sessions.filter((session) => session.id !== sessionId);
  sequence += 1;
  audits = [
    {
      id: `audit-${sequence}`,
      at: stamp(),
      adminName: actorName,
      adminAvatar: ALEX_AVATAR,
      category: "Security",
      tenantExternalId: tenant?.externalId ?? current.tenantId,
      summary: `Force-terminated support session ${current.id}`,
      sessionId: current.id,
    },
    ...audits,
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
  const tenant = tenants.find((item) => item.id === input.tenantId);
  if (!tenant) return null;
  sequence += 1;
  const ticket: SupportTicket = {
    id: `TIC-${10200 + sequence}`,
    tenantId: tenant.id,
    category: input.category.trim(),
    status: "Open",
    priority: input.priority,
  };
  tickets = [ticket, ...tickets];
  audits = [
    {
      id: `audit-${sequence}`,
      at: stamp(),
      adminName: input.actorName,
      adminAvatar: ALEX_AVATAR,
      category: "Security",
      tenantExternalId: tenant.externalId,
      summary: `Logged ticket #${ticket.id}: ${ticket.category}`,
      sessionId: nextSessionId(),
    },
    ...audits,
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
