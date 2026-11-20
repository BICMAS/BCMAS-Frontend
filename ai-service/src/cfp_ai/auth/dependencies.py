"""FastAPI dependencies for authentication and authorisation pre-checks."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from cfp_ai.auth.principal import Principal
from cfp_ai.errors import AppError
from cfp_ai.observability.context import principal_hash, principal_hash_var, tenant_id_var


async def get_principal(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError("unauthenticated", internal_detail="missing bearer token")
    principal: Principal = await request.app.state.container.verifier.verify(token.strip())
    tenant_id_var.set(principal.tenant_id)
    principal_hash_var.set(principal_hash(principal.subject))
    return principal


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


def require_roles(*roles: str) -> object:
    async def checker(principal: CurrentPrincipal) -> Principal:
        if not principal.has_any_role(*roles):
            raise AppError("forbidden", internal_detail=f"requires one of {roles}")
        return principal

    return Depends(checker)
