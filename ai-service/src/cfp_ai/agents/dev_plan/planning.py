"""Individual Development Plan generation (docs/ai/DEVELOPMENT_PLAN_AGENT.md §3–§5).

Pipeline:
  1. select goals deterministically (gap priority, focus skills, assessment evidence);
  2. gather candidates: organisational catalogue items per skill (completed ones
     excluded), published coaching scenarios per skill, level indicators per skill;
  3. model writes objectives, interventions, assignments, milestones, outcomes;
  4. plan rules validate the result (and every later human edit) → repair;
  5. assembly adds every deterministic field.

Plan rules ("validation context" is stored with the draft so edits are checked the same way):
  * exactly one goal per selected skill;
  * each goal has ≥1 practical workplace assignment and, when the organisation has a
    catalogue item for the skill, ≥1 organisational learning resource (org resources first);
  * learning items / scenarios must be candidates *for that skill*; no item twice;
  * success indicators come from that skill's framework indicators (≥1 per goal);
  * milestones (≥1) are within the goal window and the plan horizon, in order;
  * total catalogue effort fits the employee's weekly capacity, when given.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field

from cfp_ai.agents.base import AgentDeps, RunContext
from cfp_ai.agents.common import input_json_block
from cfp_ai.agents.dev_plan.models import (
    EmployeeRef,
    EvidenceItem,
    IdpGoal,
    IndividualDevelopmentPlan,
    LearningResource,
    Milestone,
    SuccessIndicator,
)
from cfp_ai.context.models import CapabilityContext
from cfp_ai.context.render import render_context
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.dto import CatalogueItemDTO
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.llm.types import LlmMessage, LlmRequest
from cfp_ai.schemas.public import DraftValidationReport, GapPriority, PlanAction, ValidationIssue
from cfp_ai.validation.structured import generate_validated

ROUTE = "dev_plan.generate"
PROMPT_VERSION = "dev_plan.generate@v1"
_PRIORITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}

SYSTEM_PROMPT = """You are a learning and development specialist writing an Individual Development Plan (IDP).
The platform has ALREADY selected the competencies, their current and target levels, gaps and priorities;
do not change them. For every goal in <input_json>.goals write:
- objective: one measurable development objective for the target level (max 40 words);
- interventions: a blend following roughly 70/20/10 — practical workplace assignments (type
  workplace_practice) that the employee can do in their current job, social learning (mentoring or a
  coaching_scenario), and formal learning (type learning). PRIORITISE the organisation's own resources: use
  catalogue_options for formal learning and scenario_options for coaching practice; use ONLY their IDs.
  Every goal needs at least one workplace_practice assignment, and at least one learning intervention when
  catalogue_options is not empty. Give each intervention due_in_days within the horizon;
- milestones: 1-4 checkpoints with due_week inside the goal's start_week..end_week and a concrete measure;
- expected_outcomes: 1-3 observable results at the target level;
- success_indicator_ids: indicator IDs from indicator_options that will show the target level was reached;
- start_week / end_week: schedule higher-priority goals first and keep the total within horizon_weeks.
Also write 1-5 overall development_objectives and a short rationale. Be specific to the role and realistic
for the employee's weekly capacity. Never state or imply that levels have been verified or changed."""


# ── model output ─────────────────────────────────────────────────────────────


class _Intervention(BaseModel):
    action_key: str = Field(max_length=64)
    type: Literal["learning", "workplace_practice", "coaching_scenario", "mentoring", "evidence"]
    title: str = Field(max_length=200)
    description: str = Field(max_length=1000)
    catalogue_item_id: str | None = None
    scenario_id: str | None = None
    success_indicator_ids: list[str] = Field(default_factory=list)
    due_in_days: int = Field(ge=1, le=365)


class _Milestone(BaseModel):
    milestone_key: str = Field(max_length=64)
    title: str = Field(max_length=200)
    due_week: int = Field(ge=1, le=52)
    measure: str = Field(max_length=300)
    success_indicator_ids: list[str] = Field(default_factory=list)


class _Goal(BaseModel):
    skill_id: str
    objective: str = Field(max_length=1000)
    interventions: list[_Intervention] = Field(min_length=1, max_length=10)
    milestones: list[_Milestone] = Field(min_length=1, max_length=6)
    expected_outcomes: list[str] = Field(min_length=1, max_length=4)
    success_indicator_ids: list[str] = Field(min_length=1, max_length=6)
    start_week: int = Field(ge=1, le=52)
    end_week: int = Field(ge=1, le=52)


