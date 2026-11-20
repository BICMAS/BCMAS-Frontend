from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from cfp_ai.api.app import create_app
from cfp_ai.auth.principal import Principal
from cfp_ai.auth.verifier import DevTokenVerifier
from cfp_ai.container import Container, build_container, fake_responders
from cfp_ai.integrations.backend.mock.data import PERSONAS
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.settings import Settings

DEV_SECRET = "test-only-dev-secret-0123456789abcdef"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": "test",
        "auth_mode": "dev",
        "dev_jwt_secret": DEV_SECRET,
        "backend_mode": "mock",
        "llm_default_provider": "fake",
        "log_json": False,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def make_principal(persona: str, **overrides: Any) -> Principal:
    claims = PERSONAS[persona]
    values: dict[str, Any] = {
        "type": "user",
        "subject": claims["sub"],
        "tenant_id": claims["tenant_id"],
        "roles": frozenset(claims["roles"]),
        "employee_id": claims["employee_id"],
        "token": f"token-{persona}",
        "token_expires_at": datetime.now(UTC) + timedelta(minutes=15),
    }
    values.update(overrides)
    return Principal(**values)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def fake_llm() -> FakeLlmProvider:
    return FakeLlmProvider(responders=fake_responders())


@pytest.fixture
def container(settings: Settings, fake_llm: FakeLlmProvider) -> Container:
    return build_container(settings, providers={"fake": fake_llm})


@pytest.fixture
def client(container: Container) -> Iterator[TestClient]:
    with TestClient(create_app(container=container)) as test_client:
        yield test_client


@pytest.fixture
def token(container: Container) -> Any:
    verifier = container.verifier
    assert isinstance(verifier, DevTokenVerifier)

    def mint(persona: str, **claims: Any) -> str:
        return verifier.mint({**PERSONAS[persona], **claims})

    return mint


def auth(token_value: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_value}"}
