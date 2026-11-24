/**
 * Central Assessment Library — BICMAS master templates (sample-data implementation).
 *
 * Mirrors the behaviour the backend must provide (BCMS Talent Assessment guide §2–4):
 *  - only BICMAS administrators (platform_super_admin) can create, edit, publish or retire;
 *  - published versions are immutable; changes happen in a new draft version;
 *  - Submit for Review → Approve and Publish, and the approver must not be the submitter;
 *  - publishing supersedes the previous published version instead of overwriting it;
 *  - every change is recorded in the version's history (who, what, when).
 * State lives in memory and sessionStorage so it survives a page refresh during testing.
 */
import type { UserPortal } from "@/types";

import type {
  ItemOption,
  MasterTemplate,
  QualityNotes,
  TemplateContent,
  TemplateItem,
  TemplateStatus,
  TemplateVersion,
  VersionEvent,
} from "../types";
import {
  LibraryError,
  applyApprove,
  applyDiscard,
  applyRemoveItem,
  applyReturn,
  applyRetire,
  applySaveItem,
  applyStartNewVersion,
  applySubmit,
  applyUpdateDraft,
  canApproveVersion,
  currentVersion,
  firstDraft,
  nextId,
  openVersion,
  publishedVersion,
} from "./versioning";

/* ── seed data ─────────────────────────────────────────────────────────── */

const OTHER_ADMIN = "Dayo Adeyemi";
const SEED_AUTHOR = "BICMAS Content Team";

function opts(...texts: string[]): ItemOption[] {
  return texts.map((text, index) => ({ id: `o${index + 1}`, text }));
}

function choice(
  id: string,
  title: string,
  text: string,
  competency: string,
  difficulty: TemplateItem["difficulty"],
  options: string[],
  correct: number,
  responseType: "single_choice" | "sjt" = "sjt",
): TemplateItem {
  return {
    id,
    title,
    text,
    responseType,
    options: opts(...options),
    competency,
    difficulty,
    scoring: { points: 1, correctOptionId: `o${correct}` },
  };
}

function written(
  id: string,
  title: string,
  text: string,
  competency: string,
  difficulty: TemplateItem["difficulty"],
): TemplateItem {
  return {
    id,
    title,
    text,
    responseType: "case_response",
    options: [],
    competency,
    difficulty,
    scoring: {
      points: 4,
      rubric: [
        { score: 1, descriptor: "Identifies the issue but gives no workable plan." },
        { score: 2, descriptor: "Workable plan with gaps in priorities or stakeholders." },
        { score: 3, descriptor: "Clear, prioritised plan that addresses the main stakeholders." },
        { score: 4, descriptor: "Clear plan, explicit trade-offs and measures of success." },
      ],
    },
  };
}

const SALES_ITEMS: TemplateItem[] = [
  choice("q01", "Prioritisation", "You have three outlet visits planned and a key account calls with an urgent stock issue. What do you do first?", "Planning", "intermediate", ["Finish the planned visits, then call back", "Call the key account, agree a plan, then re-sequence visits", "Ask your manager to handle the key account", "Cancel all visits for the day"], 2),
  choice("q02", "Customer issue", "A customer complains that a promotion was not applied. What is the most effective response?", "Customer focus", "foundational", ["Explain the promotion terms and close the call", "Apologise, check the order, correct it and confirm back", "Refer them to the call centre", "Offer a larger discount to end the complaint"], 2),
  choice("q03", "Route decision", "A road closure adds 90 minutes to your route. Which decision best protects the day's targets?", "Problem solving", "advanced", ["Keep the original order and work late", "Re-order visits by value and reschedule the lowest-value outlet", "Skip the furthest outlet without telling anyone", "Wait for the road to reopen"], 2),
  choice("q04", "Objection handling", "A retailer says your price is higher than a competitor's. What is the best first step?", "Negotiation", "intermediate", ["Match the price immediately", "Ask what the retailer values beyond price and show total value", "End the conversation politely", "Criticise the competitor's product"], 2),
  written("q05", "Territory plan", "Outline how you would grow volume by 10% in an underperforming territory over the next quarter.", "Commercial awareness", "advanced"),
];