class PlanDraftLLM(BaseModel):
    development_objectives: list[str] = Field(min_length=1, max_length=5)
    rationale: str = Field(max_length=2000)
    goals: list[_Goal] = Field(min_length=1, max_length=6)


# ── selection & candidates ───────────────────────────────────────────────────


@dataclass
class GoalSpec:
    skill_id: str
    skill_name: str
    category: Literal["technical", "behavioural", "knowledge"]
    current_level: int | None
    current_source: Literal["verified", "assessment", "self_assessed", "none"]
    target_level: int
    gap: int
    priority: GapPriority
    priority_rationale: str
    catalogue: list[CatalogueItemDTO] = field(default_factory=list)
    scenarios: list[tuple[str, str]] = field(default_factory=list)  # (scenario_id, title)
    indicators: list[tuple[str, int, str]] = field(default_factory=list)  # (id, level, text)


@dataclass
class PlanningInputs:
    context: CapabilityContext
    goals: list[GoalSpec]
    horizon_weeks: int
    hours_per_week: int | None
    evidence: list[EvidenceItem]
    completed_items: set[str]


def select_goals(
    context: CapabilityContext,
    *,
    focus_skill_ids: Sequence[str] = (),
    assessment_scores: dict[str, int] | None = None,
    max_goals: int = 6,
) -> list[GoalSpec]:
    """Deterministic: the platform's gaps, raised by confirmed assessment evidence."""
    if context.role_profile is None:
        raise AppError("precondition_failed", "The role requirements are not available.")
    requirements = {r.skill_id: r for r in context.role_profile.requirements}
    capabilities = {c.skill_id: c for c in context.capabilities or []}
    assessment_scores = assessment_scores or {}
    specs: dict[str, GoalSpec] = {}
    for gap in context.skill_gaps:
        if gap.gap <= 0:
            continue  # requirement already met
        source: Literal["verified", "assessment", "self_assessed", "none"] = (
            "verified" if gap.verified_level is not None else "none"
        )
        current = gap.verified_level
        rationale = (
            f"Required level {gap.required_level}; verified level "
            f"{gap.verified_level if gap.verified_level is not None else 'not yet verified'} "
            f"(gap {gap.gap})."
        )
        specs[gap.skill_id] = GoalSpec(
            gap.skill_id,
            gap.skill_name,
            gap.category,
            current,
            source,
            gap.required_level,
            gap.gap,
            gap.priority,
            rationale,
        )
    for skill_id, score in assessment_scores.items():  # reviewer-confirmed assessment evidence
        req = requirements.get(skill_id)
        if req is None:
            continue
        verified = capabilities[skill_id].verified_level if skill_id in capabilities else None
        current = verified if verified is not None else score
        gap_value = req.required_level - current
        if gap_value <= 0:
            continue
        existing = specs.get(skill_id)
        priority: GapPriority = "critical" if gap_value >= 2 else "high"
        if existing is not None and _PRIORITY_RANK[existing.priority] <= _PRIORITY_RANK[priority]:
            priority = existing.priority
        name = context.skills[skill_id].name if skill_id in context.skills else skill_id
        specs[skill_id] = GoalSpec(
            skill_id,
            name,
            req.category,
            current,
            "verified" if verified is not None else "assessment",
            req.required_level,
            gap_value,
            priority,
            f"Reviewed assessment scored level {score} against required level {req.required_level}.",
        )
    if focus_skill_ids:
        unknown = [s for s in focus_skill_ids if s not in requirements]
        if unknown:
            raise AppError(
                "invalid_request",
                "Focus skills must be requirements of the plan role.",
                internal_detail=f"unknown focus {unknown}",
            )
        specs = {k: v for k, v in specs.items() if k in focus_skill_ids}
    ordered = sorted(specs.values(), key=lambda s: (_PRIORITY_RANK[s.priority], -s.gap, s.skill_name))
    if not ordered:
        raise AppError("precondition_failed", "There are no capability gaps to plan for against this role.")
    return ordered[:max_goals]


