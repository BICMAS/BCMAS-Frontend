"""Evidence-based scoring (docs/ai/TALENT_ASSESSMENT_AGENT.md §5).

The model never chooses a score. For each competency:

1. **Criteria** are the framework indicators of that skill from ``required − 2`` up to
   ``required + 1``, plus any indicator an assessment item was designed to evidence.
2. **Evidence:**
   * open responses → the model judges each criterion ``met / partial / not_met /
     not_evidenced`` with verbatim quotes (validated: every criterion once, quotes
     verbatim from relevant responses, no decision or personal-attribute language);
   * keyed SJT options → deterministic: an option's indicators are ``met`` when the
     option's score ≥ the indicator's level (else ``partial``); expected indicators the
     chosen option does not carry are ``not_met``;
   * self-reported text (self-assessments) can at most make a criterion ``partial``;
   * self/manager *ratings* are claims, compared with the result, never used as evidence.
3. **Merge:** the strongest judgement per criterion wins (met > partial > not_met > not_evidenced).
4. **Level rule** (``determine_level``): coverage(L) = (met + ½·partial) / criteria(L).
   ``demonstrated`` ≥ 0.75; ``partially`` ≥ 0.25; ``not_demonstrated`` below that with
   evidence; ``no_evidence`` otherwise. The score is the highest demonstrated level with no
   ``not_demonstrated`` level beneath it. With no demonstrated level there is **no score**.
   Gaps and confidence are derived from the result.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field

from cfp_ai.agents.common import DECISION_LANGUAGE
from cfp_ai.agents.talent.models import (
    CompetencyScore,
    CriterionResult,
    EvaluationCriterion,
    EvidenceRef,
    Judgement,
    LevelResult,
    LevelStatus,
    RatingClaim,
    Respondent,
)
from cfp_ai.integrations.backend.dto import AssessmentItemDTO, RubricRowDTO, SkillDTO
from cfp_ai.schemas.public import ResponseQuote, ValidationIssue

SCORING_RULE = "talent.level_rule@v1"
SCORING_RULE_TEXT = (
    "Score = highest proficiency level whose criteria (framework indicators) are at least 75% covered by "
    "evidence (met = 1, partial = 0.5), with no lower assessed level below 25%. No demonstrated level → "
    "no score; the assessor decides. Self- and manager ratings are compared, never counted as evidence."
)
DEMONSTRATED, PARTIALLY = 0.75, 0.25
_RANK: dict[Judgement, int] = {"met": 3, "partial": 2, "not_met": 1, "not_evidenced": 0}

# Personal attributes and potential must never be inferred (AI_TECHNICAL_SPEC.md §14.7).
POTENTIAL_LANGUAGE = re.compile(
    # "has potential" about a person, not "has potential risks/issues" about a design (QA F5).
    r"\b(high[- ]potential|has (?:great |high |real )?potential"
    r"(?!\s+(?:risks?|issues?|problems?|impacts?|concerns?|costs?|savings?|benefits?|for\b))|"
    r"potential to (?:become|lead|grow)|"
    r"natural(?:ly)? (?:leader|talent|gifted)|personality|attitude problem|culture fit|cultural fit|"
    r"his age|her age|their age|too (?:young|old)|gender|ethnic\w*|nationality|religio\w*|disab\w*|"
    r"pregnan\w*|maternity|accent)\b",
    re.IGNORECASE,
)


def language_issues(text: str, path: str) -> list[ValidationIssue]:
    issues = []
    if DECISION_LANGUAGE.search(text):
        issues.append(
            ValidationIssue(
                code="decision_language",
                message="must not state readiness or a hiring/promotion decision",
                path=path,
            )
        )
    if POTENTIAL_LANGUAGE.search(text):
        issues.append(
            ValidationIssue(
                code="unsupported_inference",
                message="must not infer potential or personal attributes",
                path=path,
            )
        )
    return issues


def normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


# ── inputs ───────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class ResponseText:
    response_item_id: str
    respondent: Respondent
    item_type: str
    question: str
    text: str

    @property
    def self_reported(self) -> bool:
        return self.item_type == "self_assessment"


@dataclass
class RowInputs:
    row: RubricRowDTO
    skill: SkillDTO
    criteria: list[EvaluationCriterion]
    texts: list[ResponseText] = field(default_factory=list)
    keyed: list[EvidenceRef] = field(default_factory=list)  # one per selected option
    keyed_judgements: dict[str, tuple[Judgement, EvidenceRef]] = field(default_factory=dict)
    ratings: list[tuple[Respondent, str, int]] = field(default_factory=list)


def select_criteria(
    skill: SkillDTO, required_level: int, extra_ids: Iterable[str] = ()
) -> list[EvaluationCriterion]:
    low, high = max(1, required_level - 2), min(5, required_level + 1)
    extra = set(extra_ids)
    criteria = [
        EvaluationCriterion(criterion_id=ind.id, skill_id=skill.id, level=lvl.level, text=ind.text)
        for lvl in sorted(skill.levels, key=lambda x: x.level)
        for ind in lvl.indicators
        if low <= lvl.level <= high or ind.id in extra
    ]
    return criteria


def keyed_judgements(
    item: AssessmentItemDTO, response_item_id: str, selected: str, levels: dict[str, int]
) -> dict[str, tuple[Judgement, EvidenceRef]]:
    """Deterministic SJT scoring from the keyed options designed by the assessment author."""
    option = next((o for o in item.options or [] if o.option_key == selected), None)
    if option is None:
        return {}
    ref = EvidenceRef(
        kind="keyed_option",
        response_item_id=response_item_id,
        respondent=item.respondent,
        item_type=item.type,
        option_key=option.option_key,
        option_score=option.score,
    )
    result: dict[str, tuple[Judgement, EvidenceRef]] = {}
    for ind in option.indicator_ids:
        if ind in levels:
            result[ind] = ("met" if option.score >= levels[ind] else "partial", ref)
    for ind in item.expected_indicator_ids:
        if ind in levels and ind not in result:
            result[ind] = ("not_met", ref)
    return result


# ── model judgement ──────────────────────────────────────────────────────────


class _Quote(BaseModel):
    response_item_id: str
    quote: str = Field(max_length=500)


class _CriterionJudgement(BaseModel):
    criterion_id: str
    judgement: Judgement
    evidence: list[_Quote] = Field(default_factory=list, max_length=3)


class RowJudgement(BaseModel):
    judgements: list[_CriterionJudgement]
    rationale: str = Field(max_length=1500)


def judgement_validator(criteria: Sequence[EvaluationCriterion], texts: Sequence[ResponseText]) -> Any:
    ids = [c.criterion_id for c in criteria]
    sources = {t.response_item_id: normalise(t.text) for t in texts}

    def check(output: RowJudgement) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        seen = [j.criterion_id for j in output.judgements]
        for missing in sorted(set(ids) - set(seen)):
            issues.append(
                ValidationIssue(code="missing_criterion", message=f"judge {missing}", path="judgements")
            )
        for i, j in enumerate(output.judgements):
            path = f"judgements[{i}]"
            if j.criterion_id not in ids:
                issues.append(
                    ValidationIssue(code="unknown_indicator", message=f"'{j.criterion_id}'", path=path)
                )
            elif seen.count(j.criterion_id) > 1:
                issues.append(
                    ValidationIssue(code="duplicate", message="judge each criterion once", path=path)
                )
            if j.judgement in ("met", "partial") and not j.evidence:
                issues.append(
                    ValidationIssue(code="missing_evidence", message="met/partial needs a quote", path=path)
                )
            if j.judgement == "not_evidenced" and j.evidence:
                issues.append(
                    ValidationIssue(
                        code="contradiction", message="not_evidenced cannot cite evidence", path=path
                    )
                )
            for k, quote in enumerate(j.evidence):
                source = sources.get(quote.response_item_id)
                if source is None:
                    issues.append(
                        ValidationIssue(
                            code="unknown_id",
                            message=f"'{quote.response_item_id}'",
                            path=f"{path}.evidence[{k}]",
                        )
                    )
                elif not normalise(quote.quote) or normalise(quote.quote) not in source:
                    issues.append(
                        ValidationIssue(
                            code="quote_not_in_source",
                            message="quote is not verbatim",
                            path=f"{path}.evidence[{k}]",
                        )
                    )
        issues.extend(language_issues(output.rationale, "rationale"))
        return issues

    return check


# ── merge, level rule, confidence ────────────────────────────────────────────


def merge(inputs: RowInputs, model: RowJudgement | None) -> list[CriterionResult]:
    by_text = {t.response_item_id: t for t in inputs.texts}
    ai = {j.criterion_id: j for j in (model.judgements if model else [])}
    results: list[CriterionResult] = []
    for criterion in inputs.criteria:
        judgement: Judgement = "not_evidenced"
        evidence: list[EvidenceRef] = []
        basis: Literal["ai_judgement", "keyed_option", "combined", "none"] = "none"
        if (mj := ai.get(criterion.criterion_id)) is not None and mj.judgement != "not_evidenced":
            refs = []
            for q in mj.evidence:
                source = by_text[q.response_item_id]
                refs.append(
                    EvidenceRef(
                        kind="quote",
                        response_item_id=q.response_item_id,
                        respondent=source.respondent,
                        item_type=source.item_type,
                        quote=q.quote,
                        self_reported=source.self_reported,
                    )
                )
            judgement = mj.judgement
            if judgement == "met" and refs and all(r.self_reported for r in refs):
                judgement = "partial"  # self-reported text alone cannot fully evidence a criterion
            evidence, basis = refs, "ai_judgement"
        if (keyed := inputs.keyed_judgements.get(criterion.criterion_id)) is not None:
            kj, ref = keyed
            if _RANK[kj] > _RANK[judgement]:
                judgement = kj
            evidence = [*evidence, ref]
            basis = "combined" if basis == "ai_judgement" else "keyed_option"
        results.append(
            CriterionResult(
                criterion_id=criterion.criterion_id,
                level=criterion.level,
                text=criterion.text,
                judgement=judgement,
                evidence=evidence,
                basis=basis,
            )
        )
    return results


def level_results(criteria: Sequence[CriterionResult]) -> list[LevelResult]:
    out: list[LevelResult] = []
    for level in sorted({c.level for c in criteria}):
        at = [c for c in criteria if c.level == level]
        coverage = sum(
            1.0 if c.judgement == "met" else 0.5 if c.judgement == "partial" else 0.0 for c in at
        ) / len(at)
        status: LevelStatus
        if all(c.judgement == "not_evidenced" for c in at):
            status = "no_evidence"
        elif coverage >= DEMONSTRATED:
            status = "demonstrated"
        elif coverage >= PARTIALLY:
            status = "partially"
        else:
            status = "not_demonstrated"
        out.append(LevelResult(level=level, status=status, coverage=round(coverage, 3)))
    return out


def determine_level(levels: Sequence[LevelResult]) -> tuple[int | None, str]:
    score: int | None = None
    blocked_at: int | None = None
    for result in sorted(levels, key=lambda r: r.level):
        if result.status == "not_demonstrated" and blocked_at is None:
            blocked_at = result.level
        if result.status == "demonstrated" and blocked_at is None:
            score = result.level
    shown = ", ".join(
        f"L{r.level} {r.status} ({r.coverage:.0%})" for r in sorted(levels, key=lambda r: r.level)
    )
    if score is None:
        return None, f"No assessed level is demonstrated by the evidence [{shown}]; the assessor decides."
    reason = f"Level {score} is the highest level demonstrated by the criteria evidence [{shown}]."
    if blocked_at is not None and blocked_at > score:
        reason += f" Level {blocked_at} criteria were not demonstrated."
    return score, reason


def confidence(score: int | None, criteria: Sequence[CriterionResult]) -> Literal["low", "medium", "high"]:
    if score is None:
        return "low"
    supporting = [
        e for c in criteria if c.level == score and c.judgement in ("met", "partial") for e in c.evidence
    ]
    if supporting and all(e.self_reported for e in supporting):
        return "low"
    sources = {e.response_item_id for e in supporting}
    return "high" if len(sources) >= 2 else "medium"


def rating_claims(ratings: Sequence[tuple[Respondent, str, int]], score: int | None) -> list[RatingClaim]:
    claims = []
    for respondent, item_id, rating in ratings:
        alignment: Literal["aligned", "above_evidence", "below_evidence", "not_comparable"]
        if score is None:
            alignment = "not_comparable"
        elif rating == score:
            alignment = "aligned"
        else:
            alignment = "above_evidence" if rating > score else "below_evidence"
        claims.append(
            RatingClaim(respondent=respondent, response_item_id=item_id, rating=rating, alignment=alignment)
        )
    return claims


def competency_score(inputs: RowInputs, model: RowJudgement | None) -> CompetencyScore:
    criteria = merge(inputs, model)
    levels = level_results(criteria)
    score, determination = determine_level(levels)
    required = inputs.row.required_level
    quotes: list[ResponseQuote] = []
    for c in criteria:
        if c.judgement in ("met", "partial"):
            for e in c.evidence:
                if e.kind == "quote" and e.quote:
                    quote = ResponseQuote(response_item_id=e.response_item_id, quote=e.quote)
                    if quote not in quotes:
                        quotes.append(quote)
    for e in inputs.keyed:
        q = ResponseQuote(response_item_id=e.response_item_id, quote=f"Selected option {e.option_key}.")
        if q not in quotes:
            quotes.append(q)
    met = [c.criterion_id for c in criteria if c.judgement == "met"]
    missing = [c.criterion_id for c in criteria if c.judgement != "met" and c.level <= required]
    rationale = (
        model.rationale if model else "Scored from keyed options only; no open responses for this competency."
    )
    return CompetencyScore(
        rubric_row_id=inputs.row.row_id,
        skill_id=inputs.skill.id,
        skill_name=inputs.skill.name,
        required_level=required,
        recommended_score=score,
        determination=determination,
        levels=levels,
        criteria=criteria,
        confidence=confidence(score, criteria),
        rationale=rationale,
        evidence=quotes,
        indicators_met=met,
        indicators_missing=missing,
        gap=max(0, required - score) if score is not None else None,
        below_required=score is None or score < required,
        rating_claims=rating_claims(inputs.ratings, score),
        sufficient_evidence=any(c.judgement != "not_evidenced" for c in criteria),
    )
