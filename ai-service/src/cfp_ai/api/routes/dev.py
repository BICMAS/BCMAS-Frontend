"""Development-only endpoints. Mounted ONLY when env is dev/test (see app.py).

* ``POST /v1/_dev/tokens`` — mint a dev token for a mock persona (auth_mode=dev only).
* ``GET  /v1/_dev/context/{employee_id}`` — inspect the shared context as the caller.
* ``POST /v1/_dev/diagnostics`` — run the foundation smoke-test workflow end to end.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict

from cfp_ai.agents.base import RunContext
from cfp_ai.agents.system.diagnostics import DiagnosticsRequest, DiagnosticsResult
from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.auth.verifier import DevTokenVerifier
from cfp_ai.container import Container
from cfp_ai.context.models import CapabilityContext, ContextRequest
from cfp_ai.errors import AppError
from cfp_ai.observability.context import capability_var

router = APIRouter(prefix="/v1/_dev", tags=["dev-only"])


class TokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    persona: str


class TokenResponse(BaseModel):
    access_token: str
    claims: dict[str, Any]


def _container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


@router.post("/tokens", response_model=TokenResponse)
async def mint_token(request: Request, body: TokenRequest) -> TokenResponse:
    container = _container(request)
    verifier = container.verifier
    if not isinstance(verifier, DevTokenVerifier):
        raise AppError("not_found", internal_detail="dev tokens require auth_mode=dev")
    from cfp_ai.integrations.backend.mock.data import PERSONAS  # dev-only import

    claims = PERSONAS.get(body.persona)
    if claims is None:
        raise AppError("invalid_request", f"Unknown persona. Choose one of: {', '.join(sorted(PERSONAS))}")
    return TokenResponse(access_token=verifier.mint(claims), claims=claims)


@router.get("/context/{employee_id}", response_model=CapabilityContext)
async def inspect_context(
    request: Request, employee_id: str, principal: CurrentPrincipal
) -> CapabilityContext:
    return await _container(request).context.build(
        principal,
        ContextRequest(
            subject_employee_id=employee_id,
            slices=frozenset(
                {
                    "subject_profile",
                    "role_profile",
                    "framework",
                    "capabilities",
                    "learning_history",
                    "development_plans",
                }
            ),
        ),
    )


@router.post("/diagnostics", response_model=DiagnosticsResult)
async def diagnostics(
    request: Request, body: DiagnosticsRequest, principal: CurrentPrincipal
) -> DiagnosticsResult:
    container = _container(request)
    capability = container.capabilities.resolve("system.diagnostics", principal, container.deps)
    capability_var.set("system.diagnostics")
    ctx = RunContext.start(principal, capability.spec, request.state.request_id)
    result: DiagnosticsResult = await capability.run(ctx, body)
    return result
