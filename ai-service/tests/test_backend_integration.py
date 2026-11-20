"""Integration tests: the real HTTP backend client (and the whole service in ``backend_mode=http``)
against a contract-faithful fake of the conventional backend over HTTP (ASGI transport).

Covers authentication and service-to-service calls, identity propagation, permissions, response
validation, failures and timeouts, retries, caching, pagination, versioning, and the honest
"not connected" behaviour of endpoints the backend has not confirmed.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import jwt
import pytest
from fastapi.responses import Response
from fastapi.testclient import TestClient

from cfp_ai.api.app import create_app
from cfp_ai.auth.principal import Principal
from cfp_ai.container import build_container, fake_responders
from cfp_ai.integrations.backend import openapi_check
from cfp_ai.integrations.backend.auth import ClientCredentialsTokens, TokenExchange
from cfp_ai.integrations.backend.cache import ReferenceCache
from cfp_ai.integrations.backend.dto import AiOutboundEvent
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.integrations.backend.http_client import HttpBackendClient
from cfp_ai.integrations.backend.mock import data
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.observability.context import request_id_var
from cfp_ai.observability.metrics import Metrics
from cfp_ai.settings import DEFAULT_CONFIG_DIR, Environment
from tests.conftest import auth, make_principal, make_settings
from tests.fake_backend import FakeState, build_fake_backend

BASE = "https://backend.test/v1"


def registry_file(tmp_path: Path, *, keep_proposed: tuple[str, ...] = ()) -> Path:
    """The runtime registry with every endpoint 'available' in the test column, except ``keep_proposed``."""
    text = (DEFAULT_CONFIG_DIR / "backend-endpoints.registry.yaml").read_text(encoding="utf-8")
    blocks = re.split(r"(?=\n  - id: )", text)
    out = []
    for block in blocks:
        match = re.search(r"id: (BE-\d+)", block)
        if match:
            status = "proposed" if match.group(1) in keep_proposed else "available"
            block = re.sub(r"dev: \w+", f"dev: {status}", block)
        out.append(block)
    path = tmp_path / "registry.yaml"
    path.write_text("".join(out), encoding="utf-8")
    return path


def user(persona: str, **overrides: Any) -> Principal:
    token = jwt.encode(data.PERSONAS[persona], "fake-backend", algorithm="HS256")
    return make_principal(persona, token=token, **overrides)


@pytest.fixture
def fake() -> tuple[Any, FakeState]:
    return build_fake_backend()


def client(
    fake: tuple[Any, FakeState],
    tmp_path: Path,
    *,
    keep_proposed: tuple[str, ...] = (),
    service: bool = False,
    exchange: bool = False,
    cache: ReferenceCache | None = None,
    **kw: Any,
) -> HttpBackendClient:
    registry = BackendEndpointRegistry.load(
        registry_file(tmp_path, keep_proposed=keep_proposed), Environment.TEST
    )
    http = HttpBackendClient(
        base_url=BASE,
        registry=registry,
        metrics=kw.pop("metrics", Metrics()),
        transport=httpx.ASGITransport(app=fake[0]),
        backoff_base_s=0,
        reference_cache=cache,
        **kw,
    )
    if service or exchange:
        tokens = (
            ClientCredentialsTokens(http=http.http, registry=registry, client_id="ai", client_secret="s3cret")
            if service
            else None
        )
        identity = (
            TokenExchange(
                http=http.http, registry=registry, audience="cfp-api", client_id="ai", client_secret="s3cret"
            )
            if exchange
            else None
        )
        if identity is not None:
            http.set_identity(identity, tokens)
        elif tokens is not None:
            http.set_identity(http._identity, tokens)
    return http


def sample(metrics: Metrics, name: str, labels: dict[str, str]) -> float:
    return metrics.registry.get_sample_value(name, labels) or 0.0


# ── end to end: the whole service in backend_mode=http ───────────────────────


@pytest.fixture
def service_over_http(
    fake: tuple[Any, FakeState], tmp_path: Path
) -> Iterator[tuple[TestClient, Any, FakeState]]:
    path = registry_file(tmp_path)
    settings = make_settings(backend_mode="http", backend_base_url=BASE, backend_registry_path=path)
    backend = HttpBackendClient(
        base_url=BASE,
        registry=BackendEndpointRegistry.load(path, Environment.TEST),
        metrics=Metrics(),
        transport=httpx.ASGITransport(app=fake[0]),
        backoff_base_s=0,
        reference_cache=ReferenceCache(),
    )
    container = build_container(
        settings, backend=backend, providers={"fake": FakeLlmProvider(responders=fake_responders())}
    )
    with TestClient(create_app(container=container)) as test_client:
        yield test_client, container, fake[1]


def test_agents_read_the_backend_as_the_user(service_over_http: tuple[TestClient, Any, FakeState]) -> None:
    test_client, container, state = service_over_http
    token = container.verifier.mint(data.PERSONAS["james"])
    response = test_client.get("/v1/dev-plans/gaps/emp-8721", headers=auth(token))
    assert response.status_code == 200, response.text
    assert {g["skill_id"] for g in response.json()["gaps"]} >= {"skl-api-gov", "skl-influence"}
    calls = [s for s in state.seen if not s["path"].startswith("/v1/oauth")]
    assert calls, "the service must have called the backend"
    request_ids = {c["headers"].get("x-request-id") for c in calls}
    assert len(request_ids) == 1 and None not in request_ids  # one request, correlated end to end
    for call in calls:
        assert (
            call["headers"]["authorization"] == f"Bearer {token}"
        )  # the user's own identity, never a service one
        assert call["headers"]["x-api-version"] == "1" and "x-tenant-id" not in call["headers"]
    assert {c["path"] for c in calls} >= {
        "/v1/employees/emp-8721",
        "/v1/employees/emp-8721/capabilities",
        "/v1/roles/role-ssa/profile",
    }


def test_backend_permissions_surface_as_forbidden(
    service_over_http: tuple[TestClient, Any, FakeState],
) -> None:
    test_client, container, state = service_over_http
    manager = container.verifier.mint(data.PERSONAS["michael"])
    assert test_client.get("/v1/dev-plans/gaps/emp-9042", headers=auth(manager)).status_code == 200
    james = container.verifier.mint(data.PERSONAS["james"])
    before = len(state.seen)
    assert test_client.get("/v1/dev-plans/gaps/emp-9042", headers=auth(james)).status_code == 403
    assert not any(s["path"].startswith("/v1/employees/emp-9042") for s in state.seen[before:])  # pre-checked


# ── identity, permissions, tenant isolation ──────────────────────────────────


async def test_backend_enforces_the_users_permissions(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path)
    assert len(await http.get_capabilities(user("michael"), "emp-9042")) == 2  # manager → direct report
    with pytest.raises(BackendError) as err:
        await http.get_capabilities(user("james"), "emp-9042")
    assert err.value.kind == "forbidden"
    with pytest.raises(BackendError) as err:
        await http.get_employee(user("ama"), "emp-8721")
    assert err.value.kind == "forbidden"


async def test_expired_user_tokens_are_never_sent(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path)
    expired = user("james", token_expires_at=datetime.now(UTC) - timedelta(seconds=1))
    with pytest.raises(BackendError) as err:
        await http.get_employee(expired, "emp-8721")
    assert err.value.kind == "unauthorized" and fake[1].hits == {}


async def test_out_of_scope_data_is_rejected(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path)
    fake[1].override["/v1/employees/emp-8721"] = {**data.EMPLOYEES["emp-8721"], "tenant_id": "org-ths"}
    with pytest.raises(BackendError) as err:
        await http.get_employee(user("james"), "emp-8721")
    assert err.value.kind == "contract_violation" and "tenant" in err.value.detail
    other = copy_plan("emp-9042")
    fake[1].override["/v1/development-plans"] = {"items": [other], "next_cursor": None}
    with pytest.raises(BackendError) as err:
        await http.get_development_plans(user("james"), "emp-8721")
    assert "another employee" in err.value.detail


def copy_plan(employee_id: str) -> dict[str, Any]:
    plan = json.loads(json.dumps(data.DEVELOPMENT_PLANS["emp-8721"][0]))
    plan["employee_id"] = employee_id
    return plan


# ── validation ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"id": "emp-8721"}, "Field required"),  # schema
        (Response("<html>login</html>", media_type="text/html"), "application/json"),  # content type
        (Response("{not json", media_type="application/json"), "invalid JSON"),
        (
            Response(
                json.dumps(data.EMPLOYEES["emp-8721"]),
                media_type="application/json",
                headers={"X-API-Version": "2.0"},
            ),
            "API version",
        ),
    ],
)
async def test_responses_are_validated(
    fake: tuple[Any, FakeState], tmp_path: Path, body: Any, detail: str
) -> None:
    metrics = Metrics()
    http = client(fake, tmp_path, metrics=metrics)
    fake[1].override["/v1/employees/emp-8721"] = body
    with pytest.raises(BackendError) as err:
        await http.get_employee(user("james"), "emp-8721")
    assert err.value.kind == "contract_violation" and detail in err.value.detail
    assert sample(metrics, "ai_backend_contract_violation_total", {"endpoint_id": "BE-010"}) == 1


async def test_oversized_responses_are_rejected(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path, max_response_bytes=10_000)
    fake[1].override["/v1/employees/emp-8721"] = {**data.EMPLOYEES["emp-8721"], "padding": "x" * 20_000}
    with pytest.raises(BackendError) as err:
        await http.get_employee(user("james"), "emp-8721")
    assert "too large" in err.value.detail


async def test_deprecation_headers_are_reported(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    metrics = Metrics()
    http = client(fake, tmp_path, metrics=metrics)
    fake[1].extra_headers.update({"Deprecation": "true", "Sunset": "Wed, 01 Jul 2027 00:00:00 GMT"})
    await http.get_employee(user("james"), "emp-8721")
    await http.get_employee(user("james"), "emp-8721")
    assert sample(metrics, "ai_backend_deprecated_total", {"endpoint_id": "BE-010"}) == 1  # once per endpoint


# ── failures, timeouts and retries ───────────────────────────────────────────


async def test_transient_failures_are_retried(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    metrics = Metrics()
    http = client(fake, tmp_path, metrics=metrics)
    fake[1].fail["/v1/employees/emp-8721"] = [(503, {}), (502, {})]
    employee = await http.get_employee(user("james"), "emp-8721")
    assert employee.id == "emp-8721" and fake[1].hits["/v1/employees/emp-8721"] == 3
    assert sample(metrics, "ai_backend_retries_total", {"endpoint_id": "BE-010", "status": "503"}) == 1


async def test_rate_limits_honour_retry_after(
    fake: tuple[Any, FakeState], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    delays: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)

    monkeypatch.setattr("cfp_ai.integrations.backend.http_client.asyncio.sleep", fake_sleep)
    http = client(fake, tmp_path)
    fake[1].fail["/v1/employees/emp-8721"] = [(429, {"Retry-After": "2"}), (429, {"Retry-After": "120"})]
    await http.get_employee(user("james"), "emp-8721")
    assert delays == [2.0, 5.0]  # honoured, capped at 5 s
    fake[1].fail["/v1/employees/emp-8721"] = [(429, {"Retry-After": "0"})] * 3
    with pytest.raises(BackendError) as err:
        await http.get_employee(user("james"), "emp-8721")
    assert err.value.kind == "rate_limited" and err.value.to_app_error().code == "rate_limited"


class TimeoutTransport(httpx.AsyncBaseTransport):
    """The ASGI transport runs in-process and ignores timeouts: simulate a backend that never answers."""

    def __init__(self, inner: httpx.AsyncBaseTransport, state: FakeState, slow: set[str]) -> None:
        self._inner, self._state, self._slow = inner, state, slow

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.path in self._slow:
            self._state.hits[request.url.path] += 1
            raise httpx.ReadTimeout("read timed out", request=request)
        return await self._inner.handle_async_request(request)


async def test_timeouts_fail_after_retries(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path, max_retries=1)
    http.http._transport = TimeoutTransport(  # type: ignore[attr-defined]
        httpx.ASGITransport(app=fake[0]), fake[1], {"/v1/employees/emp-8721"}
    )
    with pytest.raises(BackendError) as err:
        await http.get_employee(user("james"), "emp-8721")
    assert err.value.kind == "unavailable" and fake[1].hits["/v1/employees/emp-8721"] == 2
    assert err.value.to_app_error().code == "upstream_unavailable"


async def test_client_errors_are_not_retried(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path)
    with pytest.raises(BackendError):
        await http.get_capabilities(user("james"), "emp-9042")
    assert fake[1].hits["/v1/employees/emp-9042/capabilities"] == 1


# ── pagination ───────────────────────────────────────────────────────────────


async def test_cursor_pagination_and_cap(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path)
    levels = await http.get_framework_levels(user("james"))
    assert [lvl.level for lvl in levels] == [1, 2, 3, 4, 5]  # 3 pages of 2
    assert fake[1].hits["/v1/framework/levels"] == 3
    metrics = Metrics()
    capped = client(fake, tmp_path, metrics=metrics, max_pages=2)
    assert len(await capped.get_framework_levels(user("james"))) == 4
    assert sample(metrics, "ai_backend_pagination_truncated_total", {"endpoint_id": "BE-020"}) == 1


# ── caching ──────────────────────────────────────────────────────────────────


async def test_reference_data_is_cached_and_revalidated(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    cache = ReferenceCache(ttl_s=300)
    http = client(fake, tmp_path, cache=cache)
    principal = user("james")
    await http.get_skill(principal, "skl-cloud")
    await http.get_skill(principal, "skl-cloud")
    assert fake[1].hits["/v1/skills/skl-cloud"] == 1 and cache.hits == 1
    stale = client(fake, tmp_path, cache=ReferenceCache(ttl_s=0))
    await stale.get_skill(principal, "skl-cloud")
    skill = await stale.get_skill(principal, "skl-cloud")  # stale → If-None-Match → 304
    conditional = [s for s in fake[1].seen if s["path"] == "/v1/skills/skl-cloud"][-1]
    assert conditional["headers"].get("if-none-match") and skill.id == "skl-cloud"
    assert http.invalidate_reference("org-gec") == 1  # change events drop the tenant's reference data


async def test_personal_data_and_no_store_are_never_cached(
    fake: tuple[Any, FakeState], tmp_path: Path
) -> None:
    http = client(fake, tmp_path, cache=ReferenceCache(ttl_s=300))
    for _ in range(2):
        await http.get_employee(user("james"), "emp-8721")
    assert fake[1].hits["/v1/employees/emp-8721"] == 2
    fake[1].extra_headers["Cache-Control"] = "no-store"
    for _ in range(2):
        await http.get_role(user("james"), "role-ssa")
    assert fake[1].hits["/v1/roles/role-ssa"] == 2


async def test_cache_is_partitioned_by_tenant(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path, cache=ReferenceCache(ttl_s=300))
    await http.get_skill(user("james"), "skl-cloud")
    await http.get_skill(user("ama"), "skl-cloud")  # another tenant: not served from org-gec's cache
    assert fake[1].hits["/v1/skills/skl-cloud"] == 2


# ── service-to-service authentication ────────────────────────────────────────


async def test_service_calls_use_client_credentials_per_tenant(
    fake: tuple[Any, FakeState], tmp_path: Path
) -> None:
    http = client(fake, tmp_path, service=True)
    entitlements = await http.get_tenant_entitlements("org-gec")
    roles = await http.list_roles_index("org-gec")
    assert entitlements.ai_talent_assessment is False and roles
    assert fake[1].token_requests["client_credentials"] == 1  # cached, reused
    service_calls = [s for s in fake[1].seen if not s["path"].startswith("/v1/oauth")]
    for call in service_calls:
        assert call["headers"]["authorization"].startswith("Bearer svc-org-gec")
        assert call["headers"]["x-tenant-id"] == "org-gec"


async def test_expired_service_tokens_are_refreshed_once(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path, service=True)
    await http.get_tenant_entitlements("org-gec")
    fake[1].service_tokens.clear()  # the backend revokes/expires the token
    await http.get_tenant_entitlements("org-gec")
    assert fake[1].token_requests["client_credentials"] == 2


async def test_service_identity_is_not_connected_until_confirmed(
    fake: tuple[Any, FakeState], tmp_path: Path
) -> None:
    unconfigured = client(fake, tmp_path)
    with pytest.raises(BackendError) as err:
        await unconfigured.get_tenant_entitlements("org-gec")
    assert err.value.kind == "not_callable"
    unconfirmed = client(fake, tmp_path, keep_proposed=("BE-003",), service=True)
    with pytest.raises(BackendError) as err:
        await unconfirmed.list_roles_index("org-gec")
    assert err.value.kind == "not_callable" and fake[1].hits == {}


async def test_outbound_events_are_idempotent(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path, service=True)
    fake[1].fail["/v1/integrations/ai/events"] = [(503, {})]
    event = AiOutboundEvent(
        event_id="evt_01JD9C7Q8R9S0T1V2W3X4Y5Z6A",
        type="ai.recommendation.available",
        tenant_id="org-gec",
        occurred_at=datetime.now(UTC),
        subject={"type": "employee", "id": "emp-8721"},
        data={"kind": "plan_draft"},
    )
    await http.publish_event(event)
    posts = [s for s in fake[1].seen if s["path"] == "/v1/integrations/ai/events"]
    assert len(posts) == 2 and {p["headers"]["idempotency-key"] for p in posts} == {event.event_id}
    assert list(fake[1].events) == [event.event_id]


async def test_token_exchange_propagates_identity(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path, exchange=True)
    james = user("james")
    await http.get_employee(james, "emp-8721")
    await http.get_capabilities(james, "emp-8721")
    assert fake[1].token_requests["urn:ietf:params:oauth:grant-type:token-exchange"] == 1
    reads = [s for s in fake[1].seen if not s["path"].startswith("/v1/oauth")]
    assert all(r["headers"]["authorization"].startswith("Bearer xchg-") for r in reads)
    with pytest.raises(BackendError):  # the exchanged token still carries james's permissions
        await http.get_capabilities(james, "emp-9042")


# ── documented gaps: interfaces exist, nothing pretends to be connected ──────


async def test_unconfirmed_gap_endpoints_are_not_called(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path, keep_proposed=("BE-012", "BE-026", "BE-032"))
    calls = [
        http.list_org_units(user("priya")),
        http.search_skills(user("james"), "cloud"),
        http.get_performance_summary(user("michael"), "emp-8721"),
    ]
    for call in calls:
        with pytest.raises(BackendError) as err:
            await call
        assert (
            err.value.kind == "not_callable"
            and err.value.to_app_error().code == "backend_dependency_unconfirmed"
        )
    assert fake[1].hits == {}


async def test_gap_interfaces_work_once_confirmed(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    http = client(fake, tmp_path)
    units = await http.list_org_units(user("priya"))
    assert {u.type for u in units} >= {"organisation", "department"}
    assert [s.id for s in await http.search_skills(user("james"), "cloud")] == ["skl-cloud"]
    own = await http.get_performance_summary(user("james"), "emp-8721")
    assert (
        own.visibility == "summary" and own.overall_rating is None and "overall_rating" in own.withheld_fields
    )
    manager_view = await http.get_performance_summary(user("michael"), "emp-8721")
    assert manager_view.overall_rating == "Meets expectations"


# ── OpenAPI contract check (for when the backend publishes its documentation) ─


def _spec() -> dict[str, Any]:
    employee = {
        "type": "object",
        "properties": {
            k: {"type": "string"}
            for k in (
                "id",
                "user_id",
                "tenant_id",
                "name",
                "job_title",
                "role_id",
                "role_profile_version",
                "manager_id",
            )
        }
        | {"department": {"type": "object"}},
    }
    capability = {
        "type": "object",
        "properties": {"skill_id": {"type": "string"}, "verified_level": {"type": "string"}},
    }
    return {
        "openapi": "3.1.0",
        "security": [{"bearer": []}],
        "components": {"schemas": {"Employee": employee, "Capability": capability}},
        "paths": {
            "/v1/employees/{id}": {
                "get": {
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {"schema": {"$ref": "#/components/schemas/Employee"}}
                            }
                        }
                    }
                }
            },
            "/v1/employees/{employee}/capabilities": {
                "get": {
                    "responses": {
                        "200": {
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "items": {
                                                "type": "array",
                                                "items": {"$ref": "#/components/schemas/Capability"},
                                            }
                                        },
                                    }
                                }
                            }
                        }
                    }
                }
            },
        },
    }


def test_openapi_check_reports_coverage_and_mismatches(tmp_path: Path) -> None:
    registry = BackendEndpointRegistry.load(
        DEFAULT_CONFIG_DIR / "backend-endpoints.registry.yaml", Environment.PROD
    )
    report = openapi_check.check(_spec(), registry, prefix="/v1")
    by_id = {c.endpoint_id: c for c in report.checks}
    assert by_id["BE-010"].status == "ok"
    assert by_id["BE-030"].status == "schema_mismatch"
    assert any("verified_by" in i for i in by_id["BE-030"].issues) or any(
        "verified_level" in i for i in by_id["BE-030"].issues
    )
    assert by_id["BE-022"].status == "missing" and not report.ok
    assert "BE-052" not in by_id  # frontend commits are the frontend's contract
    spec_file = tmp_path / "openapi.json"
    spec_file.write_text(json.dumps(_spec()), encoding="utf-8")
    out = tmp_path / "report.md"
    assert openapi_check.main([str(spec_file), "--prefix", "/v1", "--out", str(out)]) == 1
    assert "| BE-010 |" in out.read_text(encoding="utf-8")


def test_request_ids_propagate_from_context(fake: tuple[Any, FakeState], tmp_path: Path) -> None:
    import asyncio

    http = client(fake, tmp_path)
    token = request_id_var.set("req-integration-1")
    try:
        asyncio.run(http.get_employee(user("james"), "emp-8721"))
    finally:
        request_id_var.reset(token)
    assert fake[1].seen[-1]["headers"]["x-request-id"] == "req-integration-1"
