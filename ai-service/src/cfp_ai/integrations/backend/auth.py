"""Backend authentication (BACKEND_INTEGRATION_SPEC.md §4.2).

Two separate credentials, never mixed:

* **User identity** for every employee-data read. ``ForwardUserToken`` (default) forwards the
  caller's verified bearer token. ``TokenExchange`` swaps it for a backend-audience token via
  RFC 8693 (BE-002). Either way the backend enforces the *user's* permissions.
* **Service identity** (``ClientCredentialsTokens``, BE-003) only for tenant reference feeds
  and AI → backend events, which have no user. Service-token calls carry ``X-Tenant-ID``.
  Agents never receive the service client.

Expired user tokens are rejected before any network call. Tokens are never logged.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import UTC, datetime
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from cfp_ai.auth.principal import Principal
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry

_REFRESH_SKEW_S = 60
_EXCHANGE_TYPE = "urn:ietf:params:oauth:token-type:access_token"


class TokenResponse(BaseModel):
    """RFC 6749 / 8693 token response (validated; extra fields ignored)."""

    model_config = ConfigDict(extra="ignore")

    access_token: str = Field(min_length=10)
    token_type: str
    expires_in: int = Field(gt=0, le=86_400)


class UserIdentity(Protocol):
    async def authorization(self, principal: Principal) -> str: ...


def _check_not_expired(principal: Principal) -> None:
    if principal.token_expires_at is not None and principal.token_expires_at <= datetime.now(UTC):
        raise BackendError("BE-000", "unauthorized", "user token expired")


class ForwardUserToken:
    """Default: forward the verified user token (the backend must accept the AI audience or a shared one)."""

    async def authorization(self, principal: Principal) -> str:
        _check_not_expired(principal)
        return f"Bearer {principal.token}"


async def _post_token(
    http: httpx.AsyncClient, endpoint_id: str, path: str, form: dict[str, str]
) -> TokenResponse:
    try:
        response = await http.post(path, data=form, timeout=httpx.Timeout(3.0, connect=1.0))
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        raise BackendError(endpoint_id, "unavailable", type(exc).__name__) from exc
    if response.status_code in (400, 401, 403):
        raise BackendError(endpoint_id, "unauthorized", f"token endpoint HTTP {response.status_code}")
    if response.status_code >= 400:
        raise BackendError(endpoint_id, "unavailable", f"token endpoint HTTP {response.status_code}")
    try:
        token = TokenResponse.model_validate(response.json())
    except (ValueError, ValidationError) as exc:
        raise BackendError(endpoint_id, "contract_violation", "invalid token response") from exc
    if token.token_type.lower() != "bearer":
        raise BackendError(endpoint_id, "contract_violation", "unsupported token type")
    return token


class TokenExchange:
    """RFC 8693 on-behalf-of exchange (BE-002, PROPOSED). Cached per user token until expiry."""

    endpoint_id = "BE-002"

    def __init__(
        self,
        *,
        http: httpx.AsyncClient,
        registry: BackendEndpointRegistry,
        audience: str,
        client_id: str,
        client_secret: str,
        path: str = "/oauth/token",
    ) -> None:
        self._http, self._registry, self._path = http, registry, path
        self._audience, self._client_id, self._client_secret = audience, client_id, client_secret
        self._cache: dict[str, tuple[str, float]] = {}
        self._lock = asyncio.Lock()

    async def authorization(self, principal: Principal) -> str:
        _check_not_expired(principal)
        if not self._registry.is_callable(self.endpoint_id):
            raise BackendError(
                self.endpoint_id, "not_callable", f"status={self._registry.status(self.endpoint_id)}"
            )
        key = hashlib.sha256(principal.token.encode()).hexdigest()
        async with self._lock:
            cached = self._cache.get(key)
            if cached and cached[1] > time.monotonic():
                return f"Bearer {cached[0]}"
            token = await _post_token(
                self._http,
                self.endpoint_id,
                self._path,
                {
                    "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                    "subject_token": principal.token,
                    "subject_token_type": _EXCHANGE_TYPE,
                    "audience": self._audience,
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                },
            )
            lifetime = token.expires_in
            if principal.token_expires_at is not None:  # never outlive the user's own token
                lifetime = min(
                    lifetime, int((principal.token_expires_at - datetime.now(UTC)).total_seconds())
                )
            self._cache[key] = (token.access_token, time.monotonic() + max(0, lifetime - _REFRESH_SKEW_S))
            if len(self._cache) > 10_000:
                self._cache.pop(next(iter(self._cache)))
            return f"Bearer {token.access_token}"


class ServiceTokens(Protocol):
    async def authorization(self, tenant_id: str) -> str: ...


class NoServiceIdentity:
    """No service credentials configured: service-token endpoints are honestly not connected."""

    async def authorization(self, tenant_id: str) -> str:
        raise BackendError("BE-003", "not_callable", "no service credentials configured")


class ClientCredentialsTokens:
    """OAuth 2.0 client credentials (BE-003, PROPOSED), one cached token per tenant."""

    endpoint_id = "BE-003"

    def __init__(
        self,
        *,
        http: httpx.AsyncClient,
        registry: BackendEndpointRegistry,
        client_id: str,
        client_secret: str,
        scope: str = "ai.reference.read ai.events.write",
        path: str = "/oauth/token",
    ) -> None:
        self._http, self._registry, self._path = http, registry, path
        self._client_id, self._client_secret, self._scope = client_id, client_secret, scope
        self._cache: dict[str, tuple[str, float]] = {}
        self._lock = asyncio.Lock()
        self.issued = 0  # observability / tests

    async def authorization(self, tenant_id: str) -> str:
        if not self._registry.is_callable(self.endpoint_id):
            raise BackendError(
                self.endpoint_id, "not_callable", f"status={self._registry.status(self.endpoint_id)}"
            )
        async with self._lock:  # one refresh at a time (no token stampede)
            cached = self._cache.get(tenant_id)
            if cached and cached[1] > time.monotonic():
                return f"Bearer {cached[0]}"
            token = await _post_token(
                self._http,
                self.endpoint_id,
                self._path,
                {
                    "grant_type": "client_credentials",
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "scope": self._scope,
                    "tenant_id": tenant_id,
                },
            )
            self.issued += 1
            self._cache[tenant_id] = (
                token.access_token,
                time.monotonic() + max(0, token.expires_in - _REFRESH_SKEW_S),
            )
            return f"Bearer {token.access_token}"

    def invalidate(self, tenant_id: str) -> None:
        self._cache.pop(tenant_id, None)
