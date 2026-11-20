"""Mock data isolation and production posture."""

from __future__ import annotations

import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

from cfp_ai.integrations.backend.mock.client import MockBackendClient
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.settings import DEFAULT_CONFIG_DIR, Environment

SRC = Path(__file__).resolve().parents[1] / "src"


def test_mock_backend_refuses_production() -> None:
    registry = BackendEndpointRegistry.load(
        DEFAULT_CONFIG_DIR / "backend-endpoints.registry.yaml", Environment.PROD
    )
    with pytest.raises(RuntimeError):
        MockBackendClient(registry=registry, environment=Environment.PROD)


def test_production_app_never_imports_mock_or_dev_routes() -> None:
    """Build a prod-configured app in a fresh interpreter and inspect what got imported."""
    script = textwrap.dedent(
        """
        import json, sys
        from cfp_ai.api.app import create_app
        from cfp_ai.settings import Settings
        settings = Settings(_env_file=None, env="prod", auth_mode="jwks",
            jwks_url="https://auth.example.com/jwks", jwt_issuers=["https://auth.example.com"],
            jwt_audiences=["cfp-api"], backend_mode="http", backend_base_url="https://api.example.com/v1",
            llm_default_provider="anthropic", anthropic_api_key="sk-ant-test", log_hash_key="k",
            log_json=False)
        app = create_app(settings)
        paths = sorted({getattr(r, "path", "") for r in app.routes})
        print(json.dumps({
            "mock_loaded": [m for m in sys.modules if m.startswith("cfp_ai.integrations.backend.mock")],
            "dev_routes": [p for p in paths if p.startswith("/v1/_dev")],
            "docs": "/docs" in paths or "/openapi.json" in paths,
            "diagnostics_loaded": "cfp_ai.agents.system.diagnostics" in sys.modules,
        }))
        """
    )
    # Fresh interpreter, without any developer CFP_AI_* / provider variables leaking in.
    env = {
        k: v
        for k, v in os.environ.items()
        if not k.startswith("CFP_AI_") and k not in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY")
    }
    env["PYTHONPATH"] = str(SRC)
    result = subprocess.run(  # noqa: S603 — fixed interpreter and script, no external input
        [sys.executable, "-c", script], capture_output=True, text=True, check=True, env=env, cwd=SRC.parent
    )
    import json

    report = json.loads(result.stdout.strip().splitlines()[-1])
    assert report == {"mock_loaded": [], "dev_routes": [], "docs": False, "diagnostics_loaded": False}