const SERVICE_ITEMS: TemplateItem[] = [
  choice("q01", "Refund policy", "Within how many days can a customer return an unused product for a full refund under the standard policy?", "Product knowledge", "foundational", ["7 days", "14 days", "30 days", "90 days"], 3, "single_choice"),
  choice("q02", "Escalation", "When should a complaint be escalated to a supervisor?", "Customer focus", "intermediate", ["Whenever the customer asks", "When it exceeds your authority or SLA, or involves safety", "Only for written complaints", "Never; resolve everything yourself"], 2, "single_choice"),
  choice("q03", "Data protection", "A caller asks for a family member's account details. What do you do?", "Compliance", "intermediate", ["Share them if the caller knows the address", "Decline and explain how the account holder can authorise access", "Share only the balance", "Transfer to another team"], 2),
];

const OPS_ITEMS: TemplateItem[] = [
  choice("q01", "Shift shortage", "Two operators call in sick before a critical production run. What is your first action?", "Planning", "intermediate", ["Run the line at reduced speed without telling anyone", "Assess critical stations, reassign trained staff and inform stakeholders", "Cancel the run", "Ask volunteers to skip their breaks"], 2),
  written("q02", "Root cause", "Defect rates doubled this week on Line 3. Describe how you would find and fix the root cause.", "Problem solving", "advanced"),
];

const FINANCE_ITEMS: TemplateItem[] = [
  choice("q01", "Variance", "Actual costs are 12% above budget for the quarter. What should the first analysis step be?", "Financial analysis", "intermediate", ["Revise the budget to match", "Break the variance down by cost centre and driver", "Report it without comment", "Defer until year end"], 2, "single_choice"),
  choice("q02", "Accruals", "A service was received in March but invoiced in April. When is the expense recognised?", "Accounting principles", "foundational", ["April", "March", "When paid", "Split equally"], 2, "single_choice"),
  written("q03", "Investment case", "Assess whether the business should lease or buy a new delivery fleet. State the information you need and your method.", "Commercial awareness", "advanced"),
];

const KAM_ITEMS: TemplateItem[] = [
  written("q01", "Account plan", "A top-five account's volume fell 15% after a competitor's launch. Present a 90-day recovery plan.", "Account management", "advanced"),
  choice("q02", "Joint business plan", "Which element is essential in a joint business plan with a key account?", "Account management", "intermediate", ["Only your company's targets", "Shared objectives, agreed measures and review dates", "A fixed discount", "A list of products only"], 2, "single_choice"),
];

const ARCH_ITEMS: TemplateItem[] = [
  choice("q01", "Region failover", "A primary cloud region becomes unavailable during peak trading. Which design decision limits the impact most?", "Cloud Infrastructure Design", "advanced", ["Scale up the remaining instances in the same region", "Fail over to a warm standby in a second region with replicated data", "Restore last night's backup", "Wait for the provider to recover"], 2, "single_choice"),
  choice("q02", "Service boundaries", "Two teams keep breaking each other's releases through a shared database. What is the best next step?", "Microservices Design", "intermediate", ["Add more integration tests", "Split ownership so each service owns its data behind an API", "Merge the two teams", "Freeze releases"], 2),
  written("q03", "Executive briefing", "Explain to a non-technical executive why a platform investment should take priority over a new feature. Outline your key points.", "Strategic Influence", "advanced"),
];

const FIELD_ITEMS: TemplateItem[] = [
  choice("q01", "Van stock", "Your van stock count does not match the system. What do you do?", "Compliance", "foundational", ["Adjust the system yourself", "Recount, record the variance and report it the same day", "Ignore small differences", "Wait for the monthly audit"], 2),
];

function at(date: string) {
  return `${date}T09:00:00.000Z`;
}

function event(id: string, action: VersionEvent["action"], actor: string, date: string, note?: string): VersionEvent {
  return { id, action, actor, at: at(date), note };
}

