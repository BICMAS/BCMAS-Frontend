"""Health, readiness, metrics, capability discovery and platform admin endpoints."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel

from cfp_ai import __version__
from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.container import Container
from cfp_ai.errors import AppError
from cfp_ai.schemas.public import AdminHealthResponse, CapabilitiesResponse, DependencyHealth

router = APIRouter()


def _container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


@router.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz", include_in_schema=False)
async def readyz(request: Request, response: Response) -> dict[str, str]:
    container = _container(request)
    if not container.providers:
        response.status_code = 503
        return {"status": "not_ready", "reason": "no LLM provider configured"}
    return {"status": "ready"}


@router.get("/internal/metrics", include_in_schema=False)
async def metrics(request: Request) -> Response:
    """Prometheus scrape endpoint. Must be reachable only from the internal network."""
    container = _container(request)
    if not container.settings.metrics_enabled:
        raise AppError("not_found")
    return Response(generate_latest(container.metrics.registry), media_type=CONTENT_TYPE_LATEST)


@router.get("/v1/capabilities", response_model=CapabilitiesResponse, tags=["discovery"])
async def capabilities(request: Request, principal: CurrentPrincipal) -> CapabilitiesResponse:
    container = _container(request)
    return CapabilitiesResponse(
        tenant_id=principal.tenant_id,
        capabilities=container.capabilities.public_status(principal),
    )


class IdentityResponse(BaseModel):
    """The verified caller as the AI service sees it (v1.7, pending review). No token data."""

    tenant_id: str
    employee_id: str | None
    principal_type: str
    roles: list[str]
    entitlements: list[str]


@router.get("/v1/me/identity", response_model=IdentityResponse, tags=["discovery"])
async def identity(request: Request, principal: CurrentPrincipal) -> IdentityResponse:
    return IdentityResponse(
        tenant_id=principal.tenant_id,
        employee_id=principal.employee_id,
        principal_type=principal.type,
        roles=sorted(principal.roles),
        entitlements=sorted(_container(request).capabilities.entitlements(principal)),
    )


@router.get("/v1/admin/health", response_model=AdminHealthResponse, tags=["platform"])
async def admin_health(request: Request, principal: CurrentPrincipal) -> AdminHealthResponse:
    if not principal.has_any_role("platform_super_admin"):
        raise AppError("forbidden")
    container = _container(request)
    settings = container.settings
    deps: list[DependencyHealth] = []
    for name in ("anthropic", "openai"):
        configured = name in container.providers
        deps.append(
            DependencyHealth(
                name=f"llm:{name}",
                status="healthy" if configured else "not_configured",
                detail="API key configured" if configured else None,
            )
        )
    backend_status = "degraded" if settings.backend_mode.value == "mock" else "healthy"
    deps.append(
        DependencyHealth(name="backend", status=backend_status, detail=f"mode={settings.backend_mode.value}")
    )
    counts = container.endpoints.counts()
    deps.append(
        DependencyHealth(
            name="backend:endpoints",
            status="healthy" if counts.get("available") else "degraded",
            detail=", ".join(f"{k}={v}" for k, v in sorted(counts.items())),
        )
    )
    deps.append(DependencyHealth(name="memory", status="degraded", detail="in-memory store (not durable)"))
    overall = "healthy" if container.providers else "down"
    if overall == "healthy" and any(d.status == "degraded" for d in deps):
        overall = "degraded"
    return AdminHealthResponse(
        status=overall, version=__version__, dependencies=deps, checked_at=datetime.now(UTC)
    )
