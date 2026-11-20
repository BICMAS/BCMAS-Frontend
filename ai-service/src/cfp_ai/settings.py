"""Application configuration.

All configuration comes from environment variables (prefix ``CFP_AI_``) or a local
``.env`` file in development. Secrets are ``SecretStr`` so they never appear in
reprs, logs or serialised settings, and nothing in this module is ever returned
to API clients.

Safety rules enforced at startup (see ``_enforce_environment_rules``):
  * staging/prod must use the real backend (``backend_mode=http``), real token
    verification (``auth_mode=jwks``) and a real LLM provider;
  * the mock backend, dev tokens and the fake LLM provider are dev/test-only.
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Shipped inside the package so it resolves identically for editable installs and wheels.
DEFAULT_CONFIG_DIR = Path(__file__).resolve().parent / "config"


class Environment(StrEnum):
    DEV = "dev"
    TEST = "test"
    STAGING = "staging"
    PROD = "prod"

    @property
    def is_local(self) -> bool:
        return self in (Environment.DEV, Environment.TEST)


class BackendMode(StrEnum):
    MOCK = "mock"  # in-process mock adapter (dev/test only)
    HTTP = "http"  # conventional backend over HTTP (or a contract-mock server in dev)


class AuthMode(StrEnum):
    DEV = "dev"  # HS256 tokens minted locally (dev/test only)
    JWKS = "jwks"  # backend-issued JWTs verified against JWKS (BE-001)


class LlmProviderName(StrEnum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    FAKE = "fake"  # deterministic scripted provider (dev/test only)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CFP_AI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Service ──────────────────────────────────────────────────────────
    env: Environment = Environment.DEV
    service_name: str = "cfp-ai-service"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True
    expose_docs: bool | None = None  # default: only in dev/test

    # ── Authentication ───────────────────────────────────────────────────
    auth_mode: AuthMode = AuthMode.JWKS
    jwks_url: str | None = None
    jwt_issuers: list[str] = Field(default_factory=list)
    jwt_audiences: list[str] = Field(default_factory=list)
    jwt_algorithms: list[str] = Field(default_factory=lambda: ["RS256", "ES256"])
    jwt_leeway_s: int = 60
    jwks_cache_s: int = 600
    dev_jwt_secret: SecretStr | None = None

    # ── Conventional backend ─────────────────────────────────────────────
    backend_mode: BackendMode = BackendMode.HTTP
    backend_base_url: str | None = None
    backend_registry_path: Path = DEFAULT_CONFIG_DIR / "backend-endpoints.registry.yaml"
    backend_connect_timeout_s: float = 1.0
    backend_read_timeout_s: float = 2.0
    backend_list_timeout_s: float = 5.0
    backend_max_retries: int = 2
    # Integration (BACKEND_INTEGRATION_SPEC.md §4): API major version (must match the base URL's /v{n}),
    # user identity mode, service credentials (BE-003), TLS, reference cache, pagination and size caps.
    backend_api_version: str = "1"
    backend_identity_mode: Literal["forward", "exchange"] = "forward"
    backend_token_audience: str | None = None  # required for identity_mode=exchange (BE-002)
    backend_client_id: str | None = None
    backend_client_secret: SecretStr | None = None
    backend_service_scope: str = "ai.reference.read ai.events.write"
    backend_ca_bundle: str | None = None
    backend_client_cert: str | None = None  # mTLS (optional)
    backend_client_key: str | None = None
    backend_reference_cache_ttl_s: float = Field(default=300, ge=0, le=86_400)
    backend_max_pages: int = Field(default=10, ge=1, le=100)
    backend_max_response_bytes: int = Field(default=5_000_000, ge=10_000)
    service_client_id: str | None = None
    service_client_secret: SecretStr | None = None

    # ── LLM providers ────────────────────────────────────────────────────
    llm_default_provider: LlmProviderName = LlmProviderName.ANTHROPIC
    llm_routes_path: Path = DEFAULT_CONFIG_DIR / "llm_routes.yaml"
    anthropic_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("CFP_AI_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY")
    )
    anthropic_default_model: str = "claude-opus-5-5"
    anthropic_refusal_fallback: bool = True
    openai_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("CFP_AI_OPENAI_API_KEY", "OPENAI_API_KEY")
    )
    # No default: the OpenAI model must be chosen explicitly by whoever enables it.
    openai_default_model: str | None = None
    openai_base_url: str | None = None
    llm_max_retries: int = 2
    # Cost management: monthly token budget (input + output) per tenant; None = unlimited.
    llm_monthly_token_budget: int | None = Field(default=None, ge=1)
    llm_tenant_token_budgets: dict[str, int] = Field(default_factory=dict)  # per-tenant overrides
    llm_budget_warn_ratio: float = Field(default=0.8, gt=0, le=1)

    # Entitlements used when the token has no ai_entitlements claim and BE-005 is not
    # available. None → all in dev/test, none in staging/prod (fail closed).
    default_entitlements: list[str] | None = None

    # ── Context & caching ────────────────────────────────────────────────
    context_slice_timeout_s: float = 2.0
    context_cache_ttl_s: int = 300
    context_framework_cache_ttl_s: int = 3600

    # ── Coaching privacy & retention (AI_TECHNICAL_SPEC.md §6.4-§6.5, §10.4) ──
    coaching_retention_days: int = 365  # transcripts, summaries, evaluations
    learner_memory_ttl_days: int = 365
    coaching_manager_can_view_summaries: bool = True  # transcripts are never shown to managers
    coaching_max_conversation_turns: int = 100
    coaching_max_roleplay_turns: int = 60

    # ── Development plans (docs/ai/DEVELOPMENT_PLAN_AGENT.md §6) ──
    # role_approval: the subject's line manager or HR must approve (no self-approval).
    # user_accept: the employee may also accept their own plan.
    dev_plan_approval_mode: Literal["role_approval", "user_accept"] = "role_approval"
    dev_plan_max_goals: int = 6
    draft_ttl_days: int = 14
    # Rate limits per one-minute window (AI_API_SPEC.md §8); 0 disables a limit.
    rate_limit_user_per_minute: int = Field(default=120, ge=0)
    rate_limit_tenant_per_minute: int = Field(default=2000, ge=0)
    # Collaborative workflows: state store (SQLite file; None = in-memory) and automatic stage retries.
    workflow_store_path: str | None = None
    workflow_retry_attempts: int = Field(default=3, ge=1, le=10)
    workflow_retry_backoff_s: float = Field(default=0.5, ge=0, le=60)
    # In-process maintenance (coaching retention purge); 0 disables (e.g. when an external scheduler runs it).
    maintenance_interval_s: int = Field(default=3600, ge=0)

    # ── HTTP hardening ───────────────────────────────────────────────────
    max_request_body_bytes: int = Field(default=1_000_000, ge=10_000)

    # ── Observability ────────────────────────────────────────────────────
    # Optional error reporting to Sentry (needs the sentry-sdk package in the image). No PII is sent.
    sentry_dsn: SecretStr | None = None
    sentry_traces_sample_rate: float = Field(default=0.0, ge=0, le=1)
    release: str | None = None  # e.g. the image tag or git SHA, reported with errors and on /readyz
    otel_exporter: Literal["none", "console"] = "none"
    metrics_enabled: bool = True
    log_hash_key: SecretStr | None = None  # required outside dev/test

    # ── Webhooks (BE-080) ────────────────────────────────────────────────
    webhook_secret: SecretStr | None = None
    webhook_max_skew_s: int = 300

    @property
    def docs_enabled(self) -> bool:
        return self.env.is_local if self.expose_docs is None else self.expose_docs

    @model_validator(mode="after")
    def _enforce_environment_rules(self) -> Settings:
        problems: list[str] = []
        if not self.env.is_local:
            if self.backend_mode is BackendMode.MOCK:
                problems.append("backend_mode=mock is only allowed in dev/test")
            if self.auth_mode is AuthMode.DEV:
                problems.append("auth_mode=dev is only allowed in dev/test")
            if self.dev_jwt_secret is not None:
                problems.append("dev_jwt_secret must not be set outside dev/test")
            if self.llm_default_provider is LlmProviderName.FAKE:
                problems.append("llm_default_provider=fake is only allowed in dev/test")
            if self.log_hash_key is None:
                problems.append("log_hash_key is required outside dev/test")
        if self.auth_mode is AuthMode.JWKS:
            if not self.jwks_url:
                problems.append("jwks_url is required when auth_mode=jwks")
            if not self.jwt_issuers or not self.jwt_audiences:
                problems.append("jwt_issuers and jwt_audiences are required when auth_mode=jwks")
        if self.auth_mode is AuthMode.DEV and (
            self.dev_jwt_secret is None or len(self.dev_jwt_secret.get_secret_value()) < 32
        ):
            problems.append("dev_jwt_secret (>= 32 chars) is required when auth_mode=dev")
        if self.backend_mode is BackendMode.HTTP and not self.backend_base_url:
            problems.append("backend_base_url is required when backend_mode=http")
        if self.backend_mode is BackendMode.HTTP and self.backend_base_url:
            url = self.backend_base_url.rstrip("/")
            if not self.env.is_local and not url.startswith("https://"):
                problems.append("backend_base_url must use https outside dev/test")
            if not url.endswith(f"/v{self.backend_api_version.split('.')[0]}"):
                problems.append("backend_base_url must end with the API major version (e.g. /v1)")
        if self.backend_identity_mode == "exchange" and not (
            self.backend_token_audience and self.backend_client_id and self.backend_client_secret
        ):
            problems.append(
                "identity_mode=exchange needs backend_token_audience, backend_client_id and secret"
            )
        if bool(self.backend_client_id) != bool(self.backend_client_secret):
            problems.append("backend_client_id and backend_client_secret must be set together")
        if bool(self.backend_client_cert) != bool(self.backend_client_key):
            problems.append("backend_client_cert and backend_client_key must be set together")
        if problems:
            raise ValueError("Invalid configuration: " + "; ".join(problems))
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