function version(
  content: TemplateContent,
  v: string,
  status: TemplateVersion["status"],
  date: string,
  extra: Partial<TemplateVersion> = {},
): TemplateVersion {
  const history: VersionEvent[] = [event(`${v}-c`, "Created", SEED_AUTHOR, date)];
  if (status === "published" || status === "superseded" || status === "retired") {
    history.push(event(`${v}-s`, "Submitted for review", SEED_AUTHOR, date));
    history.push(event(`${v}-p`, "Approved and published", OTHER_ADMIN, date));
  }
  if (status === "superseded") history.push(event(`${v}-x`, "Superseded", OTHER_ADMIN, date));
  if (status === "retired") history.push(event(`${v}-r`, "Retired", OTHER_ADMIN, date, "Replaced by role-specific templates."));
  const published = status === "published" || status === "superseded" || status === "retired";
  return {
    ...structuredClone(content),
    version: v,
    status,
    createdBy: SEED_AUTHOR,
    createdAt: at(date),
    submittedBy: published ? SEED_AUTHOR : undefined,
    reviewedBy: published ? OTHER_ADMIN : undefined,
    publishedAt: published ? at(date) : undefined,
    history,
    ...extra,
  };
}

const EMPTY_QUALITY: QualityNotes = { reviewNotes: "", pilotFeedback: "", limitations: "" };

function seed(): MasterTemplate[] {
  const sales: TemplateContent = {
    name: "Sales Executive – Core",
    purpose: "Assess core field-sales judgement for entry and mid-level sales executive roles.",
    assessmentType: "situational_judgement",
    roleFamily: "Sales",
    targetProficiency: "Proficient",
    competencies: ["Planning", "Customer focus", "Problem solving", "Negotiation", "Commercial awareness"],
    durationMinutes: 35,
    items: SALES_ITEMS,
  };
  const finance: TemplateContent = {
    name: "Finance Analyst – Core",
    purpose: "Assess financial analysis and accounting fundamentals for analyst roles.",
    assessmentType: "technical_competency",
    roleFamily: "Finance",
    targetProficiency: "Proficient",
    competencies: ["Financial analysis", "Accounting principles", "Commercial awareness"],
    durationMinutes: 40,
    items: FINANCE_ITEMS.slice(0, 2),
  };
  return [
    {
      id: "tpl-sales-core",
      versions: [
        version({ ...sales, items: SALES_ITEMS.slice(0, 3) }, "1.0", "superseded", "2026-03-02"),
        version({ ...sales, items: SALES_ITEMS.slice(0, 4) }, "1.1", "superseded", "2026-06-15"),
        version(sales, "1.2", "published", "2026-09-10"),
      ],
      quality: {
        reviewNotes: "Reviewed by two sales leaders; wording simplified for non-native English speakers.",
        pilotFeedback: "Piloted with 42 sales executives across two organisations; average completion 31 minutes.",
        limitations: "Measures judgement in typical FMCG field scenarios; not suitable for B2B enterprise sales.",
      },
    },
    {
      id: "tpl-service-core",
      versions: [
        version(
          {
            name: "Customer Service – Core",
            purpose: "Check policy knowledge and service judgement for contact-centre roles.",
            assessmentType: "job_knowledge",
            roleFamily: "Customer Service",
            targetProficiency: "Developing",
            competencies: ["Product knowledge", "Customer focus", "Compliance"],
            durationMinutes: 25,
            items: SERVICE_ITEMS,
          },
          "1.0",
          "published",
          "2026-05-20",
        ),
      ],
      quality: { ...EMPTY_QUALITY, reviewNotes: "Policy references checked against the 2026 service standard." },
    },
    {
      id: "tpl-ops-supervisor",
      versions: [
        version(
          {
            name: "Operations Supervisor",
            purpose: "Assess shift planning and root-cause problem solving for production supervisors.",
            assessmentType: "problem_solving",
            roleFamily: "Operations",
            targetProficiency: "Proficient",
            competencies: ["Planning", "Problem solving", "People leadership"],
            durationMinutes: 30,
            items: OPS_ITEMS,
          },
          "0.4",
          "draft",
          "2026-11-05",
        ),
      ],
      quality: { ...EMPTY_QUALITY, limitations: "People leadership is not yet covered by any item." },
    },
    {
      id: "tpl-finance-core",
      versions: [
        version(finance, "1.1", "published", "2026-07-01"),
        version({ ...finance, items: FINANCE_ITEMS, durationMinutes: 45 }, "1.2", "in_review", "2026-11-12", {
          createdBy: OTHER_ADMIN,
          submittedBy: OTHER_ADMIN,
          history: [
            event("1.2-c", "Created", OTHER_ADMIN, "2026-11-10"),
            event("1.2-i", "Item added", OTHER_ADMIN, "2026-11-11", "Added Q03 – Investment case"),
            event("1.2-s", "Submitted for review", OTHER_ADMIN, "2026-11-12"),
          ],
        }),
      ],
      quality: { ...EMPTY_QUALITY, reviewNotes: "v1.2 adds a written case to cover Commercial awareness." },
    },
    {
      id: "tpl-kam-case",
      versions: [
        version(
          {
            name: "Key Account Manager – Case Study",
            purpose: "Assess account planning through a realistic recovery case.",
            assessmentType: "case_study",
            roleFamily: "Sales",
            targetProficiency: "Advanced",
            competencies: ["Account management"],
            durationMinutes: 45,
            items: KAM_ITEMS,
          },
          "1.0",
          "published",
          "2026-08-18",
        ),
      ],
      quality: EMPTY_QUALITY,
    },
    {
      id: "tpl-solutions-architect",
      versions: [
        version(
          {
            name: "Solutions Architect – Core",
            purpose: "Assess architecture judgement and stakeholder influence for senior technology roles.",
            assessmentType: "technical_competency",
            roleFamily: "Technology",
            targetProficiency: "Advanced",
            competencies: ["Cloud Infrastructure Design", "Microservices Design", "Strategic Influence"],
            durationMinutes: 35,
            items: ARCH_ITEMS,
          },
          "1.0",
          "published",
          "2026-10-20",
        ),
      ],
      quality: { ...EMPTY_QUALITY, reviewNotes: "Reviewed by two principal architects." },
    },
    {
      id: "tpl-field-legacy",
      versions: [
        version(
          {
            name: "Field Sales – Legacy",
            purpose: "Original field sales simulation.",
            assessmentType: "work_simulation",
            roleFamily: "Sales",
            targetProficiency: "Developing",
            competencies: ["Compliance"],
            durationMinutes: 20,
            items: FIELD_ITEMS,
          },
          "2.0",
          "retired",
          "2025-12-01",
        ),
      ],
      quality: EMPTY_QUALITY,
    },
  ];
}

