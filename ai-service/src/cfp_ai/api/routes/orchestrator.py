"""Orchestrator API (docs/ai/ORCHESTRATION.md §8).

Every endpoint requires a verified principal. Execution records are visible to
their requester; approvers see only the step awaiting their decision.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request

from cfp_ai.agents.steps import ApprovalDecisionInput
from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.container import Container
from cfp_ai.errors import AppError
from cfp_ai.orchestrator.agents import AgentSummary, describe_agents
from cfp_ai.orchestrator.models import ExecutionRecord, ExecutionStatus, OrchestrationRequest, PendingApproval
from cfp_ai.schemas.public import Page, Suggestion

router = APIRouter(tags=["orchestrator"])


def _container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


@router.get("/v1/orchestrator/agents", response_model=list[AgentSummary])
async def agents(request: Request, principal: CurrentPrincipal) -> list[AgentSummary]:
    return describe_agents(_container(request).capabilities, principal)


@router.post("/v1/orchestrator/executions", response_model=ExecutionRecord)
async def create_execution(
    request: Request, body: OrchestrationRequest, principal: CurrentPrincipal
) -> ExecutionRecord:
    return await _container(request).orchestrator.run(principal, body, request.state.request_id)


@router.get("/v1/orchestrator/executions", response_model=Page[ExecutionRecord])
async def list_executions(
    request: Request,
    principal: CurrentPrincipal,
    status: ExecutionStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> Page[ExecutionRecord]:
    items = _container(request).orchestrator.list_own(principal, status=status, limit=limit)
    return Page[ExecutionRecord](items=items, next_cursor=None)


@router.get("/v1/orchestrator/executions/{execution_id}", response_model=ExecutionRecord)
async def get_execution(request: Request, execution_id: str, principal: CurrentPrincipal) -> ExecutionRecord:
    return _container(request).orchestrator.get(principal, execution_id)


@router.post(
    "/v1/orchestrator/executions/{execution_id}/approvals/{approval_id}/decision",
    response_model=ExecutionRecord,
)
async def decide(
    request: Request,
    execution_id: str,
    approval_id: str,
    body: ApprovalDecisionInput,
    principal: CurrentPrincipal,
) -> ExecutionRecord:
    orchestrator = _container(request).orchestrator
    await orchestrator.decide(principal, execution_id, approval_id, body, request.state.request_id)
    return orchestrator.get(principal, execution_id)


@router.post("/v1/orchestrator/executions/{execution_id}/cancel", response_model=ExecutionRecord)
async def cancel(request: Request, execution_id: str, principal: CurrentPrincipal) -> ExecutionRecord:
    return await _container(request).orchestrator.cancel(principal, execution_id, request.state.request_id)


@router.get("/v1/orchestrator/approvals", response_model=list[PendingApproval])
async def pending_approvals(request: Request, principal: CurrentPrincipal) -> list[PendingApproval]:
    return _container(request).orchestrator.pending_approvals(principal)


# ── Suggestions (AI_API_SPEC.md §2) — created by handoffs that were not executed ──


@router.get("/v1/suggestions", response_model=Page[Suggestion], tags=["discovery"])
async def list_suggestions(request: Request, principal: CurrentPrincipal) -> Page[Suggestion]:
    if principal.employee_id is None:
        return Page[Suggestion](items=[], next_cursor=None)
    items = _container(request).suggestions.list_for_subject(principal.tenant_id, principal.employee_id)
    return Page[Suggestion](items=list(items), next_cursor=None)


@router.post("/v1/suggestions/{suggestion_id}/dismiss", response_model=Suggestion, tags=["discovery"])
async def dismiss_suggestion(request: Request, suggestion_id: str, principal: CurrentPrincipal) -> Suggestion:
    if principal.employee_id is None:
        raise AppError("not_found")
    dismissed = _container(request).suggestions.dismiss(
        principal.tenant_id, principal.employee_id, suggestion_id
    )
    if dismissed is None:
        raise AppError("not_found")
    return dismissed
