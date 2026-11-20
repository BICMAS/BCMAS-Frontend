"""Audit trail API (QA_REPORT.md §4). HR/L&D and platform admins only, always tenant-scoped."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Request

from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.errors import AppError
from cfp_ai.security.audit import AuditEvent, AuditLog

router = APIRouter(prefix="/v1/audit", tags=["audit"])


@router.get("/events", response_model=list[AuditEvent])
async def events(
    request: Request,
    principal: CurrentPrincipal,
    action: Annotated[str | None, Query(max_length=64)] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> list[AuditEvent]:
    if not principal.has_any_role("hr_ld_admin", "platform_super_admin"):
        raise AppError("forbidden")
    audit: AuditLog = request.app.state.container.audit
    rows = audit.events(principal.tenant_id, limit=1000)
    if action:
        rows = [e for e in rows if e.action == action]
    return rows[-limit:]