async def gather_candidates(deps: AgentDeps, ctx: RunContext, inputs: PlanningInputs) -> None:
    """Organisational resources first: catalogue items, coaching scenarios and indicators per goal skill."""
    skill_ids = [g.skill_id for g in inputs.goals]
    try:
        catalogue = await deps.backend.list_catalogue(ctx.principal, skill_ids)
    except BackendError as exc:
        if exc.kind == "unauthorized":
            raise exc.to_app_error() from exc
        catalogue = []
    scenarios = deps.scenarios.list(ctx.principal.tenant_id) if deps.scenarios is not None else []
    for goal in inputs.goals:
        goal.catalogue = [
            c
            for c in catalogue
            if goal.skill_id in c.skill_ids and c.status == "active" and c.id not in inputs.completed_items
        ][:5]
        goal.scenarios = [
            (s.scenario_id, s.title)
            for s in scenarios
            if goal.skill_id in {t.skill_id for t in s.target_skills}
        ][:3]
        skill = inputs.context.skills.get(goal.skill_id)
        if skill is not None:
            floor = goal.current_level or 0
            goal.indicators = [
                (ind.id, lvl.level, ind.text)
                for lvl in skill.levels
                if floor < lvl.level <= goal.target_level
                for ind in lvl.indicators
            ]
        if not goal.indicators:
            # Without indicators we cannot define measurable success; keep the goal measurable by level only.
            goal.indicators = [
                (
                    f"level-{goal.skill_id}-{goal.target_level}",
                    goal.target_level,
                    f"Demonstrates {goal.skill_name} at level {goal.target_level}.",
                )
            ]


def validation_context(inputs: PlanningInputs) -> dict[str, Any]:
    return {
        "horizon_weeks": inputs.horizon_weeks,
        "hours_per_week": inputs.hours_per_week,
        "goal_skills": {
            g.skill_id: {
                "catalogue": [c.id for c in g.catalogue],
                "scenarios": [s for s, _ in g.scenarios],
                "indicators": [i for i, _, _ in g.indicators],
            }
            for g in inputs.goals
        },
        "catalogue_minutes": {c.id: c.duration_minutes or 0 for g in inputs.goals for c in g.catalogue},
    }


# ── plan rules (shared by generation and human edits) ────────────────────────


def plan_rules(goals: Sequence[Any], vctx: dict[str, Any]) -> list[ValidationIssue]:
    """Works on any goal objects exposing skill_id, interventions, milestones, indicators and weeks."""
    issues: list[ValidationIssue] = []
    allowed: dict[str, dict[str, list[str]]] = vctx["goal_skills"]
    horizon: int = vctx["horizon_weeks"]

    def issue(code: str, path: str, message: str) -> None:
        issues.append(ValidationIssue(code=code, path=path, message=message))

    seen_skills = [g.skill_id for g in goals]
    for missing in sorted(set(allowed) - set(seen_skills)):
        issue("missing_goal", "goals", f"no goal for {missing}")
    used_items: set[str] = set()
    action_keys: set[str] = set()
    minutes = 0
    for gi, goal in enumerate(goals):
        path = f"goals[{gi}]"
        if goal.skill_id not in allowed:
            issue("unknown_id", f"{path}.skill_id", f"'{goal.skill_id}' is not a selected competency")
            continue
        if seen_skills.count(goal.skill_id) > 1:
            issue("duplicate", f"{path}.skill_id", f"{goal.skill_id} has more than one goal")
        opts = allowed[goal.skill_id]
        indicators = set(opts["indicators"])
        types = [a.type for a in goal.interventions]
        if "workplace_practice" not in types:
            issue(
                "missing_assignment",
                f"{path}.interventions",
                "each goal needs a practical workplace assignment",
            )
        if opts["catalogue"] and not any(
            a.type == "learning" and a.catalogue_item_id in opts["catalogue"] for a in goal.interventions
        ):
            issue(
                "org_resource_missing",
                f"{path}.interventions",
                "use the organisation's catalogue for formal learning: " + ", ".join(opts["catalogue"]),
            )
        for ai, action in enumerate(goal.interventions):
            apath = f"{path}.interventions[{ai}]"
            if action.action_key in action_keys:
                issue("duplicate", f"{apath}.action_key", "action keys must be unique")
            action_keys.add(action.action_key)
            if action.type == "learning":
                if action.catalogue_item_id not in opts["catalogue"]:
                    issue(
                        "unknown_id",
                        f"{apath}.catalogue_item_id",
                        f"'{action.catalogue_item_id}' is not an organisational resource for this skill",
                    )
                elif action.catalogue_item_id in used_items:
                    issue("duplicate", f"{apath}.catalogue_item_id", "the same item is used twice")
                else:
                    used_items.add(action.catalogue_item_id)
                    minutes += vctx["catalogue_minutes"].get(action.catalogue_item_id, 0)
            elif action.catalogue_item_id is not None:
                issue(
                    "invalid_reference",
                    f"{apath}.catalogue_item_id",
                    "only learning interventions use catalogue items",
                )
            if action.type == "coaching_scenario" and action.scenario_id not in opts["scenarios"]:
                issue(
                    "unknown_id",
                    f"{apath}.scenario_id",
                    f"'{action.scenario_id}' is not a scenario for this skill",
                )
            if action.due_in_days > horizon * 7:
                issue("outside_horizon", f"{apath}.due_in_days", f"due beyond the {horizon}-week horizon")
            for ind in action.success_indicator_ids:
                if ind not in indicators:
                    issue("unknown_indicator", apath, f"'{ind}' is not an indicator of this skill")
        goal_indicators = _indicator_ids(goal)
        if not goal_indicators:
            issue("missing_success_indicator", path, "each goal needs at least one success indicator")
        for ind in goal_indicators:
            if ind not in indicators:
                issue(
                    "unknown_indicator",
                    f"{path}.success_indicators",
                    f"'{ind}' is not an indicator of this skill",
                )
        if not 1 <= goal.start_week <= goal.end_week <= horizon:
            issue("invalid_timeline", path, f"weeks must satisfy 1 ≤ start ≤ end ≤ {horizon}")
        weeks = [m.due_week for m in goal.milestones]
        if weeks != sorted(weeks):
            issue("invalid_timeline", f"{path}.milestones", "milestones must be in date order")
        for mi, milestone in enumerate(goal.milestones):
            if not goal.start_week <= milestone.due_week <= goal.end_week:
                issue("invalid_timeline", f"{path}.milestones[{mi}]", "milestone outside the goal's weeks")
            for ind in milestone.success_indicator_ids:
                if ind not in indicators:
                    issue(
                        "unknown_indicator",
                        f"{path}.milestones[{mi}]",
                        f"'{ind}' is not an indicator of this skill",
                    )
    capacity = vctx.get("hours_per_week")
    if capacity and minutes / horizon > capacity * 60:
        issue(
            "over_capacity",
            "goals",
            f"formal learning needs {math.ceil(minutes / horizon)} min/week; "
            f"capacity is {capacity * 60} min/week",
        )
    return issues


