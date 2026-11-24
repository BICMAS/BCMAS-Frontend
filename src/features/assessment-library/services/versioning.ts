/**
 * Version lifecycle shared by BICMAS master templates and organisation assessments.
 *
 * Pure functions over `{ versions }` so both libraries enforce the same rules
 * (BCMS Talent Assessment guide §2): one open (draft / in review) version at a time,
 * published / approved versions are immutable, publishing supersedes instead of
 * overwriting, a submitter cannot approve their own version, and every change is logged.
 */
import type {
  TemplateContent,
  TemplateItem,
  TemplateVersion,
  VersionEvent,
} from "../types";

export class LibraryError extends Error {}

export type Versioned = { versions: TemplateVersion[] };

let sequence = 100;

export function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

export function now() {
  return new Date().toISOString();
}

/** The version being worked on (draft / in review) if any. */
export function openVersion(entity: Versioned) {
  return entity.versions.find((v) => v.status === "draft" || v.status === "in_review") ?? null;
}

/** The live version: "Published" for masters, "Approved / Active" for organisation copies. */
export function publishedVersion(entity: Versioned) {
  return entity.versions.find((v) => v.status === "published") ?? null;
}

/** What a library shows for the entity: open work first, then the live version. */
export function currentVersion(entity: Versioned): TemplateVersion {
  return openVersion(entity) ?? publishedVersion(entity) ?? entity.versions[entity.versions.length - 1]!;
}

/** Problems block submission; warnings are shown but do not block. */
export function checkVersion(v: TemplateContent) {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!v.name.trim()) problems.push("The assessment needs a name.");
  if (v.competencies.length === 0) problems.push("Map at least one competency.");
  if (v.items.length === 0) problems.push("Add at least one question.");
  for (const item of v.items) {
    if (item.responseType === "case_response") {
      if (!item.scoring.rubric || item.scoring.rubric.length < 2) {
        problems.push(`${item.title}: add a scoring rubric with at least two levels.`);
      }
    } else {
      if (item.options.length < 2) problems.push(`${item.title}: add at least two answer options.`);
      if (!item.options.some((o) => o.id === item.scoring.correctOptionId)) {
        problems.push(`${item.title}: choose the keyed (correct) answer.`);
      }
    }
  }
  for (const competency of v.competencies) {
    if (!v.items.some((item) => item.competency === competency)) {
      warnings.push(`No question covers "${competency}".`);
    }
  }
  return { problems, warnings };
}

/** Candidate-facing copy of a version: answer keys and rubrics removed. */
export function candidateView(v: TemplateVersion) {
  return {
    name: v.name,
    durationMinutes: v.durationMinutes,
    items: v.items.map(({ id, title, text, responseType, options }) => ({ id, title, text, responseType, options })),
  };
}

export type VersionDiff = { field: string; from: string; to: string };

export function compareVersions(a: TemplateVersion, b: TemplateVersion): VersionDiff[] {
  const diffs: VersionDiff[] = [];
  const fields: Array<[string, (v: TemplateVersion) => string]> = [
    ["Name", (v) => v.name],
    ["Purpose", (v) => v.purpose],
    ["Assessment type", (v) => v.assessmentType],
    ["Role family", (v) => v.roleFamily],
    ["Target proficiency", (v) => v.targetProficiency],
    ["Competencies", (v) => v.competencies.join(", ")],
    ["Duration", (v) => `${v.durationMinutes} min`],
  ];
  for (const [field, get] of fields) {
    if (get(a) !== get(b)) diffs.push({ field, from: get(a), to: get(b) });
  }
  const aItems = new Map(a.items.map((item) => [item.id, item]));
  const bItems = new Map(b.items.map((item) => [item.id, item]));
  for (const [id, item] of bItems) {
    const before = aItems.get(id);
    if (!before) diffs.push({ field: `Question ${id.toUpperCase()}`, from: "—", to: `Added: ${item.title}` });
    else if (JSON.stringify(before) !== JSON.stringify(item)) {
      diffs.push({ field: `Question ${id.toUpperCase()}`, from: before.title, to: `Changed: ${item.title}` });
    }
  }
  for (const [id, item] of aItems) {
    if (!bItems.has(id)) diffs.push({ field: `Question ${id.toUpperCase()}`, from: item.title, to: "Removed" });
  }
  return diffs;
}

export function nextItemId(entity: Versioned) {
  const v = currentVersion(entity);
  const max = v.items.reduce((m, item) => Math.max(m, Number(item.id.replace(/\D/g, "")) || 0), 0);
  return `q${String(max + 1).padStart(2, "0")}`;
}

/* ── lifecycle commands (mutate the entity in place) ─────────────────────── */

export function logEvent(v: TemplateVersion, action: VersionEvent["action"], actor: string, note?: string) {
  v.history.push({ id: nextId("ev"), action, actor, at: now(), note });
}

function requireOpen(entity: Versioned, statuses: Array<"draft" | "in_review"> = ["draft"]) {
  const open = openVersion(entity);
  if (!open || !statuses.includes(open.status as "draft" | "in_review")) {
    throw new LibraryError(
      statuses.includes("in_review")
        ? "There is no version awaiting review."
        : "Only a draft version can be edited. Start a new version first.",
    );
  }
  return open;
}

