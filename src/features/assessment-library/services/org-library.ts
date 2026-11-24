/**
 * Organisation Assessment Library — HRBP-owned assessments (sample-data implementation).
 *
 * Behaviour the backend must provide (BCMS Talent Assessment guide §2 and §5):
 *  - "Use Template" copies the published BICMAS master into a separate organisation record
 *    with its own ID, version and approval status, and keeps a reference to the source master
 *    and the exact master version copied. Changing the copy never changes the master.
 *  - Tenant separation: every read and write is scoped to the caller's organisation; another
 *    organisation's assessments are invisible and cannot be changed.
 *  - Same lifecycle as masters: Draft → In Review → Approved / Active → Retired, immutable
 *    approved versions, and every change in the version history.
 *  - Approving or returning a version belongs to Assessment Review & Approval (guide §7).
 */
import type { UserPortal } from "@/types";

import type {
  ItemReview,
  OrgAssessment,
  OrgLifecycle,
  TemplateContent,
  TemplateItem,
  TemplateVersion,
} from "../types";
import { getPublishedMaster, getTemplate } from "./central-library";
import { reviewProgress } from "./review";
import {
  LibraryError,
  applyApprove,
  applyDiscard,
  applyReturn,
  applyRemoveItem,
  applyRetire,
  applySaveItem,
  applyStartNewVersion,
  applySubmit,
  applyUpdateDraft,
  applyWithdraw,
  currentVersion,
  firstDraft,
  logEvent,
  nextId,
  nextItemId,
  openVersion,
  publishedVersion,
} from "./versioning";

/* ── seed data ─────────────────────────────────────────────────────────── */

const GEC = "org-gec";
const THS = "org-ths";
const OTHER_HRBP = "Tunde Bakare";
const APPROVER = "Grace Obi";

function interviewItem(id: string, title: string, text: string, competency: string): TemplateItem {
  return {
    id,
    title,
    text,
    responseType: "case_response",
    options: [],
    competency,
    difficulty: "intermediate",
    scoring: {
      points: 4,
      rubric: [
        { score: 1, descriptor: "Names the situation but gives no clear actions or example." },
        { score: 2, descriptor: "Gives an example with some actions but the result is unclear." },
        { score: 3, descriptor: "Describes specific actions, priorities and the outcome for the customer or business." },
        { score: 4, descriptor: "Specific actions, clear priorities, a measured outcome and what they learned." },
      ],
    },
  };
}

function seedVersion(
  content: TemplateContent,
  version: string,
  status: TemplateVersion["status"],
  date: string,
  author: string,
  note?: string,
): TemplateVersion {
  const at = `${date}T10:00:00.000Z`;
  const live = status === "published" || status === "superseded";
  const submitted = live || status === "in_review";
  return {
    ...structuredClone(content),
    version,
    status,
    createdBy: author,
    createdAt: at,
    submittedBy: submitted ? author : undefined,
    reviewedBy: live ? APPROVER : undefined,
    publishedAt: live ? at : undefined,
    history: [
      { id: `${version}-c`, action: "Created", actor: author, at, note },
      ...(submitted ? [{ id: `${version}-s`, action: "Submitted for review" as const, actor: author, at }] : []),
      ...(live ? [{ id: `${version}-p`, action: "Approved and published" as const, actor: APPROVER, at }] : []),
    ],
  };
}

function masterContent(templateId: string, version: string): TemplateContent {
  const template = getTemplate(templateId);
  const v = template?.versions.find((x) => x.version === version) ?? (template ? currentVersion(template) : null);
  if (!v) throw new Error(`Seed master ${templateId} v${version} is missing`);
  const { name, purpose, assessmentType, roleFamily, targetProficiency, competencies, durationMinutes, items } = v;
  return structuredClone({ name, purpose, assessmentType, roleFamily, targetProficiency, competencies, durationMinutes, items });
}

