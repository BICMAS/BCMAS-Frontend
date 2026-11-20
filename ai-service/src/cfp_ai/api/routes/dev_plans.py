"""Training & Development Plan Agent API (AI_API_SPEC.md §4, §12; docs/ai/DEVELOPMENT_PLAN_AGENT.md §8).

Every endpoint runs its capability through the orchestrator's explicit path, so it gets the
same authorisation (role → entitlement → backend dependencies → subject relation), context
handling and handoffs as routed requests. Plans and adjustments are returned as drafts:
they become official development records only after review (``/v1/drafts``) and a
backend commit by the frontend.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request

from cfp_ai.agents.dev_plan.models import PlanProgressReport, PlanReviewResult
from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.auth.principal import Principal
from cfp_ai.drafts.service import DraftEnvelope
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.orchestrator.models import ExecutionRecord, OrchestrationRequest, StepRecord
from cfp_ai.schemas.public import (
    DevelopmentPlanDraftRequest,
    GapInsightsResponse,
    LearningRecommendationsResponse,
    PlanReviewRequest,
)

router = APIRouter(prefix="/v1/dev-plans", tags=["development plans"])


async def run_capability(
    request: Request,
    principal: Principal,
    capability: str,
    subject_employee_id: str | None,
    args: dict[str, str] | None = None,
    *,
    allow_handoffs: bool = False,
) -> tuple[ExecutionRecord, StepRecord]:
    record = await request.app.state.container.orchestrator.run(
        principal,
        OrchestrationRequest(
            capability=capability,
            subject_employee_id=subject_employee_id,
            args=args or {},
            allow_handoffs=allow_handoffs,
        ),
        request.state.request_id,
    )
    step = record.steps[0]
    if step.status != "succeeded" or step.output is None:
        error = step.error
        raise AppError(error.code if error else "internal_error", error.message if error else None)
    return record, step


@router.post("/drafts", response_model=DraftEnvelope, status_code=201)
async def draft_plan(
    request: Request, body: DevelopmentPlanDraftRequest, principal: CurrentPrincipal
) -> DraftEnvelope:
    """D1: generate an IDP draft. Critical goals hand off to the Coaching Agent (practice suggestions)."""
    args = {"horizon_weeks": str(body.horizon_weeks)}
    if body.role_id:
        args["role_id"] = body.role_id
    if body.focus_skill_ids:
        args["focus_skill_ids"] = ",".join(body.focus_skill_ids)
    if body.constraints and body.constraints.hours_per_week:
        args["hours_per_week"] = str(body.constraints.hours_per_week)
    _, step = await run_capability(
        request, principal, "dev_plan.draft_plan", body.employee_id, args, allow_handoffs=True
    )
    return DraftEnvelope.model_validate(step.output)


@router.get("/gaps/{employee_id}", response_model=GapInsightsResponse)
async def gaps(request: Request, employee_id: str, principal: CurrentPrincipal) -> GapInsightsResponse:
    """D2: competency gaps against role requirements, explained."""
    _, step = await run_capability(request, principal, "dev_plan.explain_gaps", employee_id)
    return GapInsightsResponse.model_validate(step.output)


@router.get("/recommendations/learning", response_model=LearningRecommendationsResponse)
async def learning(
    request: Request,
    principal: CurrentPrincipal,
    employee_id: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    skill_id: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> LearningRecommendationsResponse:
    """D3: the organisation's own learning resources for the employee's gaps (defaults to the caller)."""
    args = {"limit": str(limit)}
    if skill_id:
        args["skill_id"] = skill_id
    _, step = await run_capability(
        request, principal, "dev_plan.recommend_learning", employee_id or principal.employee_id, args
    )
    return LearningRecommendationsResponse.model_validate(step.output)


async def _plan_subject(request: Request, principal: Principal, plan_id: str) -> str:
    """The plan's employee, read from the backend (BE-051) with the caller's own token."""
    try:
        plan = await request.app.state.container.backend.get_development_plan(principal, plan_id)
    except BackendError as exc:
        raise exc.to_app_error() from exc
    employee_id: str = plan.employee_id
    return employee_id


@router.get("/plans/{plan_id}/progress", response_model=PlanProgressReport)
async def progress(request: Request, plan_id: str, principal: CurrentPrincipal) -> PlanProgressReport:
    """D4 (read-only): progress of an official plan against verified levels and learning records."""
    subject = await _plan_subject(request, principal, plan_id)
    _, step = await run_capability(
        request, principal, "dev_plan.review_plan", subject, {"plan_id": plan_id, "progress_only": "true"}
    )
    return PlanReviewResult.model_validate(step.output).progress


@router.post("/plans/{plan_id}/review", response_model=PlanReviewResult)
async def review(
    request: Request, plan_id: str, body: PlanReviewRequest, principal: CurrentPrincipal
) -> PlanReviewResult:
    """D4: progress + evidence-driven changes, proposed as a ``plan_adjustment`` draft for review."""
    subject = await _plan_subject(request, principal, plan_id)
    _, step = await run_capability(
        request, principal, "dev_plan.review_plan", subject, {"plan_id": plan_id, "trigger": body.trigger}
    )
    return PlanReviewResult.model_validate(step.output)
