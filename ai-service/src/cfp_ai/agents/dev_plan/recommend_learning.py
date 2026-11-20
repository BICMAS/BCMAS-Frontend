"""D3 ``dev_plan.recommend_learning`` — organisational learning resources for skill gaps.

Deterministic and explainable: only the organisation's own catalogue (active items the
caller may see, BE-040), ranked by the size and priority of the gap each item addresses
and whether it targets the required level. Completed items are excluded; items already
in progress are surfaced as "continue". No model call.
"""

from __future__ import annotations

from dataclasses import replace

from pydantic import BaseModel

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.common import provenance
from cfp_ai.agents.steps import StepInput, StepOutput
from cfp_ai.context.models import CapabilityContext
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.schemas.public import Citation, LearningRecommendation, LearningRecommendationsResponse

SPEC = replace(
    declared("dev_plan.recommend_learning"),
    implemented=True,
    llm_routes=(),
    required_endpoints=("BE-040",),
    optional_endpoints=("BE-030", "BE-042"),
)
PROMPT_VERSION = "dev_plan.recommend_learning@v1-deterministic"
_PRIORITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}


class RecommendLearningCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = LearningRecommendationsResponse
    context_slices = frozenset({"role_profile", "framework", "capabilities", "learning_history"})

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        if context is None or step.subject_employee_id is None:
            raise AppError("precondition_failed", "Employee context is not available.")
        try:
            limit = max(1, min(20, int(step.args.get("limit", "5"))))
        except ValueError as exc:
            raise AppError("invalid_request", "limit must be a number.") from exc
        response = await recommend(
            self, ctx, context, skill_id=step.args.get("skill_id") or None, limit=limit
        )
        titles = ", ".join(r.title for r in response.recommendations[:3])
        return StepOutput(
            summary=f"Recommended learning: {titles}." if titles else "No matching learning found.",
            output_type="LearningRecommendationsResponse",
            data=response.model_dump(mode="json"),
        )


async def recommend(
    capability: Capability[BaseModel, BaseModel],
    ctx: RunContext,
    context: CapabilityContext,
    *,
    skill_id: str | None,
    limit: int,
) -> LearningRecommendationsResponse:
    gaps = {g.skill_id: g for g in context.skill_gaps}
    if skill_id is not None:
        if context.role_profile is None or skill_id not in {
            r.skill_id for r in context.role_profile.requirements
        }:
            raise AppError("invalid_request", "The skill is not a requirement of the employee's role.")
        targets = [skill_id]
    else:
        targets = list(gaps)
    if not targets:
        return LearningRecommendationsResponse(
            recommendations=[],
            provenance=provenance(
                SPEC.capability, model="none", prompt_version=PROMPT_VERSION, context=context
            ),
        )
    try:
        items = await capability.deps.backend.list_catalogue(ctx.principal, targets)
    except BackendError as exc:
        raise exc.to_app_error() from exc
    history = {r.catalogue_item_id: r.status for r in context.learning_history or [] if r.catalogue_item_id}
    required = (
        {r.skill_id: r.required_level for r in context.role_profile.requirements}
        if context.role_profile
        else {}
    )
    ranked: list[tuple[int, str, LearningRecommendation]] = []
    for item in items:
        if history.get(item.id) == "completed" or item.status != "active":
            continue
        for sid in item.skill_ids:
            if sid not in targets:
                continue
            gap = gaps.get(sid)
            level = required.get(sid)
            score = (gap.gap * 10 + _PRIORITY_WEIGHT[gap.priority] * 3) if gap else 1
            level_match = level is not None and level in item.target_levels
            score += 5 if level_match else 0
            in_progress = history.get(item.id) == "in_progress"
            score += 8 if in_progress else 0
            name = gap.skill_name if gap else sid
            reason = ("Continue: already in progress. " if in_progress else "") + (
                f"Organisational resource for {name}"
                + (f" (gap {gap.gap}, {gap.priority})" if gap else "")
                + (f", designed for level {level}." if level_match else ".")
            )
            ranked.append(
                (
                    score,
                    item.title,
                    LearningRecommendation(
                        catalogue_item_id=item.id,
                        title=item.title,
                        kind=item.kind,
                        provider=item.provider,
                        duration_minutes=item.duration_minutes,
                        skill_id=sid,
                        target_level=level,
                        fit_reason=reason,
                        citations=[
                            Citation(
                                source_type="catalogue_item",
                                source_id=item.id,
                                source_version=None,
                                title=item.title,
                                excerpt=None,
                            )
                        ],
                    ),
                )
            )
            break
    ranked.sort(key=lambda r: (-r[0], r[1]))
    return LearningRecommendationsResponse(
        recommendations=[r for _, _, r in ranked[:limit]],
        provenance=provenance(SPEC.capability, model="none", prompt_version=PROMPT_VERSION, context=context),
    )
