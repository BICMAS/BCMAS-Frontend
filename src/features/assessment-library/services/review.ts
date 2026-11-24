/**
 * Assessment Review & Approval checks (BCMS Talent Assessment guide §7). Pure functions.
 *
 * Flags missing competencies, duplicate questions, unclear wording and incomplete scoring so
 * the approver sees them before deciding. Flags never block on their own except incomplete
 * scoring (a version cannot be approved without a complete key or rubric for every item).
 */
import type { ItemReview, TemplateItem, TemplateVersion } from "../types";
import { similarity } from "./ai-builder";
import { checkVersion } from "./versioning";

export type ReviewFlag = {
  kind: "missing_competency" | "duplicate" | "unclear_wording" | "incomplete_scoring";
  itemId: string | null;
  message: string;
};

export const FLAG_LABEL: Record<ReviewFlag["kind"], string> = {
  missing_competency: "Missing competency",
  duplicate: "Duplicate question",
  unclear_wording: "Unclear wording",
  incomplete_scoring: "Incomplete scoring",
};

const VAGUE = /\b(tbd|tbc|todo|lorem|xxx|etc\.?)\b|\?\?|\.\.\./i;

function wordingIssues(item: TemplateItem): string[] {
  const issues: string[] = [];
  const text = item.text.trim();
  if (text.length < 30) issues.push("the question is very short and may be ambiguous");
  if (text.split(/\s+/).length > 70) issues.push("the question is long; consider splitting it");
  if (VAGUE.test(text)) issues.push("the question contains placeholder or vague text");
  if (/\bnot\b[^.?!]*\bnot\b/i.test(text)) issues.push("the question uses a double negative");
  if (item.responseType !== "case_response") {
    const texts = item.options.map((o) => o.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) issues.push("two answer options are identical");
    if (item.options.some((o) => o.text.trim().length < 3)) issues.push("an answer option is too short to be meaningful");
  }
  return issues;
}

function incompleteScoring(item: TemplateItem): string | null {
  if (item.responseType === "case_response") {
    const levels = (item.scoring.rubric ?? []).filter((l) => l.descriptor.trim());
    return levels.length < 2 ? "the rubric needs at least two described levels" : null;
  }
  if (!item.options.some((o) => o.id === item.scoring.correctOptionId)) return "no keyed (correct) answer is set";
  return null;
}

export function reviewFlags(v: TemplateVersion): ReviewFlag[] {
  const flags: ReviewFlag[] = [];
  for (const warning of checkVersion(v).warnings) {
    flags.push({ kind: "missing_competency", itemId: null, message: warning });
  }
  v.items.forEach((item, index) => {
    const scoring = incompleteScoring(item);
    if (scoring) flags.push({ kind: "incomplete_scoring", itemId: item.id, message: `${item.id.toUpperCase()}: ${scoring}.` });
    for (const issue of wordingIssues(item)) {
      flags.push({ kind: "unclear_wording", itemId: item.id, message: `${item.id.toUpperCase()}: ${issue}.` });
    }
    const earlier = v.items.slice(0, index).find((other) => similarity(other.text, item.text) >= 0.6);
    if (earlier) {
      flags.push({
        kind: "duplicate",
        itemId: item.id,
        message: `${item.id.toUpperCase()} is very similar to ${earlier.id.toUpperCase()} – ${earlier.title}.`,
      });
    }
  });
  return flags;
}

export type ReviewProgress = {
  total: number;
  approved: number;
  returned: number;
  rejected: number;
  pending: number;
  /** Every item approved and nothing incomplete: the version can be approved. */
  readyToApprove: boolean;
};

export function reviewProgress(v: TemplateVersion): ReviewProgress {
  const decisions = v.items.map((item) => v.itemReviews?.[item.id]?.decision);
  const count = (d: ItemReview["decision"]) => decisions.filter((x) => x === d).length;
  const approved = count("approved");
  const blocking = reviewFlags(v).some((f) => f.kind === "incomplete_scoring");
  return {
    total: v.items.length,
    approved,
    returned: count("returned"),
    rejected: count("rejected"),
    pending: decisions.filter((x) => x === undefined).length,
    readyToApprove: v.items.length > 0 && approved === v.items.length && !blocking,
  };
}