/* ── store ─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = "bcms-central-library";
let templates: MasterTemplate[] = seed();
let loaded = false;
let revision = 0;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) templates = JSON.parse(raw) as MasterTemplate[];
  } catch {
    /* Keep the seed data when stored JSON cannot be read. */
  }
}

function save() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    /* Storage unavailable: changes still apply for this page. */
  }
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeLibrary(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function libraryRevision() {
  load();
  return revision;
}

/** Test helper: back to the seed data. */
export function resetLibrary() {
  templates = seed();
  loaded = true;
  revision += 1;
  listeners.forEach((listener) => listener());
}

/* ── queries ───────────────────────────────────────────────────────────── */

export {
  LibraryError,
  candidateView,
  checkVersion,
  compareVersions,
  currentVersion,
  nextItemId,
  openVersion,
  publishedVersion,
  type VersionDiff,
} from "./versioning";

export function canManageLibrary(portal: UserPortal) {
  return portal === "platform_super_admin";
}

export function templateStatus(template: MasterTemplate): TemplateStatus {
  if (publishedVersion(template)) return "published";
  if (openVersion(template)) return "draft";
  return "retired";
}

export type TemplateSummary = {
  id: string;
  name: string;
  assessmentType: TemplateContent["assessmentType"];
  roleFamily: string;
  competencies: string[];
  difficulties: string[];
  itemCount: number;
  status: TemplateStatus;
  /** Live version, or the open version when nothing is published. */
  version: string;
  /** Open draft / review on top of a published version. */
  pending: { version: string; status: "draft" | "in_review" } | null;
};

export function listTemplates(): TemplateSummary[] {
  load();
  return templates.map((template) => {
    const live = publishedVersion(template);
    const open = openVersion(template);
    const shown = live ?? currentVersion(template);
    return {
      id: template.id,
      name: shown.name,
      assessmentType: shown.assessmentType,
      roleFamily: shown.roleFamily,
      competencies: shown.competencies,
      difficulties: [...new Set(shown.items.map((item) => item.difficulty))],
      itemCount: shown.items.length,
      status: templateStatus(template),
      version: shown.version,
      pending: live && open ? { version: open.version, status: open.status as "draft" | "in_review" } : null,
    };
  });
}

export function getTemplate(id: string): MasterTemplate | null {
  load();
  const found = templates.find((template) => template.id === id);
  return found ? structuredClone(found) : null;
}

/**
 * What organisations may browse: the published version of every live master, read-only.
 * Drafts, in-review, superseded and retired versions are never exposed to organisations.
 */
export function listPublishedMasters(): Array<{ templateId: string; version: TemplateVersion }> {
  load();
  return templates.flatMap((template) => {
    const live = publishedVersion(template);
    return live ? [{ templateId: template.id, version: structuredClone(live) }] : [];
  });
}

export function getPublishedMaster(templateId: string) {
  return listPublishedMasters().find((m) => m.templateId === templateId) ?? null;
}

export function libraryCounts() {
  const list = listTemplates();
  return {
    all: list.length,
    published: list.filter((t) => t.status === "published").length,
    draft: list.filter((t) => t.status === "draft" || t.pending).length,
    retired: list.filter((t) => t.status === "retired").length,
  };
}

/* ── commands ──────────────────────────────────────────────────────────── */

function mutate(id: string, fn: (template: MasterTemplate) => void) {
  load();
  const template = templates.find((t) => t.id === id);
  if (!template) throw new LibraryError("Template not found.");
  fn(template);
  save();
}

export function createTemplate(content: Omit<TemplateContent, "items">, actor: string): string {
  load();
  const id = nextId("tpl");
  templates = [
    ...templates,
    { id, versions: [firstDraft({ ...content, items: [] }, actor)], quality: { ...EMPTY_QUALITY } },
  ];
  save();
  return id;
}

export function startNewVersion(id: string, actor: string) {
  mutate(id, (template) => applyStartNewVersion(template, actor));
}

export function updateDraft(id: string, content: Omit<TemplateContent, "items">, actor: string) {
  mutate(id, (template) => applyUpdateDraft(template, content, actor));
}

export function saveItem(id: string, item: TemplateItem, actor: string) {
  mutate(id, (template) => applySaveItem(template, item, actor));
}

export function removeItem(id: string, itemId: string, actor: string) {
  mutate(id, (template) => applyRemoveItem(template, itemId, actor));
}

export function updateQuality(id: string, quality: QualityNotes) {
  mutate(id, (template) => {
    template.quality = { ...quality };
  });
}

export function submitForReview(id: string, actor: string) {
  mutate(id, (template) => applySubmit(template, actor));
}

export function returnForChanges(id: string, actor: string, note: string) {
  mutate(id, (template) => applyReturn(template, actor, note));
}

/** Separation of duties: the person who submitted a version cannot approve it. */
export function canApprove(template: MasterTemplate, actor: string) {
  return canApproveVersion(template, actor);
}

export function approveAndPublish(id: string, actor: string) {
  mutate(id, (template) => applyApprove(template, actor, "BICMAS administrator"));
}

export function retireTemplate(id: string, actor: string, reason: string) {
  mutate(id, (template) => applyRetire(template, actor, reason));
}

/** Deletes an unpublished draft (never a published, superseded or retired version). */
export function discardDraft(id: string, actor: string) {
  load();
  const template = templates.find((t) => t.id === id);
  if (!template) throw new LibraryError("Template not found.");
  void actor;
  applyDiscard(template);
  if (template.versions.length === 0) templates = templates.filter((t) => t.id !== id);
  save();
}
