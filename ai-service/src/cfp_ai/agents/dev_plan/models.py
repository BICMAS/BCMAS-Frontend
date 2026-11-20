"""Development Plan Agent models (docs/ai/DEVELOPMENT_PLAN_AGENT.md §3, §8; v1.2, pending review).

Deterministic fields (computed from backend data, never by the model): current level and
its source, target level, gap, priority and its rationale, skill names, success-indicator
texts, resolved catalogue resources, dates and weekly effort. Model-written fields:
objectives, interventions, assignments, milestones, expected outcomes.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.drafts.service import DraftEnvelope
from cfp_ai.schemas.public import ContextGap, DraftValidationReport, GapPriority, PlanAction, SkillCategory


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmployeeRef(Strict):
    employee_id: str
    job_title: str | None
    department: str | None
    current_role_id: str | None
    plan_role_id: str  # role the plan targets (current role, or a target role for progression)
    plan_role_title: str
    role_profile_version: str


class LearningResource(Strict):
    """An existing organisational learning resource used by the plan (resolved from the catalogue)."""

    catalogue_item_id: str
    title: str
    kind: str
    provider: str | None
    duration_minutes: int | None


class SuccessIndicator(Strict):
    indicator_id: str
    level: int
    text: str


class Milestone(Strict):
    milestone_key: str = Field(max_length=64)
    title: str = Field(max_length=200)
    due_week: int = Field(ge=1, le=52)
    measure: str = Field(max_length=300)  # how achievement is measured
    success_indicator_ids: list[str] = Field(default_factory=list)


class EvidenceItem(Strict):
    source: Literal[
        "verified_levels", "self_assessment", "assessment", "coaching_practice", "learning_history"
    ]
    skill_id: str | None
    detail: str


class IdpGoal(Strict):
    goal_key: str = Field(max_length=64)
    skill_id: str
    skill_name: str
    category: SkillCategory
    current_level: int | None
    current_level_source: Literal["verified", "assessment", "self_assessed", "none"]
    target_level: int
    gap: int
    priority: GapPriority
    priority_rationale: str
    objective: str = Field(max_length=1000)
    interventions: list[PlanAction] = Field(min_length=1, max_length=10)
    resources: list[LearningResource] = Field(default_factory=list)
    milestones: list[Milestone] = Field(min_length=1, max_length=6)
    expected_outcomes: list[str] = Field(min_length=1, max_length=4)
    success_indicators: list[SuccessIndicator] = Field(min_length=1, max_length=6)
    start_week: int = Field(ge=1, le=52)
    end_week: int = Field(ge=1, le=52)


class IndividualDevelopmentPlan(Strict):
    plan_type: Literal["individual_development_plan"] = "individual_development_plan"
    employee: EmployeeRef
    horizon_weeks: int = Field(ge=4, le=52)
    start_date: date
    end_date: date
    development_objectives: list[str] = Field(min_length=1, max_length=5)
    goals: list[IdpGoal] = Field(min_length=1, max_length=6)
    weekly_learning_minutes: int
    evidence_basis: list[EvidenceItem]
    rationale: str = Field(max_length=2000)
    validation: DraftValidationReport


# ── progress tracking ────────────────────────────────────────────────────────

GoalStatus = Literal["achieved", "on_track", "at_risk", "overdue", "not_started"]


class GoalProgress(Strict):
    goal_id: str
    skill_id: str
    skill_name: str
    from_level: int
    to_level: int
    current_verified_level: int | None
    status: GoalStatus
    progress_pct: int
    expected_pct: int  # share of the goal's time window already elapsed
    actions_done: int
    actions_total: int
    overdue_actions: list[str]
    completed_learning: list[str]


class PlanProgressReport(Strict):
    plan_id: str
    employee_id: str
    generated_at: datetime
    overall_progress_pct: int
    goals: list[GoalProgress]
    new_evidence: list[EvidenceItem]
    unavailable_context: list[ContextGap]


class PlanReviewResult(Strict):
    progress: PlanProgressReport
    adjustment: DraftEnvelope | None  # None when no change is needed
    summary: str
