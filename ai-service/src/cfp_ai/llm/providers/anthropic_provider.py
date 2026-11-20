"""Anthropic adapter (official ``anthropic`` SDK, ``AsyncAnthropic``).

Normative behaviour (AI_TECHNICAL_SPEC.md §8.3):
  * structured output via ``output_config.format`` (JSON schema from the Pydantic model,
    normalised with ``anthropic.transform_schema``), validated with Pydantic *after*
    the stop reason is checked;
  * effort set explicitly via ``output_config.effort``; no ``thinking`` / sampling params;
  * refusals: check ``stop_reason == "refusal"`` before reading content; when enabled,
    the server-side fallback beta re-runs a declined request on a fallback model;
  * prompt caching: ``cache_control`` on the stable system blocks;
  * SDK retries transient errors (``max_retries``); the gateway adds a circuit breaker.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any, TypeVar

import anthropic
from anthropic import AsyncAnthropic
from pydantic import BaseModel, ValidationError

from cfp_ai.llm.types import (
    LlmRequest,
    LlmResult,
    LlmRoute,
    LlmStreamDelta,
    ProviderMisconfigured,
    ProviderOutputError,
    ProviderRefusal,
    ProviderUnavailable,
    StopValue,
    Usage,
)

T = TypeVar("T", bound=BaseModel)

FALLBACK_BETA = "server-side-fallback-2026-07-01"
_MAX_CACHE_BREAKPOINTS = 3  # API allows 4; keep one spare for future message-level caching
_KNOWN_STOPS: frozenset[str] = frozenset({"end_turn", "max_tokens", "tool_use", "refusal", "pause_turn"})


def _map_error(exc: Exception) -> Exception:
    if isinstance(
        exc, anthropic.APIConnectionError | anthropic.RateLimitError | anthropic.InternalServerError
    ):
        return ProviderUnavailable(type(exc).__name__)
    if isinstance(exc, anthropic.APIStatusError):
        if exc.status_code >= 500 or exc.status_code in (408, 409, 429, 529):
            return ProviderUnavailable(f"{type(exc).__name__} {exc.status_code}")
        return ProviderMisconfigured(f"{type(exc).__name__} {exc.status_code}")
    return exc


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, *, api_key: str, max_retries: int = 2, client: Any | None = None) -> None:
        # `client` is injectable for tests; production always builds the SDK client.
        self._client: Any = client or AsyncAnthropic(api_key=api_key, max_retries=max_retries)

    async def aclose(self) -> None:
        close = getattr(self._client, "close", None)
        if close is not None:
            await close()

    # ── request building ─────────────────────────────────────────────────

    def _kwargs(self, route: LlmRoute, request: LlmRequest) -> dict[str, Any]:
        system: list[dict[str, Any]] = []
        for index, block in enumerate(request.system_blocks):
            item: dict[str, Any] = {"type": "text", "text": block}
            if route.cache_system_prompt and index < _MAX_CACHE_BREAKPOINTS:
                item["cache_control"] = {"type": "ephemeral"}
            system.append(item)
        kwargs: dict[str, Any] = {
            "model": route.model,
            "max_tokens": route.max_tokens,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "output_config": {"effort": route.effort},
        }
        if system:
            kwargs["system"] = system
        if route.inference_geo:
            kwargs["inference_geo"] = route.inference_geo
        if route.refusal_fallback:
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
        return kwargs

    def _api(self, route: LlmRoute) -> Any:
        client = self._client.with_options(timeout=route.timeout_s)
        return client.beta.messages if route.refusal_fallback else client.messages

    # ── response handling ────────────────────────────────────────────────

    @staticmethod
    def _usage(message: Any) -> Usage:
        u = message.usage
        return Usage(
            input_tokens=u.input_tokens or 0,
            output_tokens=u.output_tokens or 0,
            cache_read_input_tokens=getattr(u, "cache_read_input_tokens", None) or 0,
            cache_creation_input_tokens=getattr(u, "cache_creation_input_tokens", None) or 0,
        )

    @staticmethod
    def _fallback_used(message: Any) -> bool:
        if any(getattr(block, "type", None) == "fallback" for block in message.content or []):
            return True
        iterations = getattr(message.usage, "iterations", None) or []
        return any(getattr(it, "type", None) == "fallback_message" for it in iterations)

    @staticmethod
    def _text(message: Any) -> str:
        return "".join(
            block.text for block in message.content or [] if getattr(block, "type", None) == "text"
        )

    @staticmethod
    def _check_refusal(message: Any) -> None:
        if message.stop_reason == "refusal":
            details = getattr(message, "stop_details", None)
            raise ProviderRefusal(getattr(details, "category", None))

    @staticmethod
    def _stop(message: Any) -> StopValue:
        value = message.stop_reason
        return value if value in _KNOWN_STOPS else "other"

    # ── LlmProvider ──────────────────────────────────────────────────────

    async def generate_structured(
        self, route: LlmRoute, request: LlmRequest, output_model: type[T]
    ) -> LlmResult[T]:
        started = time.perf_counter()
        kwargs = self._kwargs(route, request)
        # `create` + output_config.format (not the `parse` helper): `parse` validates the
        # text before we can read stop_reason, so a refusal would surface as a JSON error
        # and be mistaken for invalid output (and re-prompted by the repair loop).
        kwargs["output_config"] = {
            **kwargs["output_config"],
            "format": {
                "type": "json_schema",
                "schema": anthropic.transform_schema(output_model.model_json_schema()),
            },
        }
        try:
            message = await self._api(route).create(**kwargs)
        except anthropic.APIError as exc:
            raise _map_error(exc) from exc
        self._check_refusal(message)
        if message.stop_reason == "max_tokens":
            raise ProviderOutputError("structured output truncated (stop_reason=max_tokens)")
        try:
            parsed = output_model.model_validate_json(self._text(message))
        except ValidationError as exc:
            raise ProviderOutputError(
                f"structured output failed validation: {exc.error_count()} errors"
            ) from exc
        return LlmResult(
            text=None,
            parsed=parsed,
            stop=self._stop(message),
            model=message.model,
            usage=self._usage(message),
            latency_ms=int((time.perf_counter() - started) * 1000),
            fallback_used=self._fallback_used(message),
            provider_request_id=getattr(message, "_request_id", None),
        )

    async def stream_text(
        self, route: LlmRoute, request: LlmRequest
    ) -> AsyncIterator[LlmStreamDelta | LlmResult[BaseModel]]:
        started = time.perf_counter()
        ttft_ms: int | None = None
        try:
            async with self._api(route).stream(**self._kwargs(route, request)) as stream:
                async for event in stream:
                    if (
                        event.type == "content_block_delta"
                        and getattr(event.delta, "type", None) == "text_delta"
                    ):
                        if ttft_ms is None:
                            ttft_ms = int((time.perf_counter() - started) * 1000)
                        yield LlmStreamDelta(text=event.delta.text)
                message = await stream.get_final_message()
        except anthropic.APIError as exc:
            raise _map_error(exc) from exc
        self._check_refusal(message)
        yield LlmResult(
            text=self._text(message),
            parsed=None,
            stop=self._stop(message),
            model=message.model,
            usage=self._usage(message),
            latency_ms=int((time.perf_counter() - started) * 1000),
            fallback_used=self._fallback_used(message),
            ttft_ms=ttft_ms,
            provider_request_id=getattr(message, "_request_id", None),
        )
