/**
 * AI Assessment Builder logic (BCMS Talent Assessment guide §6). Pure functions, no UI.
 *
 *  - Turns an AI service assessment design (talent.draft_items) into draft library items,
 *    each carrying its source (competency criteria) and the AI model, prompt version, draft id
 *    and generation date.
 *  - Never invents competency requirements: items for a competency that is not in the
 *    selected role profile are flagged `outsideProfile` and excluded by default.
 *  - Recommends published templates with a reason, checks coverage and flags duplicates.
 * Everything produced here is a draft; approval happens in Assessment Review & Approval.
 */
import type { AssessmentDesignEnvelope, AssessmentQuestion, CompetencyRubric } from "@ai/contracts";

import type { RoleRecord } from "@/features/roles/types";

import type { Difficulty, TemplateItem, TemplateVersion } from "../types";

export type RoleCompetency = { name: string; level: string; category: "technical" | "behavioural" };

/** The competencies an organisation role profile requires (technical then behavioural). */
export function roleCompetencies(role: RoleRecord): RoleCompetency[] {
  return [
    ...role.technicalSkills.map((s) => ({ name: s.name, level: s.levelLabel, category: "technical" as const })),
    ...role.behaviouralSkills.map((name) => ({ name, level: "—", category: "behavioural" as const })),
  ];
}

const norm = (text: string) => text.trim().toLowerCase();

export function inProfile(competency: string, profile: RoleCompetency[]) {
  return profile.some((c) => norm(c.name) === norm(competency));
}

/** A proposed item, not yet in the assessment. */
export type DraftCandidate = {
  key: string;
  item: TemplateItem;
  /** The competency is not in the selected role profile: needs a person's decision. */
  outsideProfile: boolean;
  /** Framework skill id, used to regenerate items for one competency. */
  skillId: string | null;
  /** Criteria / competency definition the item is based on, shown as its source. */
  sourceTexts: string[];
  include: boolean;
};

function difficultyFor(level: number): Difficulty {
  if (level <= 2) return "foundational";
  if (level === 3) return "intermediate";
  return "advanced";
}

function shortTitle(q: AssessmentQuestion, competency: string) {
  const kind =
    q.type === "situational_judgement" ? "judgement" : q.type === "behavioural" ? "experience" : q.type === "technical" ? "technical" : "scenario";
  return `${competency} – ${kind}`.slice(0, 60);
}

function toItem(q: AssessmentQuestion, rubric: CompetencyRubric, envelope: AssessmentDesignEnvelope, key: string): TemplateItem {
  const provenance = envelope.draft.provenance;
  const criteria = rubric.criteria.filter((c) => q.expected_indicator_ids.includes(c.criterion_id));
  const source = `${rubric.skill_name} level ${q.target_level} criteria${
    criteria.length ? ` (${criteria.map((c) => c.criterion_id).join(", ")})` : ""
  } · role profile v${envelope.draft.payload.role_profile_version ?? "—"}`;
  const origin = {
    kind: "ai" as const,
    model: provenance.model,
    promptVersion: provenance.prompt_version,
    generatedAt: provenance.generated_at,
    draftId: envelope.draft.draft_id,
    source,
  };
  const base = {
    id: key,
    title: shortTitle(q, rubric.skill_name),
    text: q.prompt,
    competency: rubric.skill_name,
    difficulty: difficultyFor(q.target_level),
    level: q.target_level,
    origin,
  };
  if (q.options && q.options.length >= 2) {
    const best = [...q.options].sort((a, b) => b.score - a.score)[0]!;
    return {
      ...base,
      responseType: "sjt",
      options: q.options.map((o) => ({ id: o.option_key, text: o.text })),
      scoring: { points: 1, correctOptionId: best.option_key },
    };
  }
  const lookFors = q.look_fors.length ? q.look_fors.join("; ") : "the expected criteria";
  return {
    ...base,
    responseType: "case_response",
    options: [],
    scoring: {
      points: 4,
      rubric: [
        { score: 1, descriptor: "Little or no evidence of the expected criteria." },
        { score: 2, descriptor: q.feedback.developing },
        { score: 3, descriptor: `Shows most of: ${lookFors}.` },
        { score: 4, descriptor: q.feedback.strong },
      ],
    },
  };
}

