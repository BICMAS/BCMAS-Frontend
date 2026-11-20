"""Collaborative workflow API (docs/ai/WORKFLOWS.md §7).

Workflows are visible to their initiator, the employee, the employee's line manager and HR.
Every call acts as the caller: advancing runs the next stages with the caller's rights, and a
stage that needs someone else waits for them (``awaiting``). Human actions on drafts and
scoring sets advance waiting workflows automatically.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Query, Request, Response

from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.workflows.engine import WorkflowService
from cfp_ai.workflows.models import (
    StartWorkflowRequest,
    WorkflowDefinitionView,
    WorkflowEvent,
    WorkflowRecord,
    WorkflowStatus,
)

router = APIRouter(prefix="/v1/workflows", tags=["workflows"])


def _svc(request: Request) -> WorkflowService:
    service: WorkflowService = request.app.state.container.workflows
    return service


@router.get("/definitions", response_model=list[WorkflowDefinitionView])
async def definitions(request: Request, principal: CurrentPrincipal) -> list[WorkflowDefinitionView]:
    return _svc(request).definitions()


@router.post("", response_model=WorkflowRecord, status_code=201)
async def start(
    request: Request,
    response: Response,
    body: StartWorkflowRequest,
    principal: CurrentPrincipal,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=128)] = None,
) -> WorkflowRecord:
    """Starts a workflow, or returns the active one for the same type and employee (200, no duplicate)."""
    record, created = await _svc(request).start(
        principal, body, request.state.request_id, idempotency_key=idempotency_key
    )
    if not created:
        response.status_code = 200
    return record


@router.get("", response_model=list[WorkflowRecord])
async def list_workflows(
    request: Request,
    principal: CurrentPrincipal,
    subject_employee_id: Annotated[str | None, Query(max_length=128)] = None,
    status: WorkflowStatus | None = None,
) -> list[WorkflowRecord]:
    return await _svc(request).list_workflows(
        principal, subject_employee_id=subject_employee_id, status=status
    )


@router.get("/{workflow_id}", response_model=WorkflowRecord)
async def get(request: Request, workflow_id: str, principal: CurrentPrincipal) -> WorkflowRecord:
    return await _svc(request).get(principal, workflow_id)


@router.get("/{workflow_id}/events", response_model=list[WorkflowEvent])
async def events(request: Request, workflow_id: str, principal: CurrentPrincipal) -> list[WorkflowEvent]:
    """Audit trail: every transition with time, stage and pseudonymised actor."""
    return (await _svc(request).get(principal, workflow_id)).events


@router.post("/{workflow_id}/advance", response_model=WorkflowRecord)
async def advance(request: Request, workflow_id: str, principal: CurrentPrincipal) -> WorkflowRecord:
    return await _svc(request).advance(principal, workflow_id, request.state.request_id)


@router.post("/{workflow_id}/retry", response_model=WorkflowRecord)
async def retry(request: Request, workflow_id: str, principal: CurrentPrincipal) -> WorkflowRecord:
    """Recovery: resume a failed workflow from the failed stage (or its declared restart point)."""
    return await _svc(request).advance(principal, workflow_id, request.state.request_id, retry=True)


@router.post("/{workflow_id}/cancel", response_model=WorkflowRecord)
async def cancel(request: Request, workflow_id: str, principal: CurrentPrincipal) -> WorkflowRecord:
    return await _svc(request).cancel(principal, workflow_id)
