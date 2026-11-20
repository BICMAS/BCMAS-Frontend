"""Production readiness: probes, request limits, LLM usage and budgets, error reporting,
and the deployment artefacts (docs/ai/PRODUCTION_READINESS_REPORT.md)."""

from __future__ import annotations

import logging
import re
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
import yaml
from fastapi.testclient import TestClient

from cfp_ai.api.app import create_app
from cfp_ai.container import Container, build_container, fake_responders
from cfp_ai.errors import AppError
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.llm.usage import UsageTracker, p95
from cfp_ai.observability.errors import _scrub, fingerprint
from cfp_ai.settings import Settings
from cfp_ai.workflows.store import SqliteWorkflowStore
from tests.conftest import auth, make_settings

SERVICE = Path(__file__).resolve().parents[1]


def _client(**settings: Any) -> tuple[TestClient, Container]:
    container = build_container(
        make_settings(**settings), providers={"fake": FakeLlmProvider(responders=fake_responders())}
    )
    return TestClient(create_app(container=container)), container


def _token(container: Container, persona: str) -> dict[str, str]:
    from cfp_ai.auth.verifier import DevTokenVerifier
    from cfp_ai.integrations.backend.mock.data import PERSONAS

    assert isinstance(container.verifier, DevTokenVerifier)
    return auth(container.verifier.mint(PERSONAS[persona]))


def _diagnose(client: TestClient, container: Container) -> Any:
    return client.post(
        "/v1/_dev/diagnostics", headers=_token(container, "james"), json={"employee_id": "emp-8721"}
    )


# ── health and readiness ─────────────────────────────────────────────────────


def test_readiness_reports_checks_without_secrets(client: TestClient) -> None:
    response = client.get("/readyz")
    body = response.json()
    assert response.status_code == 200 and body["status"] == "ready"
    assert response.headers["cache-control"] == "no-store"
    checks = {c["name"]: c for c in body["checks"]}
    assert {"llm_provider", "llm_routes", "workflow_store", "auth_jwks", "backend", "state_stores"} <= set(
        checks
    )
    assert checks["llm_provider"]["status"] == "ok" and checks["llm_provider"]["critical"]
    # Shared dependencies are advisory: they are reported but never take the replica out of rotation.
    assert checks["state_stores"]["status"] == "degraded" and not checks["state_stores"]["critical"]
    assert not re.search(r"secret|sk-|Bearer|password", response.text, re.IGNORECASE)


def test_readiness_fails_without_an_llm_provider() -> None:
    container = build_container(make_settings(), providers={})
    with TestClient(create_app(container=container)) as client:
        assert client.get("/healthz").status_code == 200  # alive, but must not receive traffic
        response = client.get("/readyz")
        assert response.status_code == 503 and response.json()["status"] == "not_ready"


def test_readiness_checks_the_workflow_store(tmp_path: Path) -> None:
    client, container = _client(workflow_store_path=str(tmp_path / "wf.db"))
    with client:
        checks = {c["name"]: c for c in client.get("/readyz").json()["checks"]}
        assert checks["workflow_store"] == {
            "name": "workflow_store",
            "status": "ok",
            "critical": True,
            "detail": "sqlite",
        }
        store = container.workflow_store
        assert isinstance(store, SqliteWorkflowStore)
        store.close()  # simulate a lost disk / closed database
        client.app.state.readiness._cached = None  # type: ignore[attr-defined]
        response = client.get("/readyz")
        assert response.status_code == 503
        failed = {c["name"] for c in response.json()["checks"] if c["status"] == "failed"}
        assert failed == {"workflow_store"}


def test_readiness_fails_while_draining() -> None:
    client, _ = _client()
    with client:
        assert client.get("/readyz").status_code == 200
        client.app.state.readiness.draining = True  # type: ignore[attr-defined]
        assert client.get("/readyz").status_code == 503
        assert client.get("/healthz").status_code == 200


# ── request limits ───────────────────────────────────────────────────────────


