"""Talent Assessment Agent API (AI_API_SPEC.md §5, §13; docs/ai/TALENT_ASSESSMENT_AGENT.md §8).

All capabilities run through the orchestrator's explicit path (role → entitlement → backend
dependencies → subject relation). Scoring pauses for per-item assessor review; the review is
the orchestrator approval, and reviewed results are shared with the Development Plan and
Coaching agents as handoffs. Designs and reports are drafts reviewed via ``/v1/drafts``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.agents.steps import ApprovalDecisionInput
from cfp_ai.agents.talent.cv_analysis import AnalyzeCvCapability, CvAnalysis, CvAnalysisRequest
from cfp_ai.agents.talent.interview_scoring import (
    InterviewScoring,
    InterviewScoringRequest,
    ScoreInterviewCapability,
)
from cfp_ai.agents.talent.models import AssessmentEvaluation, AssessmentMethod
from cfp_ai.agents.talent.store import ScoringSetRef, TalentResultStore
from cfp_ai.api.routes.dev_plans import run_capability
from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.auth.principal import Principal
from cfp_ai.drafts.service import DraftEnvelope
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.orchestrator.models import ApprovalView, ExecutionRecord, ExecutionStatus, OrchestrationRequest
from cfp_ai.schemas.public import ScoringRequest, Suggestion

router = APIRouter(prefix="/v1/talent", tags=["talent assessment"])


class AssessmentDesignRequest(BaseModel):
    """v1.4 (pending review): replaces ItemDraftRequest for multi-method assessment design."""

    model_config = ConfigDict(extra="forbid")

    method: AssessmentMethod = "competency_based"
    role_id: str | None = Field(default=None, max_length=128)
    skill_ids: list[str] | None = Field(default=None, max_length=6)
    target_level: int | None = Field(default=None, ge=1, le=5)
    questions_per_competency: int = Field(default=2, ge=1, le=3)


class FollowUp(BaseModel):
    capability: str
    status: str
    subject_employee_id: str | None
    summary: str | None


class ScoringView(BaseModel):
    """A scoring set with its assessor review state (v1.4, pending review)."""

    execution_id: str
    status: ExecutionStatus
    evaluation: AssessmentEvaluation
    review: ApprovalView | None
    follow_ups: list[FollowUp]
    suggestions: list[Suggestion]


def _store(request: Request) -> TalentResultStore:
    store: TalentResultStore = request.app.state.container.talent_results
    return store


def _view(record: ExecutionRecord) -> ScoringView:
    step = next((s for s in record.steps if s.capability == "talent.recommend_scores"), None)
    if step is None or step.output is None:
        error = step.error if step else None
        raise AppError(error.code if error else "internal_error", error.message if error else None)
    return ScoringView(
        execution_id=record.execution_id,
        status=record.status,
        evaluation=AssessmentEvaluation.model_validate(step.output),
        review=step.approval,
        follow_ups=[
            FollowUp(
                capability=s.capability,
                status=s.status,
                subject_employee_id=s.subject_employee_id,
                summary=s.summary,
            )
            for s in record.steps
            if s.step_id != step.step_id
        ],
        suggestions=record.suggestions,
    )


@router.post("/cv-analyses", response_model=CvAnalysis)
async def analyze_cv(request: Request, body: CvAnalysisRequest, principal: CurrentPrincipal) -> CvAnalysis:
    """T7: CV evidence against the role profile (Evidence Found / Not Found / Unclear).

    Called directly, not through the orchestrator, so the CV text is not kept in execution history.
    """
    container = request.app.state.container
    capability = container.capabilities.resolve("talent.analyze_cv", principal, container.deps)
    assert isinstance(capability, AnalyzeCvCapability)
    return await capability.analyze(principal, body, request.state.request_id)


@router.post("/interview-scorings", response_model=InterviewScoring)
async def score_interview(
    request: Request, body: InterviewScoringRequest, principal: CurrentPrincipal
) -> InterviewScoring:
    """T8: rubric score suggestions for AI-avatar interview answers (content only; a person confirms).

    Called directly, not through the orchestrator, so the answers are not kept in execution history.
    """
    container = request.app.state.container
    capability = container.capabilities.resolve("talent.score_interview", principal, container.deps)
    assert isinstance(capability, ScoreInterviewCapability)
    return await capability.score(principal, body, request.state.request_id)


@router.post("/item-drafts", response_model=DraftEnvelope, status_code=201)
async def design_assessment(
    request: Request, body: AssessmentDesignRequest, principal: CurrentPrincipal
) -> DraftEnvelope:
    """T1: a design with objectives, competencies, questions, indicators, rubrics, criteria, feedback."""
    args: dict[str, Any] = {
        "method": body.method,
        "questions_per_competency": str(body.questions_per_competency),
    }
    if body.role_id:
        args["role_id"] = body.role_id
    if body.skill_ids:
        args["skill_ids"] = ",".join(body.skill_ids)
    if body.target_level:
        args["target_level"] = str(body.target_level)
    _, step = await run_capability(request, principal, "talent.draft_items", None, args)
    return DraftEnvelope.model_validate(step.output)


@router.post("/assessments/{assessment_id}/scoring", response_model=ScoringView, status_code=201)
async def score(
    request: Request, assessment_id: str, body: ScoringRequest, principal: CurrentPrincipal
) -> ScoringView:
    """T3: evidence-based evaluation; pauses for per-item assessor review."""
    args = {"assessment_id": assessment_id}
    if body.rubric_row_ids:
        args["rubric_row_ids"] = ",".join(body.rubric_row_ids)
    record = await request.app.state.container.orchestrator.run(
        principal,
        OrchestrationRequest(capability="talent.recommend_scores", args=args, allow_handoffs=True),
        request.state.request_id,
    )
    view = _view(record)
    step = record.steps[0]
    subject = step.metadata.get("subject") or {}
    _store(request).link_scoring_set(
        principal.tenant_id,
        view.evaluation.scoring_set_id,
        ScoringSetRef(
            execution_id=record.execution_id,
            approval_id=step.approval.approval_id if step.approval else None,
            subject_type=str(subject.get("type", "")),
            subject_id=str(subject.get("id", "")),
        ),
    )
    return view


def _ref(request: Request, principal: Principal, scoring_set_id: str) -> ScoringSetRef:
    ref = _store(request).scoring_set(principal.tenant_id, scoring_set_id)
    if ref is None:
        raise AppError("not_found")
    return ref


@router.get("/scoring-sets/{scoring_set_id}", response_model=ScoringView)
async def get_scoring_set(request: Request, scoring_set_id: str, principal: CurrentPrincipal) -> ScoringView:
    ref = _ref(request, principal, scoring_set_id)
    return _view(request.app.state.container.orchestrator.get(principal, ref.execution_id))


@router.post("/scoring-sets/{scoring_set_id}/reviews", response_model=ScoringView)
async def review(
    request: Request, scoring_set_id: str, body: ApprovalDecisionInput, principal: CurrentPrincipal
) -> ScoringView:
    """Assessor review: accept or override (with a comment) every row, or reject the set."""
    ref = _ref(request, principal, scoring_set_id)
    if ref.approval_id is None:
        raise AppError("conflict", "This scoring set has no pending review.")
    orchestrator = request.app.state.container.orchestrator
    await orchestrator.decide(principal, ref.execution_id, ref.approval_id, body, request.state.request_id)
    view = _view(orchestrator.get(principal, ref.execution_id))
    await request.app.state.container.workflows.notify(
        principal, "scoring_set", scoring_set_id, request.state.request_id
    )
    return view


@router.post("/assessments/{assessment_id}/report-drafts", response_model=DraftEnvelope, status_code=201)
async def report(request: Request, assessment_id: str, principal: CurrentPrincipal) -> DraftEnvelope:
    """T4: report from assessor-confirmed, committed scores."""
    try:
        assessment = await request.app.state.container.backend.get_assessment(principal, assessment_id)
    except BackendError as exc:
        raise exc.to_app_error() from exc
    subject = assessment.subject.id if assessment.subject.type == "employee" else None
    _, step = await run_capability(
        request, principal, "talent.draft_report", subject, {"assessment_id": assessment_id}
    )
    return DraftEnvelope.model_validate(step.output)