/** Maps an AI design to draft candidates. Out-of-profile competencies start excluded. */
export function candidatesFromDesign(
  envelope: AssessmentDesignEnvelope,
  profile: RoleCompetency[],
  keyPrefix = "ai",
): DraftCandidate[] {
  const design = envelope.draft.payload;
  return design.questions.flatMap((q, index) => {
    const rubric = design.competencies.find((c) => c.skill_id === q.skill_id);
    if (!rubric) return [];
    const outside = !inProfile(rubric.skill_name, profile);
    const criteria = rubric.criteria.filter((c) => q.expected_indicator_ids.includes(c.criterion_id));
    return [
      {
        key: `${keyPrefix}-${envelope.draft.draft_id}-${index}`,
        item: toItem(q, rubric, envelope, `${keyPrefix}-${index}`),
        outsideProfile: outside,
        skillId: rubric.skill_id,
        sourceTexts: criteria.length ? criteria.map((c) => c.text) : [`${rubric.skill_name}: level ${q.target_level}`],
        include: !outside,
      },
    ];
  });
}

export type TemplateRecommendation = {
  templateId: string;
  version: TemplateVersion;
  matched: string[];
  score: number;
  reason: string;
};

/** Ranks published masters by how many of the role's competencies they cover. */
export function recommendTemplates(
  masters: Array<{ templateId: string; version: TemplateVersion }>,
  profile: RoleCompetency[],
): TemplateRecommendation[] {
  return masters
    .map(({ templateId, version }) => {
      const matched = version.competencies.filter((c) => inProfile(c, profile));
      const covered = version.items.filter((item) => inProfile(item.competency, profile)).length;
      return {
        templateId,
        version,
        matched,
        score: matched.length * 10 + covered,
        reason: matched.length
          ? `Covers ${matched.length} of ${profile.length} role competencies (${matched.join(", ")}) with ${covered} ready-made question${covered === 1 ? "" : "s"}.`
          : "",
      };
    })
    .filter((r) => r.matched.length > 0)
    .sort((a, b) => b.score - a.score);
}

/** Candidates copied from a template's items for the role's competencies (not AI-generated). */
export function candidatesFromTemplate(
  rec: { templateId: string; version: TemplateVersion },
  profile: RoleCompetency[],
): DraftCandidate[] {
  return rec.version.items
    .filter((item) => inProfile(item.competency, profile))
    .map((item) => ({
      key: `tpl-${rec.templateId}-${item.id}`,
      item: {
        ...structuredClone(item),
        origin: { kind: "template" as const, source: `BCMS master ${rec.version.name} v${rec.version.version} · ${item.id.toUpperCase()}` },
      },
      outsideProfile: false,
      skillId: null,
      sourceTexts: [`${rec.version.name} v${rec.version.version}, question ${item.id.toUpperCase()}`],
      include: true,
    }));
}

function words(text: string) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
}

/** Jaccard similarity of meaningful words; 0.6+ is treated as a likely duplicate. */
export function similarity(a: string, b: string) {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  wa.forEach((w) => {
    if (wb.has(w)) shared += 1;
  });
  return shared / (wa.size + wb.size - shared);
}

const DUPLICATE_THRESHOLD = 0.6;

/** For each candidate key: the existing or earlier candidate question it duplicates. */
export function findDuplicates(candidates: DraftCandidate[], existing: TemplateItem[]): Map<string, string> {
  const result = new Map<string, string>();
  candidates.forEach((candidate, index) => {
    const hitExisting = existing.find((item) => similarity(item.text, candidate.item.text) >= DUPLICATE_THRESHOLD);
    if (hitExisting) {
      result.set(candidate.key, `${hitExisting.id.toUpperCase()} – ${hitExisting.title}`);
      return;
    }
    const hitEarlier = candidates
      .slice(0, index)
      .find((other) => other.include && similarity(other.item.text, candidate.item.text) >= DUPLICATE_THRESHOLD);
    if (hitEarlier) result.set(candidate.key, `another draft: ${hitEarlier.item.title}`);
  });
  return result;
}

export type CoverageRow = { competency: string; level: string; existing: number; drafted: number };

/** Role competencies with existing and drafted question counts; gaps have neither. */
export function coverage(profile: RoleCompetency[], existing: TemplateItem[], drafted: TemplateItem[]): CoverageRow[] {
  return profile.map((c) => ({
    competency: c.name,
    level: c.level,
    existing: existing.filter((item) => norm(item.competency) === norm(c.name)).length,
    drafted: drafted.filter((item) => norm(item.competency) === norm(c.name)).length,
  }));
}