function bumpMinor(v: string) {
  const [major = "1", minor = "0"] = v.split(".");
  return `${major}.${Number(minor) + 1}`;
}

/** A first draft (v0.1) built from settings, optionally pre-filled with items. */
export function firstDraft(content: TemplateContent, actor: string, note?: string): TemplateVersion {
  const v: TemplateVersion = {
    ...structuredClone(content),
    version: "0.1",
    status: "draft",
    createdBy: actor,
    createdAt: now(),
    history: [],
  };
  logEvent(v, "Created", actor, note);
  return v;
}

/** Copies the live version into a new draft; the live version stays unchanged. */
export function applyStartNewVersion(entity: Versioned, actor: string) {
  if (openVersion(entity)) throw new LibraryError("This assessment already has a version in progress.");
  const live = publishedVersion(entity);
  if (!live) throw new LibraryError("Only a live version can be used to start a new version.");
  const draft: TemplateVersion = {
    ...structuredClone(live),
    version: bumpMinor(live.version),
    status: "draft",
    createdBy: actor,
    createdAt: now(),
    submittedBy: undefined,
    reviewedBy: undefined,
    publishedAt: undefined,
    history: [],
    itemReviews: undefined,
  };
  logEvent(draft, "Created", actor, `Started from v${live.version}`);
  entity.versions.push(draft);
}

export function applyUpdateDraft(entity: Versioned, content: Omit<TemplateContent, "items">, actor: string) {
  const draft = requireOpen(entity);
  Object.assign(draft, structuredClone(content));
  logEvent(draft, "Edited", actor);
}

export function applySaveItem(entity: Versioned, item: TemplateItem, actor: string) {
  const draft = requireOpen(entity);
  if (draft.itemReviews) delete draft.itemReviews[item.id]; // a changed item needs a fresh review
  const index = draft.items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    draft.items[index] = structuredClone(item);
    logEvent(draft, "Item edited", actor, item.title);
  } else {
    draft.items.push(structuredClone(item));
    logEvent(draft, "Item added", actor, item.title);
  }
}

export function applyRemoveItem(entity: Versioned, itemId: string, actor: string) {
  const draft = requireOpen(entity);
  const item = draft.items.find((existing) => existing.id === itemId);
  draft.items = draft.items.filter((existing) => existing.id !== itemId);
  if (draft.itemReviews) delete draft.itemReviews[itemId];
  logEvent(draft, "Item removed", actor, item?.title);
}

export function applySubmit(entity: Versioned, actor: string) {
  const draft = requireOpen(entity);
  const { problems } = checkVersion(draft);
  if (problems.length) throw new LibraryError(problems[0]!);
  draft.status = "in_review";
  draft.submittedBy = actor;
  logEvent(draft, "Submitted for review", actor);
}

export function applyReturn(entity: Versioned, actor: string, note: string) {
  const review = requireOpen(entity, ["in_review"]);
  if (!note.trim()) throw new LibraryError("Say what needs to change.");
  review.status = "draft";
  logEvent(review, "Returned for changes", actor, note.trim());
}

/** The submitter withdraws their own version from review to keep editing. */
export function applyWithdraw(entity: Versioned, actor: string) {
  const review = requireOpen(entity, ["in_review"]);
  review.status = "draft";
  logEvent(review, "Returned for changes", actor, "Withdrawn by the submitter");
}

export function canApproveVersion(entity: Versioned, actor: string) {
  const open = openVersion(entity);
  return !!open && open.status === "in_review" && open.submittedBy !== actor;
}

export function applyApprove(entity: Versioned, actor: string, otherApproverLabel: string) {
  const review = requireOpen(entity, ["in_review"]);
  if (review.submittedBy === actor) {
    throw new LibraryError(`Another ${otherApproverLabel} must approve a version you submitted.`);
  }
  const nextVersion = review.version.startsWith("0.") ? "1.0" : review.version;
  const live = publishedVersion(entity);
  if (live) {
    live.status = "superseded";
    logEvent(live, "Superseded", actor, `Replaced by v${nextVersion}`);
  }
  review.version = nextVersion;
  review.status = "published";
  review.reviewedBy = actor;
  review.publishedAt = now();
  logEvent(review, "Approved and published", actor);
}

export function applyRetire(entity: Versioned, actor: string, reason: string) {
  const live = publishedVersion(entity);
  if (!live) throw new LibraryError("Only a live version can be retired.");
  if (openVersion(entity)) throw new LibraryError("Finish or discard the version in progress before retiring.");
  if (!reason.trim()) throw new LibraryError("Give a reason for retiring.");
  live.status = "retired";
  logEvent(live, "Retired", actor, reason.trim());
}

/** Removes an unpublished draft (never a live, superseded or retired version). */
export function applyDiscard(entity: Versioned) {
  const draft = requireOpen(entity);
  entity.versions = entity.versions.filter((v) => v !== draft);
}