function seed(): OrgAssessment[] {
  const sales = masterContent("tpl-sales-core", "1.2");
  const service = masterContent("tpl-service-core", "1.0");
  return [
    {
      id: "oa-sales-custom",
      organisationId: GEC,
      source: { templateId: "tpl-sales-core", templateName: "Sales Executive – Core", version: "1.2" },
      linkedRole: "Sales Executive",
      versions: [
        seedVersion(
          { ...sales, name: "Sales Executive – Custom", durationMinutes: 30 },
          "1.0",
          "published",
          "2026-10-01",
          OTHER_HRBP,
          "Copied from BCMS master Sales Executive – Core v1.2",
        ),
      ],
    },
    {
      id: "oa-kam",
      organisationId: GEC,
      source: null,
      linkedRole: "Key Account Manager",
      versions: [
        seedVersion(
          {
            name: "Key Account Manager",
            purpose: "Assess key account planning for the Modern Trade team.",
            assessmentType: "case_study",
            roleFamily: "Sales",
            targetProficiency: "Advanced",
            competencies: ["Account management", "Negotiation"],
            durationMinutes: 40,
            items: [],
          },
          "0.3",
          "draft",
          "2026-11-14",
          OTHER_HRBP,
        ),
      ],
    },
    {
      id: "oa-service-custom",
      organisationId: GEC,
      source: { templateId: "tpl-service-core", templateName: "Customer Service – Core", version: "1.0" },
      linkedRole: "Customer Service Representative",
      versions: [
        seedVersion(
          { ...service, name: "Customer Service – Custom" },
          "1.0",
          "published",
          "2026-06-02",
          OTHER_HRBP,
          "Copied from BCMS master Customer Service – Core v1.0",
        ),
        seedVersion({ ...service, name: "Customer Service – Custom", durationMinutes: 20 }, "1.1", "in_review", "2026-11-18", OTHER_HRBP),
      ],
    },
    {
      // Approved structured interview set for the AI-avatar interview (guide §14): written questions + rubrics.
      id: "oa-sales-interview",
      organisationId: GEC,
      source: null,
      linkedRole: "Sales Executive",
      versions: [
        seedVersion(
          {
            name: "Sales Executive – Interview Set",
            purpose: "Structured, role-linked interview questions asked by the AI-avatar interviewer.",
            assessmentType: "situational_judgement",
            roleFamily: "Sales",
            targetProficiency: "Proficient",
            competencies: ["Customer focus", "Planning", "Negotiation", "Problem solving"],
            durationMinutes: 15,
            items: [
              interviewItem("q01", "Customer complaint", "Tell us about a time you resolved a complaint from an important customer. What did you do, and what was the outcome?", "Customer focus"),
              interviewItem("q02", "Planning a week", "How do you plan a week of outlet visits when you have more outlets than time? Walk us through your approach.", "Planning"),
              interviewItem("q03", "Negotiation", "Describe a negotiation with a retailer or distributor that you led. What did you agree, and how did you get there?", "Negotiation"),
              interviewItem("q04", "Solving a problem", "Tell us about a problem that stopped you hitting a target. How did you work out the cause and what did you change?", "Problem solving"),
            ],
          },
          "1.0",
          "published",
          "2026-10-05",
          OTHER_HRBP,
        ),
      ],
    },
    {
      id: "oa-ths-clinical",
      organisationId: THS,
      source: { templateId: "tpl-service-core", templateName: "Customer Service – Core", version: "1.0" },
      linkedRole: "Patient Services Advisor",
      versions: [
        seedVersion({ ...service, name: "Patient Services – Custom" }, "1.0", "published", "2026-09-09", "Ngozi Eze"),
      ],
    },
  ];
}

/* ── store ─────────────────────────────────────────────────────────────── */

const STORAGE_KEY = "bcms-org-library-v2";
let assessments: OrgAssessment[] | null = null;
let loaded = false;
let revision = 0;
const listeners = new Set<() => void>();

function all(): OrgAssessment[] {
  if (!assessments) assessments = seed();
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) assessments = JSON.parse(raw) as OrgAssessment[];
    } catch {
      /* Keep the seed data when stored JSON cannot be read. */
    }
  }
  return assessments;
}