def _indicator_ids(goal: Any) -> list[str]:
    if hasattr(goal, "success_indicator_ids"):
        return list(goal.success_indicator_ids)
    return [s.indicator_id for s in goal.success_indicators]


# ── generation & assembly ────────────────────────────────────────────────────


async def generate_plan(
    deps: AgentDeps,
    ctx: RunContext,
    inputs: PlanningInputs,
    employee: EmployeeRef,
    *,
    start: date | None = None,
) -> tuple[IndividualDevelopmentPlan, str]:
    vctx = validation_context(inputs)
    facts = {
        "horizon_weeks": inputs.horizon_weeks,
        "hours_per_week": inputs.hours_per_week,
        "plan_role": employee.plan_role_title,
        "goals": [
            {
                "skill_id": g.skill_id,
                "skill_name": g.skill_name,
                "category": g.category,
                "current_level": g.current_level,
                "target_level": g.target_level,
                "gap": g.gap,
                "priority": g.priority,
                "catalogue_options": [
                    {"id": c.id, "title": c.title, "kind": c.kind, "duration_minutes": c.duration_minutes}
                    for c in g.catalogue
                ],
                "scenario_options": [{"id": s, "title": t} for s, t in g.scenarios],
                "indicator_options": [{"id": i, "level": lvl, "text": t} for i, lvl, t in g.indicators],
            }
            for g in inputs.goals
        ],
        "evidence": [e.model_dump() for e in inputs.evidence],
    }
    request = LlmRequest(
        route_id=ROUTE,
        system_blocks=(SYSTEM_PROMPT,),
        messages=(LlmMessage("user", render_context(inputs.context) + "\n\n" + input_json_block(facts)),),
        metadata={"tenant_id": ctx.principal.tenant_id, "capability": ctx.capability},
    )
    result = await generate_validated(
        deps.gateway,
        ROUTE,
        request,
        PlanDraftLLM,
        [lambda out: plan_rules(out.goals, vctx)],
        metrics=deps.metrics,
        deadline=ctx.deadline,
    )
    plan = assemble(
        result.output, inputs, employee, start=start or datetime.now(UTC).date(), report=result.report
    )
    return plan, result.model


