"""End-to-end through HTTP: dev token → auth → registry → LangGraph workflow → context → LLM → validation."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from tests.conftest import auth


def test_dev_token_endpoint(client: TestClient) -> None:
    response = client.post("/v1/_dev/tokens", json={"persona": "james"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    assert client.get("/v1/capabilities", headers=auth(token)).status_code == 200
    assert client.post("/v1/_dev/tokens", json={"persona": "nobody"}).status_code == 400


def test_diagnostics_end_to_end(client: TestClient, token: Any, fake_llm: FakeLlmProvider) -> None:
    response = client.post(
        "/v1/_dev/diagnostics", headers=auth(token("james")), json={"employee_id": "emp-8721"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["focus_skill_id"] == "skl-api-gov"  # first (critical) gap from deterministic rules
    assert body["validation"] == {"passed": True, "repaired": False, "issues": []}
    assert body["skill_gaps"][0]["priority"] == "critical"
    assert body["provenance"]["prompt_version"] == "system.diagnostics@v1"
    assert body["provenance"]["unavailable_context"] == []
    # What reached the LLM: pseudonymised, framework-grounded, stable system prompt first.
    call = fake_llm.calls[0]
    prompt = call.request.messages[0].content
    assert "James Miller" not in prompt and "the employee" in prompt
    assert "<skill_indicators>" in prompt
    assert call.request.metadata["tenant_id"] == "org-gec"


def test_diagnostics_repairs_invalid_llm_output(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    fake_llm.queue.extend(
        [
            {"summary": "s", "focus_skill_id": "skl-invented", "rationale": "r"},
            {"summary": "s", "focus_skill_id": "skl-microservices", "rationale": "r"},
        ]
    )
    body = client.post(
        "/v1/_dev/diagnostics", headers=auth(token("james")), json={"employee_id": "emp-8721"}
    ).json()
    assert body["focus_skill_id"] == "skl-microservices"
    assert body["validation"]["repaired"] is True
    assert "unknown_id" in fake_llm.calls[1].request.messages[-1].content


def test_diagnostics_fails_cleanly_after_exhausting_repairs(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    fake_llm.queue.extend([{"summary": "s", "focus_skill_id": "skl-invented", "rationale": "r"}] * 3)
    response = client.post(
        "/v1/_dev/diagnostics", headers=auth(token("james")), json={"employee_id": "emp-8721"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ai_output_invalid"
    assert len(fake_llm.calls) == 3


def test_diagnostics_enforces_subject_relation(client: TestClient, token: Any) -> None:
    peer = client.post("/v1/_dev/diagnostics", headers=auth(token("james")), json={"employee_id": "emp-9042"})
    assert peer.status_code == 403 and peer.json()["error"]["code"] == "forbidden"
    manager = client.post(
        "/v1/_dev/diagnostics", headers=auth(token("michael")), json={"employee_id": "emp-8721"}
    )
    assert manager.status_code == 200
    other_tenant = client.post(
        "/v1/_dev/diagnostics", headers=auth(token("ama")), json={"employee_id": "emp-8721"}
    )
    assert other_tenant.status_code == 403


def test_llm_refusal_surfaces_as_content_refused(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    from cfp_ai.llm.types import ProviderRefusal

    fake_llm.queue.append(ProviderRefusal("cyber"))
    response = client.post(
        "/v1/_dev/diagnostics", headers=auth(token("james")), json={"employee_id": "emp-8721"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "content_refused"


def test_dev_context_endpoint_reports_gaps(client: TestClient, token: Any) -> None:
    body = client.get("/v1/_dev/context/emp-8721", headers=auth(token("james"))).json()
    assert body["role_profile"]["role_id"] == "role-ssa"
    assert body["development_plans"][0]["id"] == "plan-5501"
    assert "token" not in str(body).lower() or "token-" not in str(body)
