"""HTTP implementation of ``BackendClient`` and ``ServiceBackendClient`` (BACKEND_INTEGRATION_SPEC.md §4).

Every call:
  * is checked against the endpoint registry first: endpoints that are not ``available`` (or
    ``mocked`` in dev/test) are never requested, so nothing pretends to be connected;
  * authenticates as the **user** (forwarded or exchanged token) for employee data, or as the
    **service** (client credentials, ``X-Tenant-ID``) for tenant reference feeds and events;
  * propagates ``X-Request-ID``, ``traceparent`` and the API version (``X-API-Version``);
  * retries transient failures (GET, and POST only with an ``Idempotency-Key``) with jittered
    backoff, honouring ``Retry-After`` on 429/503, behind a per-endpoint circuit breaker;
  * validates responses: JSON content type, size cap, API major version, DTO schema, and
    tenant/employee cross-checks; deprecation headers are logged and counted;
  * follows cursor pagination up to a page cap; caches tenant reference data with ETags.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Literal, TypeVar
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ValidationError

from cfp_ai import __version__
from cfp_ai.auth.principal import Principal
from cfp_ai.integrations.backend.auth import ForwardUserToken, NoServiceIdentity, ServiceTokens, UserIdentity
from cfp_ai.integrations.backend.cache import REFERENCE_ENDPOINTS, ReferenceCache
from cfp_ai.integrations.backend.circuit import CircuitBreaker
from cfp_ai.integrations.backend.dto import (
    AiOutboundEvent,
    AssessmentHistoryDTO,
    AssessmentItemDTO,
    AssessmentResponseDTO,
    CapabilityLevelDTO,
    CatalogueItemDTO,
    DevelopmentPlanDTO,
    DirectReportDTO,
    EmployeeDTO,
    FrameworkLevelDTO,
    LearningRecordDTO,
    LibraryItemDTO,
    MeDTO,
    OrgUnitDTO,
    PerformanceSummaryDTO,
    RoleDTO,
    RoleProfileDTO,
    SkillDTO,
    TalentAssessmentDTO,
    TenantEntitlementsDTO,
)
from cfp_ai.integrations.backend.errors import BackendError, BackendErrorKind
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.observability.context import request_id_var, traceparent_var
from cfp_ai.observability.metrics import Metrics

log = logging.getLogger(__name__)

DtoT = TypeVar("DtoT", bound=BaseModel)

_RETRYABLE_STATUS = frozenset({429, 502, 503, 504})
_PAGE_LIMIT = 200
_MAX_RETRY_AFTER_S = 5.0


def _seg(value: str) -> str:
    """Encode a path segment; IDs are opaque and must not alter the path."""
    return quote(value, safe="")


class HttpBackendClient:
    def __init__(
        self,
        *,
        base_url: str,
        registry: BackendEndpointRegistry,
        metrics: Metrics,
        connect_timeout_s: float = 1.0,
        read_timeout_s: float = 2.0,
        list_timeout_s: float = 5.0,
        max_retries: int = 2,
        breaker: CircuitBreaker | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        backoff_base_s: float = 0.1,
        api_version: str = "1",
        identity: UserIdentity | None = None,
        service_tokens: ServiceTokens | None = None,
        reference_cache: ReferenceCache | None = None,
        max_pages: int = 10,
        max_response_bytes: int = 5_000_000,
        verify: bool | str = True,
        cert: tuple[str, str] | None = None,
    ) -> None:
        self._registry = registry
        self._metrics = metrics
        self._read_timeout = httpx.Timeout(read_timeout_s, connect=connect_timeout_s)
        self._list_timeout = httpx.Timeout(list_timeout_s, connect=connect_timeout_s)
        self._max_retries = max_retries
        self._breaker = breaker or CircuitBreaker()
        self._backoff_base = backoff_base_s
        self._api_major = api_version.split(".")[0]
        self._identity = identity or ForwardUserToken()
        self._service = service_tokens or NoServiceIdentity()
        self._cache = reference_cache
        self._max_pages = max_pages
        self._max_bytes = max_response_bytes
        self._deprecation_logged: set[str] = set()
        self.http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            transport=transport,
            verify=verify,
            cert=cert,
            follow_redirects=False,  # never follow redirects with credentials attached
            headers={
                "Accept": "application/json",
                "User-Agent": f"cfp-ai-service/{__version__}",
                "X-CFP-Caller": "ai-service",
                "X-API-Version": api_version,
            },
        )

    def set_identity(self, identity: UserIdentity, service_tokens: ServiceTokens | None = None) -> None:
        """Late binding: token providers share this client's HTTP connection pool."""
        self._identity = identity
        if service_tokens is not None:
            self._service = service_tokens

    async def aclose(self) -> None:
        await self.http.aclose()

    def invalidate_reference(self, tenant_id: str) -> int:
        """Drop cached reference data for a tenant (framework, role or catalogue change events)."""
        return self._cache.invalidate_tenant(tenant_id) if self._cache else 0

    # ── transport ────────────────────────────────────────────────────────

    async def _headers(
        self, endpoint_id: str, principal: Principal | None, tenant_id: str | None
    ) -> dict[str, str]:
        if principal is not None:
            try:
                authorization = await self._identity.authorization(principal)
            except BackendError as exc:
                raise BackendError(endpoint_id, exc.kind, str(exc)) from exc
            headers = {"Authorization": authorization}
        else:
            assert tenant_id is not None
            headers = {
                "Authorization": await self._service.authorization(tenant_id),
                "X-Tenant-ID": tenant_id,
            }
        if rid := request_id_var.get():
            headers["X-Request-ID"] = rid
        if tp := traceparent_var.get():
            headers["traceparent"] = tp
        return headers

    async def _send(
        self,
        endpoint_id: str,
        path: str,
        *,
        principal: Principal | None = None,
        tenant_id: str | None = None,
        method: Literal["GET", "POST"] = "GET",
        params: dict[str, Any] | None = None,
        body: Any = None,
        is_list: bool = False,
        idempotency_key: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        if not self._registry.is_callable(endpoint_id):
            self._metrics.backend_requests.labels(endpoint_id, "not_callable").inc()
            raise BackendError(endpoint_id, "not_callable", f"status={self._registry.status(endpoint_id)}")
        if self._breaker.is_open(endpoint_id):
            self._metrics.backend_circuit_open.labels(endpoint_id).set(1)
            self._metrics.backend_requests.labels(endpoint_id, "circuit_open").inc()
            raise BackendError(endpoint_id, "unavailable", "circuit open")
        self._metrics.backend_circuit_open.labels(endpoint_id).set(0)
        retryable_call = method == "GET" or idempotency_key is not None
        timeout = self._list_timeout if is_list else self._read_timeout
        attempt, auth_refreshed = 0, False
        while True:
            headers = {**await self._headers(endpoint_id, principal, tenant_id), **(extra_headers or {})}
            if idempotency_key:
                headers["Idempotency-Key"] = idempotency_key
            retry_after: float | None = None
            try:
                response = await self.http.request(
                    method, path, params=params, json=body, headers=headers, timeout=timeout
                )
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                failure: BackendErrorKind = "unavailable"
                detail, status_label = type(exc).__name__, "transport_error"
            else:
                status_label = str(response.status_code)
                self._check_version(endpoint_id, response)
                if response.status_code < 400:
                    self._breaker.record(endpoint_id, ok=True)
                    self._metrics.backend_requests.labels(endpoint_id, status_label).inc()
                    return response
                failure = self._classify(response.status_code)
                detail = f"HTTP {response.status_code}"
                if response.status_code == 401 and principal is None and not auth_refreshed:
                    invalidate = getattr(self._service, "invalidate", None)
                    if invalidate is not None:  # expired service token: refresh once
                        invalidate(tenant_id)
                        auth_refreshed = True
                        self._metrics.backend_requests.labels(endpoint_id, status_label).inc()
                        continue
                if response.status_code not in _RETRYABLE_STATUS:
                    self._breaker.record(endpoint_id, ok=failure != "unavailable")
                    self._metrics.backend_requests.labels(endpoint_id, status_label).inc()
                    raise BackendError(endpoint_id, failure, detail)
                retry_after = self._retry_after(response)
            self._metrics.backend_requests.labels(endpoint_id, status_label).inc()
            if not retryable_call or attempt >= self._max_retries:
                if failure == "unavailable":
                    self._breaker.record(endpoint_id, ok=False)
                raise BackendError(endpoint_id, failure, detail)
            attempt += 1
            delay = (
                retry_after
                if retry_after is not None
                else self._backoff_base * (4 ** (attempt - 1)) * (0.5 + random.random())  # noqa: S311
            )
            self._metrics.backend_retries.labels(endpoint_id, status_label).inc()
            log.warning(
                "backend retry", extra={"endpoint_id": endpoint_id, "attempt": attempt, "delay_s": delay}
            )
            await asyncio.sleep(delay)

    @staticmethod
    def _retry_after(response: httpx.Response) -> float | None:
        value = response.headers.get("retry-after")
        if value is None:
            return None
        try:
            return min(_MAX_RETRY_AFTER_S, max(0.0, float(value)))
        except ValueError:
            return _MAX_RETRY_AFTER_S  # HTTP-date form: wait the maximum

    @staticmethod
    def _classify(status: int) -> BackendErrorKind:
        if status == 401:
            return "unauthorized"
        if status == 403:
            return "forbidden"
        if status == 404:
            return "not_found"
        if status == 409:
            return "conflict"
        if status in (400, 422):
            return "bad_request"
        if status == 429:
            return "rate_limited"
        return "unavailable"

    def _check_version(self, endpoint_id: str, response: httpx.Response) -> None:
        served = response.headers.get("x-api-version")
        if served is not None and served.split(".")[0] != self._api_major:
            self._metrics.backend_version_mismatch.labels(endpoint_id).inc()
            self._metrics.backend_contract_violations.labels(endpoint_id).inc()
            raise BackendError(
                endpoint_id, "contract_violation", f"API version {served}, expected {self._api_major}"
            )
        if (
            "deprecation" in response.headers or "sunset" in response.headers
        ) and endpoint_id not in self._deprecation_logged:
            self._deprecation_logged.add(endpoint_id)
            self._metrics.backend_deprecated.labels(endpoint_id).inc()
            log.warning(
                "backend endpoint deprecated",
                extra={"endpoint_id": endpoint_id, "sunset": response.headers.get("sunset")},
            )

    def _json(self, endpoint_id: str, response: httpx.Response) -> Any:
        if len(response.content) > self._max_bytes:
            self._metrics.backend_contract_violations.labels(endpoint_id).inc()
            raise BackendError(endpoint_id, "contract_violation", "response too large")
        if response.status_code == 204 or not response.content:
            return None
        if "json" not in response.headers.get("content-type", ""):
            self._metrics.backend_contract_violations.labels(endpoint_id).inc()
            raise BackendError(endpoint_id, "contract_violation", "expected application/json")
        try:
            return response.json()
        except ValueError as exc:
            self._metrics.backend_contract_violations.labels(endpoint_id).inc()
            raise BackendError(endpoint_id, "contract_violation", "invalid JSON") from exc

    def _validate(self, endpoint_id: str, model: type[DtoT], data: Any) -> DtoT:
        try:
            return model.model_validate(data)
        except ValidationError as exc:
            self._metrics.backend_contract_violations.labels(endpoint_id).inc()
            log.error(
                "backend contract violation", extra={"endpoint_id": endpoint_id, "errors": exc.error_count()}
            )
            raise BackendError(endpoint_id, "contract_violation", str(exc.errors()[:3])) from exc

    def _guard(self, endpoint_id: str, ok: bool, detail: str) -> None:
        """Defence in depth: data for another tenant or employee is never passed on."""
        if not ok:
            self._metrics.backend_contract_violations.labels(endpoint_id).inc()
            log.error(
                "backend returned out-of-scope data", extra={"endpoint_id": endpoint_id, "detail": detail}
            )
            raise BackendError(endpoint_id, "contract_violation", detail)

    async def _get_one(
        self,
        endpoint_id: str,
        path: str,
        principal: Principal,
        model: type[DtoT],
        params: dict[str, Any] | None = None,
    ) -> DtoT:
        cache = self._cache if endpoint_id in REFERENCE_ENDPOINTS else None
        key = ReferenceCache.key(principal.tenant_id, endpoint_id, path, params) if cache else ()
        cached = cache.get(key) if cache else None
        if cache and cached and cache.fresh(cached):
            cache.hits += 1
            self._metrics.backend_cache.labels(endpoint_id, "hit").inc()
            return self._validate(endpoint_id, model, cached.data)
        conditional = {"If-None-Match": cached.etag} if cached and cached.etag else None
        response = await self._send(
            endpoint_id, path, principal=principal, params=params, extra_headers=conditional
        )
        if response.status_code == 304 and cache and cached:
            self._metrics.backend_cache.labels(endpoint_id, "revalidated").inc()
            cache.refresh(key, response.headers)
            return self._validate(endpoint_id, model, cached.data)
        data = self._json(endpoint_id, response)
        result = self._validate(endpoint_id, model, data)
        if cache:
            self._metrics.backend_cache.labels(endpoint_id, "miss").inc()
            cache.store(key, data, response.headers)
        return result

    async def _get_list(
        self,
        endpoint_id: str,
        path: str,
        model: type[DtoT],
        *,
        principal: Principal | None = None,
        tenant_id: str | None = None,
        params: dict[str, Any] | None = None,
    ) -> list[DtoT]:
        items: list[DtoT] = []
        query: dict[str, Any] = {"limit": _PAGE_LIMIT, **(params or {})}
        for _ in range(self._max_pages):
            response = await self._send(
                endpoint_id, path, principal=principal, tenant_id=tenant_id, params=query, is_list=True
            )
            page = self._json(endpoint_id, response)
            if not isinstance(page, dict) or not isinstance(page.get("items"), list):
                self._metrics.backend_contract_violations.labels(endpoint_id).inc()
                raise BackendError(endpoint_id, "contract_violation", "expected {items, next_cursor}")
            items.extend(self._validate(endpoint_id, model, item) for item in page["items"])
            cursor = page.get("next_cursor")
            if not cursor:
                return items
            query = {**query, "cursor": cursor}
        self._metrics.backend_pagination_truncated.labels(endpoint_id).inc()
        log.warning("backend pagination cap reached", extra={"endpoint_id": endpoint_id, "items": len(items)})
        return items

    # ── BackendClient (user identity) ────────────────────────────────────

    async def get_me(self, principal: Principal) -> MeDTO:
        me = await self._get_one("BE-004", "/me", principal, MeDTO)
        self._guard("BE-004", me.tenant_id == principal.tenant_id, "tenant mismatch")
        return me

    async def get_employee(self, principal: Principal, employee_id: str) -> EmployeeDTO:
        employee = await self._get_one("BE-010", f"/employees/{_seg(employee_id)}", principal, EmployeeDTO)
        self._guard("BE-010", employee.tenant_id == principal.tenant_id, "tenant mismatch")
        self._guard("BE-010", employee.id == employee_id, "employee mismatch")
        return employee

    async def get_direct_reports(self, principal: Principal, manager_id: str) -> list[DirectReportDTO]:
        return await self._get_list(
            "BE-011", f"/managers/{_seg(manager_id)}/direct-reports", DirectReportDTO, principal=principal
        )

    async def list_org_units(self, principal: Principal, parent_id: str | None = None) -> list[OrgUnitDTO]:
        params = {"parent_id": parent_id} if parent_id else None
        return await self._get_list("BE-012", "/org/units", OrgUnitDTO, principal=principal, params=params)

    async def get_framework_levels(self, principal: Principal) -> list[FrameworkLevelDTO]:
        return await self._get_list("BE-020", "/framework/levels", FrameworkLevelDTO, principal=principal)

    async def get_skill(self, principal: Principal, skill_id: str) -> SkillDTO:
        skill = await self._get_one("BE-022", f"/skills/{_seg(skill_id)}", principal, SkillDTO)
        self._guard("BE-022", skill.id == skill_id, "skill mismatch")
        return skill

    async def search_skills(
        self, principal: Principal, query: str | None = None, category: str | None = None
    ) -> list[SkillDTO]:
        params: dict[str, Any] = {"status": "published"}
        if query:
            params["q"] = query
        if category:
            params["category"] = category
        return await self._get_list("BE-026", "/skills", SkillDTO, principal=principal, params=params)

    async def get_role_profile(
        self, principal: Principal, role_id: str, version: str | None = None
    ) -> RoleProfileDTO:
        params = {"version": version} if version else None
        return await self._get_one(
            "BE-023", f"/roles/{_seg(role_id)}/profile", principal, RoleProfileDTO, params
        )

    async def get_role(self, principal: Principal, role_id: str) -> RoleDTO:
        return await self._get_one("BE-024", f"/roles/{_seg(role_id)}", principal, RoleDTO)

    async def get_capabilities(self, principal: Principal, employee_id: str) -> list[CapabilityLevelDTO]:
        return await self._get_list(
            "BE-030", f"/employees/{_seg(employee_id)}/capabilities", CapabilityLevelDTO, principal=principal
        )

    async def get_assessment_history(
        self, principal: Principal, employee_id: str
    ) -> list[AssessmentHistoryDTO]:
        return await self._get_list(
            "BE-031",
            f"/employees/{_seg(employee_id)}/assessment-history",
            AssessmentHistoryDTO,
            principal=principal,
        )

    async def get_performance_summary(self, principal: Principal, employee_id: str) -> PerformanceSummaryDTO:
        summary = await self._get_one(
            "BE-032", f"/employees/{_seg(employee_id)}/performance-summary", principal, PerformanceSummaryDTO
        )
        self._guard("BE-032", summary.employee_id == employee_id, "employee mismatch")
        return summary

    async def get_catalogue_item(self, principal: Principal, item_id: str) -> CatalogueItemDTO:
        return await self._get_one(
            "BE-041", f"/learning/catalogue/{_seg(item_id)}", principal, CatalogueItemDTO
        )

    async def list_catalogue(
        self, principal: Principal, skill_ids: list[str] | None = None
    ) -> list[CatalogueItemDTO]:
        params: dict[str, Any] = {"status": "active"}
        if skill_ids:
            params["skill_id"] = ",".join(sorted(skill_ids))
        return await self._get_list(
            "BE-040", "/learning/catalogue", CatalogueItemDTO, principal=principal, params=params
        )

    async def get_learning_records(self, principal: Principal, employee_id: str) -> list[LearningRecordDTO]:
        return await self._get_list(
            "BE-042",
            f"/employees/{_seg(employee_id)}/learning-records",
            LearningRecordDTO,
            principal=principal,
        )

    async def get_development_plans(self, principal: Principal, employee_id: str) -> list[DevelopmentPlanDTO]:
        plans = await self._get_list(
            "BE-050",
            "/development-plans",
            DevelopmentPlanDTO,
            principal=principal,
            params={"employee_id": employee_id},
        )
        self._guard("BE-050", all(p.employee_id == employee_id for p in plans), "plans for another employee")
        return plans

    async def get_development_plan(self, principal: Principal, plan_id: str) -> DevelopmentPlanDTO:
        plan = await self._get_one(
            "BE-051", f"/development-plans/{_seg(plan_id)}", principal, DevelopmentPlanDTO
        )
        self._guard("BE-051", plan.id == plan_id, "plan mismatch")
        return plan

    async def get_assessment(self, principal: Principal, assessment_id: str) -> TalentAssessmentDTO:
        return await self._get_one(
            "BE-060", f"/talent/assessments/{_seg(assessment_id)}", principal, TalentAssessmentDTO
        )

    async def get_assessment_responses(
        self, principal: Principal, assessment_id: str
    ) -> list[AssessmentResponseDTO]:
        return await self._get_list(
            "BE-061",
            f"/talent/assessments/{_seg(assessment_id)}/responses",
            AssessmentResponseDTO,
            principal=principal,
        )

    async def get_assessment_items(self, principal: Principal, assessment_id: str) -> list[AssessmentItemDTO]:
        return await self._get_list(
            "BE-068",
            f"/talent/assessments/{_seg(assessment_id)}/items",
            AssessmentItemDTO,
            principal=principal,
        )

    # ── ServiceBackendClient (service identity, tenant reference feeds + events) ──

    async def list_skills_index(self, tenant_id: str, updated_since: str | None = None) -> list[SkillDTO]:
        params: dict[str, Any] = {"status": "published"}
        if updated_since:
            params["updated_since"] = updated_since
        return await self._get_list("BE-021", "/skills", SkillDTO, tenant_id=tenant_id, params=params)

    async def list_roles_index(self, tenant_id: str, updated_since: str | None = None) -> list[RoleDTO]:
        params: dict[str, Any] = {"status": "published"}
        if updated_since:
            params["updated_since"] = updated_since
        return await self._get_list("BE-025", "/roles", RoleDTO, tenant_id=tenant_id, params=params)

    async def list_library(self, tenant_id: str, updated_since: str | None = None) -> list[LibraryItemDTO]:
        params = {"updated_since": updated_since} if updated_since else None
        return await self._get_list(
            "BE-064", "/talent/library", LibraryItemDTO, tenant_id=tenant_id, params=params
        )

    async def get_tenant_entitlements(self, tenant_id: str) -> TenantEntitlementsDTO:
        response = await self._send("BE-005", f"/tenants/{_seg(tenant_id)}/entitlements", tenant_id=tenant_id)
        return self._validate("BE-005", TenantEntitlementsDTO, self._json("BE-005", response))

    async def publish_event(self, event: AiOutboundEvent) -> None:
        """BE-081: AI → backend events. Retried safely: the event ID is the idempotency key."""
        await self._send(
            "BE-081",
            "/integrations/ai/events",
            tenant_id=event.tenant_id,
            method="POST",
            body=event.model_dump(mode="json"),
            idempotency_key=event.event_id,
        )