def assemble(
    draft: PlanDraftLLM,
    inputs: PlanningInputs,
    employee: EmployeeRef,
    *,
    start: date,
    report: DraftValidationReport,
) -> IndividualDevelopmentPlan:
    specs = {g.skill_id: g for g in inputs.goals}
    goals: list[IdpGoal] = []
    minutes = 0
    for goal in draft.goals:
        spec = specs[goal.skill_id]
        catalogue = {c.id: c for c in spec.catalogue}
        indicator_text = {i: (lvl, t) for i, lvl, t in spec.indicators}
        resources = [
            LearningResource(
                catalogue_item_id=c.id,
                title=c.title,
                kind=c.kind,
                provider=c.provider,
                duration_minutes=c.duration_minutes,
            )
            for a in goal.interventions
            if a.type == "learning" and (c := catalogue.get(a.catalogue_item_id or ""))
        ]
        minutes += sum(r.duration_minutes or 0 for r in resources)
        goals.append(
            IdpGoal(
                goal_key=f"goal-{goal.skill_id}",
                skill_id=spec.skill_id,
                skill_name=spec.skill_name,
                category=spec.category,
                current_level=spec.current_level,
                current_level_source=spec.current_source,
                target_level=spec.target_level,
                gap=spec.gap,
                priority=spec.priority,
                priority_rationale=spec.priority_rationale,
                objective=goal.objective,
                interventions=[PlanAction(**a.model_dump()) for a in goal.interventions],
                resources=resources,
                milestones=[Milestone(**m.model_dump()) for m in goal.milestones],
                expected_outcomes=goal.expected_outcomes,
                success_indicators=[
                    SuccessIndicator(indicator_id=i, level=indicator_text[i][0], text=indicator_text[i][1])
                    for i in goal.success_indicator_ids
                    if i in indicator_text
                ],
                start_week=goal.start_week,
                end_week=goal.end_week,
            )
        )
    goals.sort(key=lambda g: (_PRIORITY_RANK[g.priority], g.start_week))
    return IndividualDevelopmentPlan(
        employee=employee,
        horizon_weeks=inputs.horizon_weeks,
        start_date=start,
        end_date=start + timedelta(weeks=inputs.horizon_weeks),
        development_objectives=draft.development_objectives,
        goals=goals,
        weekly_learning_minutes=math.ceil(minutes / inputs.horizon_weeks),
        evidence_basis=inputs.evidence,
        rationale=draft.rationale,
        validation=report,
    )


def evidence_from(
    context: CapabilityContext, assessment_scores: dict[str, int] | None, coaching: Sequence[dict[str, Any]]
) -> tuple[list[EvidenceItem], set[str]]:
    evidence: list[EvidenceItem] = []
    for cap in context.capabilities or []:
        if cap.verified_level is not None:
            evidence.append(
                EvidenceItem(
                    source="verified_levels",
                    skill_id=cap.skill_id,
                    detail=f"Verified level {cap.verified_level}.",
                )
            )
        elif cap.self_assessed_level is not None:
            evidence.append(
                EvidenceItem(
                    source="self_assessment",
                    skill_id=cap.skill_id,
                    detail=f"Self-assessed level {cap.self_assessed_level} (not verified).",
                )
            )
    for skill_id, score in (assessment_scores or {}).items():
        evidence.append(
            EvidenceItem(
                source="assessment", skill_id=skill_id, detail=f"Reviewer-confirmed assessment score {score}."
            )
        )
    for item in coaching:
        evidence.append(
            EvidenceItem(source="coaching_practice", skill_id=item.get("skill_id"), detail=item["detail"])
        )
    completed: set[str] = set()
    for record in context.learning_history or []:
        if record.status == "completed" and record.catalogue_item_id:
            completed.add(record.catalogue_item_id)
        if record.status in ("completed", "in_progress"):
            evidence.append(
                EvidenceItem(
                    source="learning_history",
                    skill_id=record.skill_ids[0] if record.skill_ids else None,
                    detail=f"{record.title}: {record.status.replace('_', ' ')}.",
                )
            )
    return evidence, completed


def coaching_evidence(deps: AgentDeps, tenant_id: str, employee_id: str) -> list[dict[str, Any]]:
    """Practice signals from the Coaching Agent (never treated as verified levels)."""
    if deps.coaching_store is None:
        return []
    items: list[dict[str, Any]] = []
    for session in deps.coaching_store.sessions_for(tenant_id, employee_id)[:3]:
        if session.evaluation is None:
            continue
        for obs in session.evaluation.skill_observations:
            if obs.observed_level is not None:
                items.append(
                    {
                        "skill_id": obs.skill_id,
                        "detail": f"Role-play '{session.title}': practice level {obs.observed_level} "
                        f"(target {obs.target_level}).",
                    }
                )
    return items
