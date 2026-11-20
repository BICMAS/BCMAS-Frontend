"""Token verification (AI_TECHNICAL_SPEC.md §10.1).

* ``JwksTokenVerifier`` — production: backend-issued JWTs verified against the
  backend's JWKS (BE-001, PROPOSED). Issuer/audience/algorithms are allow-listed.
* ``DevTokenVerifier`` — dev/test only: HS256 tokens minted locally for the mock
  personas. Refuses to construct outside dev/test.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Protocol

import jwt
from pydantic import ValidationError

from cfp_ai.auth.principal import ALL_ENTITLEMENTS, ALL_ROLES, Principal
from cfp_ai.errors import AppError
from cfp_ai.settings import Environment


class TokenVerifier(Protocol):
    async def verify(self, token: str) -> Principal: ...


def _principal_from_claims(claims: Mapping[str, Any], token: str) -> Principal:
    for required in ("sub", "tenant_id", "roles", "exp"):
        if required not in claims:
            raise AppError("unauthenticated", internal_detail=f"missing claim {required}")
    roles = claims["roles"]
    if not isinstance(roles, list) or not roles:
        raise AppError("unauthenticated", internal_detail="roles claim must be a non-empty list")
    known_roles = frozenset(r for r in roles if r in ALL_ROLES)
    scopes = frozenset(str(claims.get("scope", "")).split()) if claims.get("scope") else frozenset()
    sub = str(claims["sub"])
    principal_type = "candidate" if sub.startswith("candidate:") else "user"
    if principal_type == "candidate" and not any(s.startswith("assessment:") for s in scopes):
        raise AppError("unauthenticated", internal_detail="candidate token without assessment scope")
    raw_entitlements = claims.get("ai_entitlements")
    entitlements = (
        frozenset(e for e in raw_entitlements if e in ALL_ENTITLEMENTS)
        if isinstance(raw_entitlements, list)
        else None
    )
    try:
        return Principal(
            type=principal_type,
            subject=sub,
            tenant_id=str(claims["tenant_id"]),
            roles=known_roles,
            employee_id=claims.get("employee_id"),
            scopes=scopes,
            entitlements=entitlements,
            token=token,
            token_expires_at=datetime.fromtimestamp(int(claims["exp"]), UTC),
        )
    except (ValidationError, TypeError, ValueError) as exc:
        raise AppError("unauthenticated", internal_detail=f"invalid claims: {exc}") from exc


class JwksTokenVerifier:
    """Verifies RS256/ES256 JWTs against a JWKS endpoint.

    ``key_resolver`` is injectable for tests; by default PyJWKClient fetches and
    caches the JWKS (blocking I/O, so it runs in a worker thread).
    """

    def __init__(
        self,
        *,
        jwks_url: str,
        issuers: list[str],
        audiences: list[str],
        algorithms: list[str],
        leeway_s: int,
        cache_s: int,
        key_resolver: Callable[[str], Any] | None = None,
    ) -> None:
        self._issuers = issuers
        self._audiences = audiences
        self._algorithms = algorithms
        self._leeway = leeway_s
        if key_resolver is None:
            client = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=cache_s)

            def resolve(token: str) -> Any:
                return client.get_signing_key_from_jwt(token).key

            key_resolver = resolve
        self._resolve_key = key_resolver

    async def verify(self, token: str) -> Principal:
        try:
            key = await asyncio.to_thread(self._resolve_key, token)
            claims = jwt.decode(
                token,
                key=key,
                algorithms=self._algorithms,
                audience=self._audiences,
                leeway=self._leeway,
                options={"require": ["exp", "iat", "sub", "iss"]},
            )
        except jwt.PyJWKClientError as exc:
            raise AppError("unauthenticated", internal_detail=f"jwks: {exc}") from exc
        except jwt.InvalidTokenError as exc:
            raise AppError("unauthenticated", internal_detail=f"jwt: {exc}") from exc
        if claims.get("iss") not in self._issuers:
            raise AppError("unauthenticated", internal_detail="issuer not allowed")
        return _principal_from_claims(claims, token)


class DevTokenVerifier:
    """HS256 tokens for local development and tests. Never used in staging/prod."""

    ISSUER = "cfp-ai-dev"
    AUDIENCE = "cfp-ai-dev"

    def __init__(self, *, secret: str, environment: Environment) -> None:
        if not environment.is_local:
            raise RuntimeError("DevTokenVerifier is only allowed in dev/test")
        self._secret = secret

    async def verify(self, token: str) -> Principal:
        try:
            claims = jwt.decode(
                token,
                key=self._secret,
                algorithms=["HS256"],
                audience=self.AUDIENCE,
                issuer=self.ISSUER,
                options={"require": ["exp", "sub"]},
            )
        except jwt.InvalidTokenError as exc:
            raise AppError("unauthenticated", internal_detail=f"dev jwt: {exc}") from exc
        return _principal_from_claims(claims, token)

    def mint(self, claims: Mapping[str, Any], *, ttl_s: int = 900) -> str:
        now = int(time.time())
        payload = {"iss": self.ISSUER, "aud": self.AUDIENCE, "iat": now, "exp": now + ttl_s}
        payload.update(claims)
        return jwt.encode(payload, self._secret, algorithm="HS256")
