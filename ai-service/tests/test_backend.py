from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from cfp_ai.integrations.backend.circuit import CircuitBreaker
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.integrations.backend.http_client import HttpBackendClient
from cfp_ai.integrations.backend.mock.client import MockBackendClient
from cfp_ai.integrations.backend.mock.data import EMPLOYEES
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry, EndpointEntry
from cfp_ai.observability.context import request_id_var
from cfp_ai.observability.metrics import Metrics
from cfp_ai.settings import DEFAULT_CONFIG_DIR, Environment
from tests.conftest import make_principal

REGISTRY_PATH = DEFAULT_CONFIG_DIR / "backend-endpoints.registry.yaml"
DOCS_REGISTRY = Path(__file__).resolve().parents[2] / "docs/ai/contracts/backend-endpoints.registry.yaml"


def registry(env: Environment = Environment.TEST, **status_overrides: str) -> BackendEndpointRegistry:
    base = BackendEndpointRegistry.load(REGISTRY_PATH, env)
    if not status_overrides:
        return base
    column = "dev" if env.is_local else env.value
    entries: dict[str, EndpointEntry] = {}
    for endpoint_id in base.ids():
        entry = base.entry(endpoint_id)
        assert entry is not None
        if endpoint_id in status_overrides:
            entry = EndpointEntry(
                **{**entry.__dict__, "status": {**entry.status, column: status_overrides[endpoint_id]}}
            )
        entries[endpoint_id] = entry
    return BackendEndpointRegistry(entries, env)


# ── registry ─────────────────────────────────────────────────────────────────


def test_registry_loads_all_proposed_endpoints() -> None:
    prod = BackendEndpointRegistry.load(REGISTRY_PATH, Environment.PROD)
    assert len(prod.ids()) == 44
    assert prod.counts() == {"proposed": 44}  # nothing is confirmed by the backend team yet
    assert not any(prod.is_callable(e) for e in prod.ids())


def test_mocked_endpoints_callable_only_locally() -> None:
    dev = BackendEndpointRegistry.load(REGISTRY_PATH, Environment.DEV)
    assert dev.status("BE-010") == "mocked"
    assert dev.is_callable("BE-010")
    assert not dev.is_callable("BE-090")  # proposed even in dev
    staging = registry(Environment.STAGING, **{"BE-010": "mocked"})
    assert not staging.is_callable("BE-010")  # 'mocked' never counts outside dev/test
    assert registry(Environment.STAGING, **{"BE-010": "available"}).is_callable("BE-010")


def test_runtime_registry_matches_reviewed_contract() -> None:
    if not DOCS_REGISTRY.exists():
        pytest.skip("docs registry not present (service extracted from monorepo)")
    assert REGISTRY_PATH.read_text(encoding="utf-8") == DOCS_REGISTRY.read_text(encoding="utf-8")


# ── HTTP client ──────────────────────────────────────────────────────────────


EMPLOYEE_JSON = {k: v for k, v in EMPLOYEES["emp-8721"].items()}


def http_client(handler: Any, reg: BackendEndpointRegistry | None = None, **kw: Any) -> HttpBackendClient:
    return HttpBackendClient(
        base_url="https://backend.test/v1",
        registry=reg or registry(**{"BE-010": "available", "BE-030": "available"}),
        metrics=Metrics(),
        transport=httpx.MockTransport(handler),
        backoff_base_s=0,
        **kw,
    )


async def test_http_client_forwards_token_and_request_id() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        seen["rid"] = request.headers.get("x-request-id")
        seen["path"] = request.url.path
        return httpx.Response(200, json=EMPLOYEE_JSON | {"unexpected_extra": 1})

    client = http_client(handler)
    reset = request_id_var.set("req-123")
    try:
        employee = await client.get_employee(make_principal("james"), "emp-8721")
    finally:
        request_id_var.reset(reset)
    assert employee.name == "James Miller"
    assert seen == {"auth": "Bearer token-james", "rid": "req-123", "path": "/v1/employees/emp-8721"}


async def test_http_client_encodes_path_segments() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.raw_path.startswith(b"/v1/employees/..%2Fadmin")
        return httpx.Response(404, json={"error": {"code": "not_found"}})

    with pytest.raises(BackendError) as err:
        await http_client(handler).get_employee(make_principal("james"), "../admin")
    assert err.value.kind == "not_found"


@pytest.mark.parametrize(
    ("status", "kind"), [(401, "unauthorized"), (403, "forbidden"), (404, "not_found"), (422, "bad_request")]
)
async def test_http_client_maps_client_errors_without_retry(status: int, kind: str) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(status, json={"error": {"code": "x", "message": "m", "request_id": "r"}})

    with pytest.raises(BackendError) as err:
        await http_client(handler).get_employee(make_principal("james"), "emp-8721")
    assert err.value.kind == kind
    assert calls == 1


async def test_http_client_retries_transient_errors_then_fails() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    with pytest.raises(BackendError) as err:
        await http_client(handler, max_retries=2).get_employee(make_principal("james"), "emp-8721")
    assert err.value.kind == "unavailable"
    assert calls == 3


async def test_http_client_recovers_after_transient_error() -> None:
    responses = iter([httpx.Response(502), httpx.Response(200, json=EMPLOYEE_JSON)])
    employee = await http_client(lambda r: next(responses)).get_employee(make_principal("james"), "emp-8721")
    assert employee.id == "emp-8721"


async def test_http_client_detects_contract_violation() -> None:
    client = http_client(lambda r: httpx.Response(200, json={"id": "emp-8721"}))
    with pytest.raises(BackendError) as err:
        await client.get_employee(make_principal("james"), "emp-8721")
    assert err.value.kind == "contract_violation"


