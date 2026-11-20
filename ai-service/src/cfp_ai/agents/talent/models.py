"""Talent Assessment Agent models (docs/ai/TALENT_ASSESSMENT_AGENT.md; v1.4, pending review).

Deterministic (from the organisation's framework and the assessment record, never the model):
competencies, proficiency bands, evaluation criteria (= framework indicators), rubric
bands, keyed SJT scores, proficiency levels, gaps and confidence. Model-written: objectives,
questions, options, look-fors, feedback, per-criterion evidence judgements and narratives.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.schemas.public import (
    AiProvenance,
    ApprovalPolicy,
    DraftValidationReport,
    GapPriority,
    ResponseQuote,
    SkillCategory,
)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


AssessmentMethod = Literal[
    "competency_based",
    "behavioural",
    "situational_judgement",
    "scenario_based",
    "technical",
    "leadership",
    "self_assessment",
    "manager_assessment",
]
QuestionType = Literal[
    "behavioural", "situational_judgement", "scenario", "technical", "self_rating", "manager_rating"
]
Respondent = Literal["subject", "manager", "assessor"]

METHOD_QUESTION_TYPES: dict[str, tuple[QuestionType, ...]] = {
    "competency_based": ("behavioural", "situational_judgement", "scenario", "technical"),
    "behavioural": ("behavioural",),
    "situational_judgement": ("situational_judgement",),
    "scenario_based": ("scenario",),
    "technical": ("technical", "scenario"),
    "leadership": ("behavioural", "situational_judgement", "scenario"),
    "self_assessment": ("self_rating",),
    "manager_assessment": ("manager_rating",),
}
# Competency categories each method may assess (leadership → behavioural competencies, …).
METHOD_CATEGORIES: dict[str, frozenset[str]] = {
    "technical": frozenset({"technical", "knowledge"}),
    "leadership": frozenset({"behavioural"}),
}
LIBRARY_TYPE: dict[str, str] = {
    "behavioural": "behavioural_assessment",
    "situational_judgement": "situational_judgement",
    "scenario": "case_study",
    "technical": "practical_exercise",
    "self_rating": "self_assessment",
    "manager_rating": "manager_assessment",
}
RESPONDENT: dict[str, Respondent] = {"self_rating": "subject", "manager_rating": "manager"}


# ── assessment design (T1) ───────────────────────────────────────────────────


class EvaluationCriterion(Strict):
    """A framework indicator used as an evaluation criterion."""

    criterion_id: str  # = framework indicator ID
    skill_id: str
    level: int = Field(ge=1, le=5)
    text: str


class RubricBand(Strict):
    """A proficiency definition from the framework, with the indicators that evidence it."""

    level: int = Field(ge=1, le=5)
    label: str
    descriptor: str
    indicator_ids: list[str]


class CompetencyRubric(Strict):
    skill_id: str
    skill_name: str
    category: SkillCategory
    target_level: int = Field(ge=1, le=5)
    bands: list[RubricBand]
    criteria: list[EvaluationCriterion]


class QuestionOption(Strict):
    option_key: str = Field(max_length=8)
    text: str = Field(max_length=600)
    score: int = Field(ge=1, le=5)
    indicator_ids: list[str] = Field(default_factory=list)
    rationale: str = Field(max_length=400)


class QuestionFeedback(Strict):
    strong: str = Field(max_length=600)  # feedback when the expected indicators are evidenced
    developing: str = Field(max_length=600)  # feedback when they are not


class AssessmentQuestion(Strict):
    question_key: str = Field(max_length=64)
    type: QuestionType
    respondent: Respondent
    skill_id: str
    target_level: int = Field(ge=1, le=5)
    prompt: str = Field(max_length=3000)
    options: list[QuestionOption] | None = None
    expected_indicator_ids: list[str] = Field(min_length=1)
    look_fors: list[str] = Field(min_length=1, max_length=6)
    model_answer_outline: str | None = Field(default=None, max_length=2000)
    feedback: QuestionFeedback
    evidence_required: str = Field(max_length=400)
    estimated_minutes: int = Field(ge=1, le=90)


class AssessmentDesign(Strict):
    design_type: Literal["assessment_design"] = "assessment_design"
    method: AssessmentMethod
    title: str = Field(max_length=200)
    objectives: list[str] = Field(min_length=1, max_length=4)
    role_id: str | None
    role_profile_version: str | None
    competencies: list[CompetencyRubric]
    questions: list[AssessmentQuestion]
    rating_scale: list[RubricBand]  # framework proficiency levels, used by rating questions
    scoring_method: str  # deterministic rule, so every score is traceable to the criteria
    evidence_policy: str
    total_minutes: int
    validation: DraftValidationReport


# ── response evaluation (T3) ─────────────────────────────────────────────────

Judgement = Literal["met", "partial", "not_met", "not_evidenced"]
LevelStatus = Literal["demonstrated", "partially", "not_demonstrated", "no_evidence"]


class EvidenceRef(Strict):
    kind: Literal["quote", "keyed_option"]
    response_item_id: str
    respondent: Respondent
    item_type: str
    quote: str | None = None  # verbatim (blinded) response text
    option_key: str | None = None
    option_score: int | None = None
    self_reported: bool = False


class CriterionResult(Strict):
    criterion_id: str
    level: int
    text: str
    judgement: Judgement
    evidence: list[EvidenceRef]
    basis: Literal["ai_judgement", "keyed_option", "combined", "none"]


class LevelResult(Strict):
    level: int
    status: LevelStatus
    coverage: float  # (met + 0.5 * partial) / criteria at this level


class RatingClaim(Strict):
    """A self- or manager rating: a claim compared with the evidence, never used as evidence."""

    respondent: Respondent
    response_item_id: str
    rating: int
    alignment: Literal["aligned", "above_evidence", "below_evidence", "not_comparable"]


class CompetencyScore(Strict):
    rubric_row_id: str
    skill_id: str
    skill_name: str
    required_level: int
    recommended_score: int | None  # None when the evidence demonstrates no assessed level
    determination: str  # how the rule produced the score, citing criteria
    levels: list[LevelResult]
    criteria: list[CriterionResult]
    confidence: Literal["low", "medium", "high"]
    rationale: str
    evidence: list[ResponseQuote]  # verbatim quotes behind met / partial criteria
    indicators_met: list[str]
    indicators_missing: list[str]
    gap: int | None
    below_required: bool
    rating_claims: list[RatingClaim]
    sufficient_evidence: bool


class AssessmentEvaluation(Strict):
    scoring_set_id: str
    assessment_id: str
    assessment_type: str
    rubric_version: str
    blind: Literal[True] = True
    objectives: list[str]
    methods: list[str]
    scoring_rule: str
    recommendations: list[CompetencyScore]
    approval_policy: ApprovalPolicy
    provenance: AiProvenance
    disclaimer: str


class ReviewedRow(Strict):
    rubric_row_id: str
    skill_id: str
    decision: Literal["accepted", "overridden"]
    recommended_score: int | None
    final_score: int | None
    comment: str | None


class ReviewedEvaluation(Strict):
    """An assessor-reviewed evaluation (AI-held working data until the backend commit)."""

    assessment_id: str
    scoring_set_id: str
    subject_type: str
    subject_id: str
    role_id: str | None = None
    reviewed_at: datetime
    reviewer_hash: str
    rows: list[ReviewedRow]
    evaluation: AssessmentEvaluation


# ── reporting (T4) ───────────────────────────────────────────────────────────


class ReportCompetency(Strict):
    rubric_row_id: str
    skill_id: str
    skill_name: str
    required_level: int
    confirmed_level: int
    score_source: str
    gap: int
    criteria_met: list[str]
    criteria_missing: list[str]
    evidence: list[ResponseQuote]
    feedback: str


class DevelopmentNeed(Strict):
    skill_id: str
    skill_name: str
    gap: int
    priority: GapPriority


class DevelopmentRecommendation(Strict):
    skill_id: str
    recommendation: str
    catalogue_item_ids: list[str]
    scenario_ids: list[str]


class AssessmentReport(Strict):
    report_type: Literal["assessment_report"] = "assessment_report"
    assessment_id: str
    assessment_type: str
    title: str | None
    subject: dict[str, str]
    objectives: list[str]
    methods: list[str]
    summary: str = Field(max_length=4000)
    competencies: list[ReportCompetency]
    strengths: list[str]  # skill names at or above the requirement (confirmed scores)
    development_needs: list[DevelopmentNeed]
    development_recommendations: list[DevelopmentRecommendation]
    participant_feedback: str = Field(max_length=3000)
    evidence_basis: str
    validation: DraftValidationReport