def test_oversized_bodies_are_rejected(client: TestClient, token: Any) -> None:
    big = "x" * 1_100_000
    response = client.post(
        "/v1/coaching/conversations", headers=auth(token("james")), content=f'{{"mode":"{big}"}}'
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "invalid_request"

    def chunks() -> Iterator[bytes]:  # no Content-Length: counted as it streams
        for _ in range(12):
            yield b"x" * 100_000

    streamed = client.post("/v1/coaching/conversations", headers=auth(token("james")), content=chunks())
    assert streamed.status_code == 413


# ── LLM usage tracking and budgets ───────────────────────────────────────────


def test_llm_usage_is_tracked_per_tenant() -> None:
    client, container = _client()
    with client:
        assert _diagnose(client, container).status_code == 200
        usage = container.gateway.usage.snapshot()
        row = usage["org-gec"]
        assert row.calls == 1 and row.input_tokens == 100 and row.output_tokens == 50
        assert row.unpriced_calls == 1  # the fake model has no price: reported, not silently zero
        metrics = client.get("/internal/metrics").text
        assert "ai_llm_unpriced_calls_total{model=" in metrics

        admin = client.get("/v1/admin/metrics", headers=_token(container, "alex"))
        assert admin.status_code == 200, admin.text
        body = admin.json()
        assert body["tenants"] == [
            {
                "tenant_id": "org-gec",
                "requests": 1,
                "input_tokens": 100,
                "output_tokens": 50,
                "cost_usd": 0.0,
                "budget_used_ratio": None,
            }
        ]
        assert set(body["p95_latency_ms_by_capability"]) <= {"system.diagnostics"}
        assert client.get("/v1/admin/metrics", headers=_token(container, "priya")).status_code == 403
        last_year = client.get(
            "/v1/admin/metrics", headers=_token(container, "alex"), params={"from": "2020-01-15T00:00:00Z"}
        ).json()
        assert last_year["tenants"] == [] and last_year["period_start"].startswith("2020-01-01")


def test_monthly_token_budget_is_enforced() -> None:
    client, container = _client(llm_monthly_token_budget=200)
    with client:
        assert _diagnose(client, container).status_code == 200  # 150 tokens used
        assert _diagnose(client, container).status_code == 200  # 300: over budget after this call
        refused = _diagnose(client, container)
        assert refused.status_code == 429
        assert refused.json()["error"]["code"] == "budget_exceeded"
        metrics = client.get("/internal/metrics").text
        assert 'ai_llm_budget_rejections_total{tenant="org-gec"} 1.0' in metrics
        assert 'ai_llm_budget_used_ratio{tenant="org-gec"} 1.5' in metrics
        admin = client.get("/v1/admin/metrics", headers=_token(container, "alex")).json()
        assert admin["tenants"][0]["budget_used_ratio"] == 1.5


def test_usage_tracker_budgets_months_and_warnings(caplog: pytest.LogCaptureFixture) -> None:
    now = datetime(2026, 11, 30, 23, 0, tzinfo=UTC)
    tracker = UsageTracker(default_budget=1000, tenant_budgets={"big": 10_000}, clock=lambda: now)
    assert tracker.budget("t1") == 1000 and tracker.budget("big") == 10_000
    with caplog.at_level(logging.WARNING):
        for _ in range(2):
            tracker.record(
                "t1", capability="c", input_tokens=400, output_tokens=50, cost_usd=0.01, latency_ms=10
            )
    assert [r.message for r in caplog.records].count("llm budget warning") == 1  # warned once
    tracker.check("big")
    tracker.record("t1", capability="c", input_tokens=200, output_tokens=0, cost_usd=None, latency_ms=10)
    with pytest.raises(AppError) as exc:
        tracker.check("t1")
    assert exc.value.code == "budget_exceeded"
    now = datetime(2026, 12, 1, 0, 1, tzinfo=UTC)  # new month: budget resets
    tracker.check("t1")
    assert p95([]) == 0 and p95(list(range(1, 101))) == 95


# ── error reporting ──────────────────────────────────────────────────────────


def test_unhandled_errors_are_reported_without_leaking(caplog: pytest.LogCaptureFixture) -> None:
    _, container = _client()

    def boom(*_: Any, **__: Any) -> Any:
        raise RuntimeError("secret detail: employee James Miller")

    container.capabilities.public_status = boom  # type: ignore[method-assign]
    app = create_app(container=container)
    errors_log = logging.getLogger("cfp_ai.errors")
    errors_log.addHandler(caplog.handler)  # configure_logging replaced the root handlers
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/v1/capabilities", headers=_token(container, "james"))
    finally:
        errors_log.removeHandler(caplog.handler)
    assert response.status_code == 500
    body = response.json()["error"]
    assert body["code"] == "internal_error" and "James" not in response.text and "secret" not in response.text
    record = next(r for r in caplog.records if r.message == "unhandled error")
    assert record.error_type == "RuntimeError" and len(record.error_fingerprint) == 12  # type: ignore[attr-defined]
    assert 'ai_unhandled_exceptions_total{type="RuntimeError"} 1.0' in client.get("/internal/metrics").text


def test_error_fingerprints_are_stable_and_sentry_events_are_scrubbed() -> None:
    def fail() -> None:
        raise ValueError("a")

    fps = set()
    for _ in range(2):
        try:
            fail()
        except ValueError as exc:
            fps.add(fingerprint(exc))
    assert len(fps) == 1
    event = {
        "request": {"data": "body"},
        "user": {"id": "u"},
        "extra": {"x": 1},
        "breadcrumbs": [],
        "exception": {
            "values": [{"value": "James Miller", "stacktrace": {"frames": [{"vars": {"t": "tok"}}]}}]
        },
    }
    scrubbed = _scrub(event, None)
    assert set(scrubbed) == {"exception"}
    frame = scrubbed["exception"]["values"][0]
    assert frame["value"] == "(redacted)" and "vars" not in frame["stacktrace"]["frames"][0]


def test_sentry_dsn_without_the_sdk_falls_back_to_logs() -> None:
    from cfp_ai.observability.errors import configure_error_reporting

    settings = make_settings(sentry_dsn="https://key@example.invalid/1")
    try:
        import sentry_sdk  # noqa: F401
    except ImportError:
        assert configure_error_reporting(settings, version="t") == "logs"


# ── deployment artefacts ─────────────────────────────────────────────────────

_SECRET_VALUE = re.compile(
    r"(sk-[A-Za-z0-9-]{10,}|sk-ant-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16})"
)


def _env_template(name: str) -> dict[str, str]:
    values = {}
    for line in (SERVICE / name).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.split("#", 1)[0].strip()
    return values


@pytest.mark.parametrize("name", [".env.example", ".env.production.example"])
def test_env_templates_name_real_settings_and_hold_no_secrets(name: str) -> None:
    text = (SERVICE / name).read_text(encoding="utf-8")
    assert not _SECRET_VALUE.search(text)
    fields = {f.upper() for f in Settings.model_fields}
    aliases = {"ANTHROPIC_API_KEY", "OPENAI_API_KEY", "FORWARDED_ALLOW_IPS"}
    for key in _env_template(name):
        assert key in aliases or key.removeprefix("CFP_AI_") in fields, f"unknown variable {key}"


def test_production_template_satisfies_the_startup_guard() -> None:
    values = _env_template(".env.production.example")
    assert values["CFP_AI_ENV"] == "prod" and values["CFP_AI_BACKEND_MODE"] == "http"
    for secret in ("ANTHROPIC_API_KEY", "CFP_AI_LOG_HASH_KEY"):
        assert values[secret] == ""  # placeholders only
    filled = {k: v for k, v in values.items() if k.startswith("CFP_AI_") and v and not v.startswith("<")}
    filled |= {
        "CFP_AI_RELEASE": "abc123",
        "CFP_AI_JWKS_URL": "https://idp.example/.well-known/jwks.json",
        "CFP_AI_JWT_ISSUERS": '["https://idp.example"]',
        "CFP_AI_JWT_AUDIENCES": '["cfp-api"]',
        "CFP_AI_BACKEND_BASE_URL": "https://backend.example/api/v1",
        "CFP_AI_LLM_MONTHLY_TOKEN_BUDGET": "50000000",
        "CFP_AI_LOG_HASH_KEY": "x" * 32,
    }
    import json

    kwargs: dict[str, Any] = {}
    for key, value in filled.items():
        field = key.removeprefix("CFP_AI_").lower()
        kwargs[field] = json.loads(value) if value.startswith("[") or value.startswith("{") else value
    settings = Settings(_env_file=None, anthropic_api_key="test-key", **kwargs)  # type: ignore[call-arg]
    assert settings.env.value == "prod" and settings.llm_monthly_token_budget == 50_000_000
    with pytest.raises(ValueError, match="log_hash_key is required"):
        Settings(_env_file=None, **{**kwargs, "log_hash_key": None})  # type: ignore[call-arg]


def test_kubernetes_manifests_are_safe_defaults() -> None:
    docs = [
        d
        for f in sorted((SERVICE / "deploy" / "kubernetes").glob("*.yaml"))
        for d in yaml.safe_load_all(f.read_text(encoding="utf-8"))
        if d
    ]
    by_kind = {d["kind"]: d for d in docs}
    deployment = by_kind["Deployment"]
    assert deployment["spec"]["replicas"] == 1 and deployment["spec"]["strategy"]["type"] == "Recreate"
    pod = deployment["spec"]["template"]["spec"]
    container = pod["containers"][0]
    assert container["readinessProbe"]["httpGet"]["path"] == "/readyz"
    assert container["livenessProbe"]["httpGet"]["path"] == "/healthz"
    assert container["securityContext"]["readOnlyRootFilesystem"] is True
    assert pod["securityContext"]["runAsNonRoot"] is True and pod["automountServiceAccountToken"] is False
    paths = [p["path"] for r in by_kind["Ingress"]["spec"]["rules"] for p in r["http"]["paths"]]
    assert "/internal/metrics" not in paths and "/readyz" not in paths
    config = by_kind["ConfigMap"]["data"]
    secret = by_kind["Secret"]["stringData"]
    assert not {k for k in config if "SECRET" in k or "API_KEY" in k or "HASH_KEY" in k or "DSN" in k}
    assert all(v == "" for v in secret.values())
    kustomization = yaml.safe_load(
        (SERVICE / "deploy/kubernetes/kustomization.yaml").read_text(encoding="utf-8")
    )
    assert "secret.example.yaml" not in kustomization["resources"]


def test_alert_rules_reference_real_metrics(container: Container) -> None:
    exposed = {m.name for m in container.metrics.registry.collect()}
    rules = (SERVICE / "deploy" / "monitoring" / "prometheus-rules.yaml").read_text(encoding="utf-8")
    yaml.safe_load(rules)
    for name in set(re.findall(r"\bai_[a-z_]+", rules)):
        base = re.sub(r"(_total|_bucket|_sum|_count)$", "", name)
        assert base in exposed, f"alert uses unknown metric {name}"


# ── scheduled maintenance ────────────────────────────────────────────────────


async def test_maintenance_enforces_coaching_retention_and_isolates_failures() -> None:
    from datetime import timedelta

    from cfp_ai.agents.coaching.models import StartConversationRequest
    from cfp_ai.maintenance import Maintenance
    from tests.conftest import make_principal

    _, container = _client()
    james = make_principal("james")
    old = await container.coaching.start_conversation(james, StartConversationRequest(mode="career"))
    state = container.coaching._store.conversation("org-gec", old.conversation_id)
    assert state is not None
    state.created_at = datetime.now(UTC) - timedelta(days=400)

    async def broken() -> dict[str, int]:
        raise RuntimeError("store unavailable")

    maintenance = Maintenance(
        jobs={"broken": broken, "coaching_retention": container.coaching.purge_expired},
        metrics=container.metrics,
        interval_s=3600,
    )
    results = await maintenance.run_once()
    assert results == {"broken": "error", "coaching_retention": {"conversations": 1, "sessions": 0}}
    assert await container.coaching.list_conversations(james) == []


def test_maintenance_runs_on_schedule_and_stops_on_shutdown() -> None:
    import time

    client, _ = _client(maintenance_interval_s=1)
    with client:
        maintenance = client.app.state.maintenance  # type: ignore[attr-defined]
        assert maintenance._task is None or maintenance.initial_delay_s == 30.0
    assert maintenance._task is None  # cancelled cleanly on shutdown

    fast, _ = _client(maintenance_interval_s=1)
    fast.app.state.maintenance.initial_delay_s = 0  # type: ignore[attr-defined]
    with fast:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if (
                'ai_maintenance_runs_total{job="coaching_retention",outcome="ok"}'
                in fast.get("/internal/metrics").text
            ):
                break
            time.sleep(0.05)
        else:
            pytest.fail("maintenance job never ran")
    disabled, _ = _client(maintenance_interval_s=0)
    with disabled:
        assert disabled.app.state.maintenance._task is None  # type: ignore[attr-defined]
