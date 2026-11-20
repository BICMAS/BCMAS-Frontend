"""API foundation: auth, error envelope, request IDs, capability discovery, admin health."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from cfp_ai.container import Container
from tests.conftest import auth


def test_healthz_and_readyz(client: TestClient) -> None:
    assert client.get("/healthz").json() == {"status": "ok"}
    assert client.get("/readyz").json() == {"status": "ready"}


def test_missing_token_returns_error_envelope(client: TestClient) -> None:
    response = client.get("/v1/capabilities", headers={"X-Request-ID": "req-abc-123"})
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "unauthenticated"
    assert body["error"]["request_id"] == "req-abc-123"
    assert body["error"]["retryable"] is False
    assert response.headers["x-request-id"] == "req-abc-123"
    assert response.headers["x-ai-contract-version"] == "1.0.0-rc.1"


def test_invalid_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": "bad id with spaces & <script>"})
    assert response.headers["x-request-id"].startswith("req_")


def test_garbage_token_rejected(client: TestClient) -> None:
    response = client.get("/v1/capabilities", headers=auth("not-a-jwt"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


def test_unknown_route_uses_envelope(client: TestClient) -> None:
    response = client.get("/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_validation_error_does_not_echo_input(client: TestClient, token: Any) -> None:
    secret_value = "SENSITIVE-PAYLOAD-VALUE"
    response = client.post(
        "/v1/_dev/diagnostics",
        headers=auth(token("james")),
        json={"employee_id": "emp-8721", "unexpected": secret_value},
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "invalid_request"
    assert body["error"]["details"]
    assert secret_value not in response.text


def test_capabilities_lists_all_public_capabilities(client: TestClient, token: Any) -> None:
    response = client.get("/v1/capabilities", headers=auth(token("james")))
    assert response.status_code == 200
    body = response.json()
    assert body["tenant_id"] == "org-gec"
    assert body["contract_version"] == "1.0.0-rc.1"
    caps = {c["capability"]: c for c in body["capabilities"]}
    assert len(caps) == 18
    assert "system.diagnostics" not in caps  # internal capabilities are not listed
    # Declared-but-unimplemented capabilities → unavailable with reason ai_disabled.
    assert caps["dev_plan.draft_cohort_pathway"]["availability"] == "unavailable"
    assert "ai_disabled" in caps["dev_plan.draft_cohort_pathway"]["reasons"]
    assert caps["dev_plan.draft_plan"]["availability"] == "available"
    assert caps["coaching.roleplay_turn"]["availability"] == "available"
    # An employee may not use HR-only capabilities.
    assert "role_not_permitted" in caps["talent.recommend_scores"]["reasons"]


def test_capabilities_reflect_unconfirmed_backend_endpoints(tmp_path: Any) -> None:
    """A required endpoint that is not callable makes the capability unavailable, naming the endpoint."""
    from cfp_ai.api.app import create_app
    from cfp_ai.container import build_container
    from cfp_ai.integrations.backend.mock.data import PERSONAS
    from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
    from cfp_ai.settings import DEFAULT_CONFIG_DIR
    from tests.conftest import make_settings

    source = (DEFAULT_CONFIG_DIR / "backend-endpoints.registry.yaml").read_text(encoding="utf-8")
    marker = "  - id: BE-066\n"
    head, tail = source.split(marker, 1)
    tail = tail.replace("dev: mocked", "dev: proposed", 1)
    registry_file = tmp_path / "registry.yaml"
    registry_file.write_text(head + marker + tail, encoding="utf-8")

    c = build_container(
        make_settings(backend_registry_path=registry_file), providers={"fake": FakeLlmProvider()}
    )
    with TestClient(create_app(container=c)) as test_client:
        verifier: Any = c.verifier
        body = test_client.get("/v1/capabilities", headers=auth(verifier.mint(PERSONAS["priya"]))).json()
    caps = {cap["capability"]: cap for cap in body["capabilities"]}
    assert "backend_dependency_unconfirmed" in caps["talent.insights_turn"]["reasons"]
    assert caps["talent.insights_turn"]["missing_backend_endpoints"] == ["BE-066"]
    assert "backend_dependency_unconfirmed" not in caps["talent.analyze_evidence"]["reasons"]


def test_admin_health_requires_platform_admin(client: TestClient, token: Any) -> None:
    assert client.get("/v1/admin/health", headers=auth(token("james"))).status_code == 403
    response = client.get("/v1/admin/health", headers=auth(token("alex")))
    assert response.status_code == 200
    body = response.json()
    names = {d["name"]: d for d in body["dependencies"]}
    assert names["llm:anthropic"]["status"] == "not_configured"
    assert names["backend"]["detail"] == "mode=mock"


def test_admin_health_never_returns_api_keys(container: Container) -> None:
    from cfp_ai.api.app import create_app
    from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
    from tests.conftest import make_settings

    settings = make_settings(anthropic_api_key="sk-ant-should-never-leak-000")
    from cfp_ai.container import build_container

    c = build_container(settings, providers={"fake": FakeLlmProvider(), "anthropic": FakeLlmProvider()})
    with TestClient(create_app(container=c)) as test_client:
        verifier: Any = c.verifier
        from cfp_ai.integrations.backend.mock.data import PERSONAS

        response = test_client.get("/v1/admin/health", headers=auth(verifier.mint(PERSONAS["alex"])))
        assert response.status_code == 200
        assert "sk-ant-should-never-leak-000" not in response.text


def test_metrics_endpoint(client: TestClient) -> None:
    client.get("/healthz")
    response = client.get("/internal/metrics")
    assert response.status_code == 200
    assert "ai_requests_total" in response.text


def test_docs_available_in_test_env(client: TestClient) -> None:
    assert client.get("/openapi.json").status_code == 200


def test_no_cors_headers(client: TestClient) -> None:
    response = client.options(
        "/v1/capabilities",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in response.headers


def test_identity_echoes_the_verified_principal(client: TestClient, token: Any) -> None:
    body = client.get("/v1/me/identity", headers=auth(token("james"))).json()
    assert body["tenant_id"] == "org-gec" and body["employee_id"] == "emp-8721"
    assert body["roles"] == ["employee"] and "ai_coaching" in body["entitlements"]
    assert "token" not in str(body).lower()
    assert client.get("/v1/me/identity").status_code == 401