async def test_http_client_never_calls_unconfirmed_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("must not be called")

    client = http_client(handler, reg=BackendEndpointRegistry.load(REGISTRY_PATH, Environment.PROD))
    with pytest.raises(BackendError) as err:
        await client.get_employee(make_principal("james"), "emp-8721")
    assert err.value.kind == "not_callable"
    assert err.value.to_app_error().code == "backend_dependency_unconfirmed"


async def test_http_client_follows_cursor_pagination() -> None:
    pages = {
        None: {
            "items": [
                {
                    "skill_id": "skl-a",
                    "verified_level": 3,
                    "verified_at": None,
                    "verified_by": None,
                    "self_assessed_level": None,
                    "self_assessed_at": None,
                }
            ],
            "next_cursor": "c2",
        },
        "c2": {
            "items": [
                {
                    "skill_id": "skl-b",
                    "verified_level": None,
                    "verified_at": None,
                    "verified_by": None,
                    "self_assessed_level": 2,
                    "self_assessed_at": None,
                }
            ],
            "next_cursor": None,
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["limit"] == "200"
        return httpx.Response(200, json=pages[request.url.params.get("cursor")])

    levels = await http_client(handler).get_capabilities(make_principal("james"), "emp-8721")
    assert [lvl.skill_id for lvl in levels] == ["skl-a", "skl-b"]


async def test_http_client_rejects_non_page_list_response() -> None:
    client = http_client(lambda r: httpx.Response(200, json=[{"skill_id": "x"}]))
    with pytest.raises(BackendError) as err:
        await client.get_capabilities(make_principal("james"), "emp-8721")
    assert err.value.kind == "contract_violation"


def test_circuit_breaker_opens_and_half_opens() -> None:
    now = [0.0]
    breaker = CircuitBreaker(window_s=30, min_calls=4, failure_ratio=0.5, open_s=10, clock=lambda: now[0])
    for _ in range(4):
        breaker.record("k", ok=False)
    assert breaker.is_open("k")
    now[0] = 11
    assert not breaker.is_open("k")  # single half-open trial
    assert breaker.is_open("k")
    breaker.record("k", ok=True)
    assert not breaker.is_open("k")


async def test_http_client_short_circuits_when_open() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    breaker = CircuitBreaker(min_calls=1, failure_ratio=0.5)
    client = http_client(handler, max_retries=0, breaker=breaker)
    with pytest.raises(BackendError):
        await client.get_employee(make_principal("james"), "emp-8721")
    with pytest.raises(BackendError) as err:
        await client.get_employee(make_principal("james"), "emp-8721")
    assert err.value.detail == "circuit open"
    assert calls == 1


# ── mock backend: realistic authorisation ────────────────────────────────────


@pytest.fixture
def mock_backend() -> MockBackendClient:
    return MockBackendClient(registry=registry(), environment=Environment.TEST)


@pytest.mark.parametrize(
    ("persona", "employee_id", "expected"),
    [
        ("james", "emp-8721", "ok"),  # self
        ("james", "emp-9042", "forbidden"),  # peer
        ("michael", "emp-8721", "ok"),  # direct report
        ("michael", "emp-7310", "forbidden"),  # not a report
        ("priya", "emp-9042", "ok"),  # HR: tenant-wide
        ("sarah", "emp-8721", "ok"),  # org admin: tenant-wide
        ("ama", "emp-8721", "not_found"),  # other tenant
        ("priya", "emp-ths-1", "not_found"),  # other tenant, even for HR
    ],
)
async def test_mock_backend_authorisation(
    mock_backend: MockBackendClient, persona: str, employee_id: str, expected: str
) -> None:
    principal = make_principal(persona)
    if expected == "ok":
        assert (await mock_backend.get_employee(principal, employee_id)).id == employee_id
    else:
        with pytest.raises(BackendError) as err:
            await mock_backend.get_capabilities(principal, employee_id)
        assert err.value.kind == expected


async def test_mock_backend_honours_registry_and_faults() -> None:
    client = MockBackendClient(
        registry=registry(**{"BE-030": "proposed"}),
        environment=Environment.TEST,
        faults={"BE-010": "unavailable"},
    )
    with pytest.raises(BackendError) as err:
        await client.get_capabilities(make_principal("james"), "emp-8721")
    assert err.value.kind == "not_callable"
    with pytest.raises(BackendError) as err:
        await client.get_employee(make_principal("james"), "emp-8721")
    assert err.value.kind == "unavailable"


def test_mock_seed_data_matches_dto_contracts() -> None:
    """Every seed record validates against the proposed DTOs (keeps mock and contract aligned)."""
    from cfp_ai.integrations.backend import dto
    from cfp_ai.integrations.backend.mock import data

    for e in data.EMPLOYEES.values():
        dto.EmployeeDTO.model_validate(e)
    for s in data.SKILLS.values():
        dto.SkillDTO.model_validate(s)
    for r in data.ROLE_PROFILES.values():
        dto.RoleProfileDTO.model_validate(r)
    for r in data.ROLES.values():
        dto.RoleDTO.model_validate(r)
    for c in data.CATALOGUE.values():
        dto.CatalogueItemDTO.model_validate(c)
    for records in data.LEARNING_RECORDS.values():
        for rec in records:
            dto.LearningRecordDTO.model_validate(rec)
    for plans in data.DEVELOPMENT_PLANS.values():
        for plan in plans:
            dto.DevelopmentPlanDTO.model_validate(plan)
    json.dumps(data.PERSONAS)
