from __future__ import annotations

import pytest
from pydantic import ValidationError

from tests.conftest import make_settings

PROD_OK = {
    "env": "prod",
    "auth_mode": "jwks",
    "dev_jwt_secret": None,
    "jwks_url": "https://auth.example.com/.well-known/jwks.json",
    "jwt_issuers": ["https://auth.example.com"],
    "jwt_audiences": ["cfp-api"],
    "backend_mode": "http",
    "backend_base_url": "https://api.example.com/v1",
    "llm_default_provider": "anthropic",
    "log_hash_key": "prod-hash-key",
}


def test_valid_production_settings() -> None:
    settings = make_settings(**PROD_OK)
    assert settings.docs_enabled is False


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"backend_mode": "mock"}, "backend_mode=mock"),
        ({"auth_mode": "dev", "dev_jwt_secret": "x" * 40}, "auth_mode=dev"),
        ({"llm_default_provider": "fake"}, "llm_default_provider=fake"),
        ({"log_hash_key": None}, "log_hash_key"),
        ({"jwks_url": None}, "jwks_url"),
        ({"backend_base_url": None}, "backend_base_url"),
        ({"backend_base_url": "http://api.example.com/v1"}, "https"),
        ({"backend_base_url": "https://api.example.com"}, "API major version"),
        ({"backend_api_version": "2"}, "API major version"),
        ({"backend_identity_mode": "exchange"}, "identity_mode=exchange"),
        ({"backend_client_id": "ai"}, "set together"),
        ({"backend_client_cert": "/etc/cert.pem"}, "set together"),
    ],
)
def test_production_rejects_dev_only_configuration(override: dict[str, object], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        make_settings(**{**PROD_OK, **override})


def test_dev_auth_requires_long_secret() -> None:
    with pytest.raises(ValidationError, match="dev_jwt_secret"):
        make_settings(dev_jwt_secret="short")


def test_secrets_never_appear_in_repr_or_dump() -> None:
    settings = make_settings(
        anthropic_api_key="sk-ant-secret-value-123", openai_api_key="sk-openai-secret-456"
    )
    for rendered in (repr(settings), str(settings), settings.model_dump_json()):
        assert "sk-ant-secret-value-123" not in rendered
        assert "sk-openai-secret-456" not in rendered


def test_standard_api_key_env_vars_are_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-from-env")
    settings = make_settings()
    assert settings.anthropic_api_key is not None
    assert settings.anthropic_api_key.get_secret_value() == "sk-ant-from-env"