function save() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(assessments));
  } catch {
    /* Storage unavailable: changes still apply for this page. */
  }
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeOrgLibrary(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function orgLibraryRevision() {
  all();
  return revision;
}

/** Test helper: back to the seed data. */
export function resetOrgLibrary() {
  assessments = seed();
  loaded = true;
  revision += 1;
  listeners.forEach((listener) => listener());
}

/* ── queries (always scoped to one organisation) ─────────────────────── */

export function canManageOrgLibrary(portal: UserPortal) {
  return portal === "hr_ld_admin";
}

export function lifecycle(assessment: OrgAssessment): OrgLifecycle {
  const open = openVersion(assessment);
  if (open?.status === "in_review") return "in_review";
  if (publishedVersion(assessment)) return "approved";
  if (open) return "draft";
  return "retired";
}

export type OrgAssessmentSummary = {
  id: string;
  name: string;
  source: OrgAssessment["source"];
  linkedRole: string | null;
  itemCount: number;
  lifecycle: OrgLifecycle;
  /** Live version, or the open version when nothing is approved yet. */
  version: string;
  /** Draft / review on top of an approved version. */
  pending: { version: string; status: "draft" | "in_review" } | null;
  hasDraft: boolean;
  inReview: boolean;
  /** Has an approved version that can be used (and later assigned to vacancies). */
  active: boolean;
};

function summarise(assessment: OrgAssessment): OrgAssessmentSummary {
  const live = publishedVersion(assessment);
  const open = openVersion(assessment);
  const shown = live ?? currentVersion(assessment);
  return {
    id: assessment.id,
    name: (open ?? shown).name,
    source: assessment.source,
    linkedRole: assessment.linkedRole,
    itemCount: shown.items.length,
    lifecycle: lifecycle(assessment),
    version: shown.version,
    pending: live && open ? { version: open.version, status: open.status as "draft" | "in_review" } : null,
    hasDraft: open?.status === "draft",
    inReview: open?.status === "in_review",
    active: live !== null,
  };
}

export function listOrgAssessments(organisationId: string): OrgAssessmentSummary[] {
  return all()
    .filter((a) => a.organisationId === organisationId)
    .map(summarise);
}

export function orgCounts(organisationId: string) {
  const list = listOrgAssessments(organisationId);
  return {
    all: list.length,
    drafts: list.filter((a) => a.hasDraft).length,
    inReview: list.filter((a) => a.inReview).length,
    approved: list.filter((a) => a.active).length,
    retired: list.filter((a) => a.lifecycle === "retired").length,
  };
}

/** Returns null for another organisation's assessment, exactly as if it did not exist. */
export function getOrgAssessment(organisationId: string, id: string): OrgAssessment | null {
  const found = all().find((a) => a.id === id && a.organisationId === organisationId);
  return found ? structuredClone(found) : null;
}

/**
 * One exact version of an organisation assessment (any status). Candidate attempts always use
 * the exact version a vacancy was approved with, even after newer versions are approved.
 */
export function getAssessmentVersion(organisationId: string, assessmentId: string, version: string) {
  const found = all().find((a) => a.id === assessmentId && a.organisationId === organisationId);
  const v = found?.versions.find((x) => x.version === version);
  return v ? structuredClone(v) : null;
}

/** Copies of a master this organisation already has (to warn before making another). */
export function copiesOfMaster(organisationId: string, templateId: string) {
  return listOrgAssessments(organisationId).filter((a) => a.source?.templateId === templateId);
}

/* ── commands ──────────────────────────────────────────────────────────── */

function mutate(organisationId: string, id: string, fn: (assessment: OrgAssessment) => void) {
  const assessment = all().find((a) => a.id === id && a.organisationId === organisationId);
  if (!assessment) throw new LibraryError("Assessment not found in your organisation.");
  fn(assessment);
  save();
}

/** "Use Template": a new organisation-owned copy of the published master. The master is not touched. */
export function copyFromMaster(
  organisationId: string,
  templateId: string,
  input: { name: string; linkedRole: string | null },
  actor: string,
): string {
  const master = getPublishedMaster(templateId);
  if (!master) throw new LibraryError("Only published BCMS templates can be copied.");
  if (!input.name.trim()) throw new LibraryError("Give your copy a name.");
  const { name, purpose, assessmentType, roleFamily, targetProficiency, competencies, durationMinutes, items } =
    master.version;
  const content: TemplateContent = structuredClone({
    name,
    purpose,
    assessmentType,
    roleFamily,
    targetProficiency,
    competencies,
    durationMinutes,
    items,
  });
  const id = nextId("oa");
  all().push({
    id,
    organisationId,
    source: { templateId, templateName: name, version: master.version.version },
    linkedRole: input.linkedRole,
    versions: [
      firstDraft(
        { ...content, name: input.name.trim() },
        actor,
        `Copied from BCMS master ${name} v${master.version.version}`,
      ),
    ],
  });
  save();
  return id;
}

/** "Create Organisation Assessment": an assessment that starts empty and has no source master. */
export function createOrgAssessment(
  organisationId: string,
  settings: Omit<TemplateContent, "items">,
  linkedRole: string | null,
  actor: string,
): string {
  const id = nextId("oa");
  all().push({
    id,
    organisationId,
    source: null,
    linkedRole,
    versions: [firstDraft({ ...settings, items: [] }, actor, "Created by the organisation")],
  });
  save();
  return id;
}

/** "Customise" an approved assessment: a new draft version; the approved one stays in use. */
export function startOrgVersion(organisationId: string, id: string, actor: string) {
  mutate(organisationId, id, (a) => applyStartNewVersion(a, actor));
}

export function updateOrgDraft(
  organisationId: string,
  id: string,
  settings: Omit<TemplateContent, "items">,
  linkedRole: string | null,
  actor: string,
) {
  mutate(organisationId, id, (a) => {
    applyUpdateDraft(a, settings, actor);
    a.linkedRole = linkedRole;
  });
}

export function saveOrgItem(organisationId: string, id: string, item: TemplateItem, actor: string) {
  mutate(organisationId, id, (a) => applySaveItem(a, item, actor));
}

/**
 * Adds reviewed builder items (AI drafts or template questions) to the open draft.
 * Items get the next free question ids, their competencies join the draft's list, and the
 * version history records how many came from AI and which model produced them.
 */
export function addItemsToDraft(
  organisationId: string,
  id: string,
  items: TemplateItem[],
  linkedRole: string | null,
  actor: string,
): string[] {
  const added: string[] = [];
  mutate(organisationId, id, (a) => {
    const draft = openVersion(a);
    if (!draft || draft.status !== "draft") {
      throw new LibraryError("Items can only be added to a draft version. Start a new version first.");
    }
    if (items.length === 0) throw new LibraryError("Choose at least one draft item to save.");
    for (const item of items) {
      const itemId = nextItemId(a);
      applySaveItem(a, { ...structuredClone(item), id: itemId }, actor);
      added.push(itemId);
      if (!draft.competencies.includes(item.competency)) draft.competencies.push(item.competency);
    }
    if (linkedRole && !a.linkedRole) a.linkedRole = linkedRole;
    const ai = items.filter((item) => item.origin?.kind === "ai");
    const models = [...new Set(ai.map((item) => (item.origin?.kind === "ai" ? item.origin.model : "")))];
    logEvent(
      draft,
      "Edited",
      actor,
      `Added ${items.length} item${items.length === 1 ? "" : "s"} from the AI Assessment Builder` +
        (ai.length ? ` (${ai.length} AI-drafted by ${models.join(", ")}; still drafts until approved)` : ""),
    );
  });
  return added;
}

export function removeOrgItem(organisationId: string, id: string, itemId: string, actor: string) {
  mutate(organisationId, id, (a) => applyRemoveItem(a, itemId, actor));
}

export function submitForApproval(organisationId: string, id: string, actor: string) {
  mutate(organisationId, id, (a) => applySubmit(a, actor));
}

export function withdrawFromReview(organisationId: string, id: string, actor: string) {
  mutate(organisationId, id, (a) => {
    const open = openVersion(a);
    if (open?.submittedBy !== actor) throw new LibraryError("Only the person who submitted it can withdraw it.");
    applyWithdraw(a, actor);
  });
}

/* ── Assessment Review & Approval (guide §7) ──────────────────────────────── */

/** HRBPs approve, but never a version they submitted themselves. */
export function canReview(assessment: OrgAssessment, actor: string, portal: UserPortal) {
  const open = openVersion(assessment);
  return canManageOrgLibrary(portal) && open?.status === "in_review" && open.submittedBy !== actor;
}

function requireReviewable(a: OrgAssessment, actor: string) {
  const open = openVersion(a);
  if (!open || open.status !== "in_review") throw new LibraryError("This assessment is not waiting for review.");
  if (open.submittedBy === actor) throw new LibraryError("Another approver must review a version you submitted.");
  return open;
}

export function reviewItem(
  organisationId: string,
  id: string,
  itemId: string,
  decision: ItemReview["decision"],
  comment: string,
  actor: string,
) {
  mutate(organisationId, id, (a) => {
    const open = requireReviewable(a, actor);
    const item = open.items.find((i) => i.id === itemId);
    if (!item) throw new LibraryError("Item not found.");
    if (decision !== "approved" && !comment.trim()) {
      throw new LibraryError(decision === "rejected" ? "Say why the item is rejected." : "Say what needs to change.");
    }
    open.itemReviews = {
      ...open.itemReviews,
      [itemId]: { decision, comment: comment.trim() || undefined, reviewer: actor, at: new Date().toISOString() },
    };
    const action = decision === "approved" ? "Item approved" : decision === "returned" ? "Item returned" : "Item rejected";
    logEvent(open, action, actor, `${itemId.toUpperCase()} – ${item.title}${comment.trim() ? `: ${comment.trim()}` : ""}`);
  });
}

/** Approves the whole version and makes it the active one; every item must be approved first. */
export function approveOrgVersion(organisationId: string, id: string, actor: string) {
  mutate(organisationId, id, (a) => {
    const open = requireReviewable(a, actor);
    const progress = reviewProgress(open);
    if (!progress.readyToApprove) {
      throw new LibraryError(
        progress.pending
          ? `Review every item first (${progress.pending} still pending).`
          : "Some items were returned or rejected. Return the assessment for changes instead.",
      );
    }
    applyApprove(a, actor, "approver");
  });
}

/** Sends the version back to draft with the approver's comments (item comments are kept). */
export function returnOrgVersion(organisationId: string, id: string, actor: string, note: string) {
  mutate(organisationId, id, (a) => {
    requireReviewable(a, actor);
    applyReturn(a, actor, note);
  });
}

/**
 * Approved, active versions that can be assigned to vacancies (guide §7: only an approved,
 * published version can be assigned). Vacancies store the exact id + version they use.
 */
export function listAssignableAssessments(organisationId: string) {
  return all()
    .filter((a) => a.organisationId === organisationId)
    .flatMap((a) => {
      const live = publishedVersion(a);
      return live ? [{ assessmentId: a.id, version: structuredClone(live), linkedRole: a.linkedRole }] : [];
    });
}

export function retireOrgAssessment(organisationId: string, id: string, actor: string, reason: string) {
  mutate(organisationId, id, (a) => applyRetire(a, actor, reason));
}

export function discardOrgDraft(organisationId: string, id: string) {
  const list = all();
  const assessment = list.find((a) => a.id === id && a.organisationId === organisationId);
  if (!assessment) throw new LibraryError("Assessment not found in your organisation.");
  applyDiscard(assessment);
  if (assessment.versions.length === 0) assessments = list.filter((a) => a !== assessment);
  save();
}
