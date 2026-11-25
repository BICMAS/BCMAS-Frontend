/** Gap, priority and match rules (methodology §5–6). Pure functions. */
import type { AssessmentItem, CapabilityEvidence, GapPriority } from "../types";

export const EVIDENCE_MONTHS = 12;
export const DISAGREE_WORKING_DAYS = 10;

/** The level that counts: only a manager's (or second reviewer's) decision, never the self-rating. */
export function verifiedLevel(item: AssessmentItem): number | null {
  return item.verification?.level ?? null;
}

export function gapOf(item: AssessmentItem): number | null {
  const level = verifiedLevel(item);
  return level === null ? null : Math.max(0, item.required - level);
}

export function priorityOf(item: AssessmentItem): GapPriority {
  const gap = gapOf(item);
  if (gap === null) return "not_verified";
  if (gap === 0) return "met";
  return gap >= 2 || item.essential ? "critical" : "moderate";
}

export type MatchResult = {
  /** Null when no skill has a verified level yet. */
  percent: number | null;
  met: number;
  counted: number;
  total: number;
  gaps: number;
  critical: number;
};

/** Average of verified ÷ required, capped at 100% per skill. Unverified skills are left out. */
export function capabilityMatch(items: AssessmentItem[]): MatchResult {
  const counted = items.filter((i) => verifiedLevel(i) !== null);
  const ratios = counted.map((i) => Math.min(1, verifiedLevel(i)! / i.required));
  const priorities = items.map(priorityOf);
  return {
    percent: counted.length ? Math.round((100 * ratios.reduce((a, b) => a + b, 0)) / counted.length) : null,
    met: priorities.filter((p) => p === "met").length,
    counted: counted.length,
    total: items.length,
    gaps: priorities.filter((p) => p === "moderate" || p === "critical").length,
    critical: priorities.filter((p) => p === "critical").length,
  };
}

export function isRecent(evidence: CapabilityEvidence, now = new Date()) {
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - EVIDENCE_MONTHS);
  return new Date(`${evidence.workDate}T00:00:00`) >= new Date(limit.getFullYear(), limit.getMonth(), limit.getDate());
}

/** Advice for the reviewer; it does not block a decision. */
export function evidenceWarnings(item: AssessmentItem): string[] {
  const warnings: string[] = [];
  if (!item.evidence.length) warnings.push("No evidence has been added for this skill.");
  else if (!item.evidence.some((e) => isRecent(e))) warnings.push(`All evidence is more than ${EVIDENCE_MONTHS} months old.`);
  if (item.evidence.length === 1 && item.required >= 4) {
    warnings.push("Only one piece of evidence for a high level. Look for repeated performance.");
  }
  return warnings;
}

/** Last day to disagree: 10 working days (Monday to Friday) after release. */
export function disagreeBy(releasedAt: string): Date {
  const date = new Date(releasedAt);
  let left = DISAGREE_WORKING_DAYS;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) left -= 1;
  }
  date.setHours(23, 59, 59, 999);
  return date;
}
