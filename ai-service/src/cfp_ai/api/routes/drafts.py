"""Draft review API (AI_API_SPEC.md §6, §12.3).

AI-generated plans and plan adjustments are drafts. Reviewers may propose edits
(re-validated with the same rules as generation), then accept, edit-and-accept or
reject. Acceptance returns a commit plan; the frontend performs the backend write with
the reviewer's own token and reports the result back. The AI service never writes
official development records itself.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request

from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.drafts.service import DraftEnvelope, DraftService, ProposeEditRequest, ResolveRequest
from cfp_ai.schemas.public import DraftCommitReport, DraftStatus

router = APIRouter(prefix="/v1/drafts", tags=["drafts"])


def _drafts(request: Request) -> DraftService:
    service: DraftService = request.app.state.container.drafts
    return service


@router.get("", response_model=list[DraftEnvelope])
async def list_drafts(
    request: Request,
    principal: CurrentPrincipal,
    subject_employee_id: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    status: DraftStatus | None = None,
) -> list[DraftEnvelope]:
    return await _drafts(request).list(principal, subject_employee_id=subject_employee_id, status=status)


@router.get("/{draft_id}", response_model=DraftEnvelope)
async def get_draft(request: Request, draft_id: str, principal: CurrentPrincipal) -> DraftEnvelope:
    return await _drafts(request).get(principal, draft_id)


@router.patch("/{draft_id}", response_model=DraftEnvelope)
async def propose_edit(
    request: Request, draft_id: str, body: ProposeEditRequest, principal: CurrentPrincipal
) -> DraftEnvelope:
    return await _drafts(request).propose_edit(principal, draft_id, body)


@router.post("/{draft_id}/resolution", response_model=DraftEnvelope)
async def resolve(
    request: Request, draft_id: str, body: ResolveRequest, principal: CurrentPrincipal
) -> DraftEnvelope:
    envelope = await _drafts(request).resolve(principal, draft_id, body)
    await request.app.state.container.workflows.notify(principal, "draft", draft_id, request.state.request_id)
    return envelope


@router.post("/{draft_id}/commit-report", response_model=DraftEnvelope)
async def commit_report(
    request: Request, draft_id: str, body: DraftCommitReport, principal: CurrentPrincipal
) -> DraftEnvelope:
    envelope = await _drafts(request).commit_report(principal, draft_id, body.committed_ref)
    await request.app.state.container.workflows.notify(principal, "draft", draft_id, request.state.request_id)
    return envelope
