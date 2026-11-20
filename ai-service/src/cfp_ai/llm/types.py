"""Provider-neutral LLM types (AI_TECHNICAL_SPEC.md §8).

Agents reference *route IDs*, never model names. The request deliberately has
no sampling parameters, no assistant prefill and no forced tool choice: the
default Anthropic model rejects them, so the abstraction does not offer them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

Effort = Literal["low", "medium", "high", "xhigh", "max"]
ProviderName = Literal["anthropic", "openai", "fake"]
StopValue = Literal["end_turn", "max_tokens", "tool_use", "refusal", "pause_turn", "other"]

T = TypeVar("T", bound=BaseModel)


@dataclass(frozen=True)
class LlmRoute:
    route_id: str
    provider: ProviderName
    model: str
    effort: Effort
    max_tokens: int
    timeout_s: float
    stream: bool = False
    refusal_fallback: bool = True  # Anthropic server-side fallback
    cache_system_prompt: bool = True
    inference_geo: str | None = None
    openai_reasoning_effort: Literal["low", "medium", "high"] | None = None


@dataclass(frozen=True)
class LlmMessage:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class LlmRequest:
    route_id: str
    system_blocks: tuple[str, ...]  # stable first → cacheable prefix
    messages: tuple[LlmMessage, ...]
    metadata: dict[str, str] = field(default_factory=dict)  # tenant_id, capability (telemetry)


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

    def __add__(self, other: Usage) -> Usage:
        return Usage(
            self.input_tokens + other.input_tokens,
            self.output_tokens + other.output_tokens,
            self.cache_read_input_tokens + other.cache_read_input_tokens,
            self.cache_creation_input_tokens + other.cache_creation_input_tokens,
        )


@dataclass(frozen=True)
class LlmResult(Generic[T]):
    text: str | None
    parsed: T | None
    stop: StopValue
    model: str  # model that actually served (may differ after a fallback)
    usage: Usage
    latency_ms: int
    fallback_used: bool = False
    ttft_ms: int | None = None
    provider_request_id: str | None = None
    refusal_category: str | None = None


@dataclass(frozen=True)
class LlmStreamDelta:
    text: str


# ── Provider-level exceptions (mapped to AppError by the gateway) ────────────


class ProviderError(Exception):
    """Base for provider failures."""


class ProviderUnavailable(ProviderError):
    """Transient: rate limit, overload, 5xx, timeout, connection error."""


class ProviderMisconfigured(ProviderError):
    """Permanent: auth error, invalid request, unknown model. A bug or bad config."""


class ProviderRefusal(ProviderError):
    def __init__(self, category: str | None) -> None:
        super().__init__(f"refusal: {category}")
        self.category = category


class ProviderOutputError(ProviderError):
    """The model returned no usable structured output (e.g. hit max_tokens)."""
