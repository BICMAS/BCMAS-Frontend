"""Audit trail for consequential and security-relevant actions (QA_REPORT.md §4).

Events carry who (pseudonymised actor hash), tenant, action, resource, outcome and a short,
content-free detail. They never contain message text, responses, names or tokens. Each
event is emitted as a structured ``cfp_ai.audit`` log record (for the SIEM / log pipeline)
and kept in a bounded per-tenant in-memory buffer for the audit API. Durable retention is
the log pipeline's job.
"""

from __future__ import annotations

import logging
from collections import defaultdict, deque
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict

from cfp_ai.auth.principal import Principal
from cfp_ai.observability.context import principal_hash, request_id_var

log = logging.getLogger("cfp_ai.audit")


class AuditEvent(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    at: datetime
    tenant_id: str
    actor_hash: str | None
    action: str
    resource_type: str
    resource: str | None
    outcome: str
    detail: str | None = None
    request_id: str | None = None


class AuditLog:
    def __init__(self, *, per_tenant: int = 10_000) -> None:
        self._events: dict[str, deque[AuditEvent]] = defaultdict(lambda: deque(maxlen=per_tenant))

    def record(
        self,
        *,
        tenant_id: str,
        principal: Principal | None,
        action: str,
        resource_type: str,
        resource: str | None,
        outcome: str,
        detail: str | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            at=datetime.now(UTC),
            tenant_id=tenant_id,
            actor_hash=principal_hash(principal.subject) if principal else None,
            action=action,
            resource_type=resource_type,
            resource=resource,
            outcome=outcome,
            detail=detail[:300] if detail else None,
            request_id=request_id_var.get(),
        )
        self._events[tenant_id].append(event)
        log.info("audit", extra={"audit": event.model_dump(mode="json")})
        return event

    def events(self, tenant_id: str | None = None, *, limit: int = 1_000) -> list[AuditEvent]:
        if tenant_id is not None:
            return list(self._events[tenant_id])[-limit:]
        merged = [e for events in self._events.values() for e in events]
        return sorted(merged, key=lambda e: e.at)[-limit:]

    def erase_subject_references(self, tenant_id: str, resource: str) -> None:
        """Audit events are content-free; nothing to erase beyond resource IDs (kept for accountability)."""
        return None
