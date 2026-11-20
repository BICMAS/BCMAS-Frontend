"""Backend → AI domain events receiver (BE-080, PROPOSED — BACKEND_HANDOVER.md §6.1).

Not authenticated with a user token: the backend signs each delivery with
``X-CFP-Signature: sha256=HMAC(secret, timestamp + "." + raw_body)``. Stale timestamps are
rejected and ``event_id`` is de-duplicated (delivery is at-least-once). Events never carry
data the AI trusts as a record — they only invalidate caches, confirm draft commits,
create suggestions, or trigger erasure. The AI re-reads the backend for facts.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from collections import OrderedDict
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from pydantic import ValidationError
from ulid import ULID

from cfp_ai.container import Container
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.dto import BackendEvent
from cfp_ai.schemas.public import Suggestion

router = APIRouter(tags=["events"])
log = logging.getLogger(__name__)
_SEEN_MAX = 10_000

_REVIEW_TRIGGERS = {"capability.verified", "assessment.cycle.completed"}
_INVALIDATING = _REVIEW_TRIGGERS | {
    "learning.record.completed",
    "employee.role.changed",
    "evidence.submitted",
    "development_plan.created",
    "development_plan.updated",
}
_ERASURE = {"employee.deleted", "user.erasure_requested"}
_REFERENCE = {
    "framework.skill.updated",
    "framework.skill.published",
    "role.profile.published",
    "learning.catalogue.updated",
}


class EventDeduplicator:
    """Bounded in-memory set of processed event IDs (per replica; a shared store in production)."""

    def __init__(self, max_size: int = _SEEN_MAX) -> None:
        self._seen: OrderedDict[str, None] = OrderedDict()
        self._max = max_size

    def seen(self, event_id: str) -> bool:
        if event_id in self._seen:
            return True
        self._seen[event_id] = None
        if len(self._seen) > self._max:
            self._seen.popitem(last=False)
        return False


def verify_signature(secret: str, timestamp: str, body: bytes, signature: str, *, max_skew_s: int) -> None:
    try:
        sent = int(timestamp)
    except ValueError as exc:
        raise AppError("unauthenticated", "Invalid event timestamp.") from exc
    if abs(time.time() - sent) > max_skew_s:
        raise AppError("unauthenticated", "Stale event timestamp.")
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(f"sha256={expected}", signature):
        raise AppError("unauthenticated", "Invalid event signature.")


def _employee(event: BackendEvent) -> str | None:
    value = event.data.get("employee_id")
    if isinstance(value, str):
        return value
    return event.subject.id if event.subject.type == "employee" else None


@router.post("/v1/events", status_code=202)
async def receive(request: Request) -> Response:
    container: Container = request.app.state.container
    settings = container.settings
    if settings.webhook_secret is None:
        raise AppError("ai_unavailable", "Event delivery is not configured.")
    body = await request.body()
    verify_signature(
        settings.webhook_secret.get_secret_value(),
        request.headers.get("X-CFP-Timestamp", ""),
        body,
        request.headers.get("X-CFP-Signature", ""),
        max_skew_s=settings.webhook_max_skew_s,
    )
    try:
        event = BackendEvent.model_validate_json(body)
    except ValidationError as exc:
        raise AppError("invalid_request", "Malformed event.") from exc
    dedup: EventDeduplicator = request.app.state.event_dedup
    if dedup.seen(f"{event.tenant_id}:{event.event_id}"):
        return Response(status_code=202)
    await handle_event(container, event)
    return Response(status_code=202)


async def handle_event(container: Container, event: BackendEvent) -> None:
    tenant, employee = event.tenant_id, _employee(event)
    if event.type in _ERASURE and employee is not None:
        coaching = await container.coaching.erase_employee(tenant, employee)
        drafts = container.drafts.erase_subject(tenant, employee)
        suggestions = container.suggestions.erase_subject(tenant, employee)
        container.talent_results.erase_subject(tenant, employee)
        container.workflows.erase_subject(tenant, employee)
        container.audit.record(
            tenant_id=tenant,
            principal=None,
            action="subject_erased",
            resource_type="employee",
            resource=None,
            outcome="completed",
            detail=event.type,
        )
        container.context.invalidate_subject(tenant, employee)
        log.info(
            "subject erased",
            extra={"event_type": event.type, "drafts": drafts, "suggestions": suggestions, **coaching},
        )
        return
    if event.type in _INVALIDATING and employee is not None:
        container.context.invalidate_subject(tenant, employee)
    if event.type in _REFERENCE:  # framework, role or catalogue changed: drop cached reference data
        invalidate = getattr(container.backend, "invalidate_reference", None)  # HTTP client only
        if invalidate is not None:
            invalidate(tenant)
    if event.type == "development_plan.created":
        source = event.data.get("source") or {}
        draft_id, plan_id = source.get("draft_id"), event.data.get("plan_id")
        if isinstance(draft_id, str) and isinstance(plan_id, str):
            container.drafts.confirm_commit_from_event(tenant, draft_id, plan_id)
    if event.type in _REVIEW_TRIGGERS and employee is not None:
        what = (
            "a capability level was verified"
            if event.type == "capability.verified"
            else "an assessment closed"
        )
        container.suggestions.add(
            tenant,
            Suggestion(
                suggestion_id=f"sug_{ULID()}",
                kind="plan_review",
                subject_employee_id=employee,
                title="Review the development plan with the new evidence",
                detail=f"New evidence: {what}. Reviewing the plan may update goals or mark them complete.",
                source_handoff="talent.assessment_reported",
                ref_id=event.data.get("plan_id") if isinstance(event.data.get("plan_id"), str) else None,
                status="pending",
                created_at=datetime.now(UTC),
            ),
        )
