"""OpenAI adapter (official ``openai`` SDK, ``AsyncOpenAI``), Chat Completions API.

* Structured output via ``chat.completions.parse(response_format=Model)``.
* System blocks are joined into one system message.
* ``route.effort`` is not sent; ``reasoning_effort`` is sent only when the route
  sets ``openai_reasoning_effort`` (valid only for reasoning models).
* No default model: ``CFP_AI_OPENAI_DEFAULT_MODEL`` (or a route ``model``) must be set.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any, TypeVar

import openai
from openai import AsyncOpenAI
from pydantic import BaseModel

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

_FINISH_TO_STOP: dict[str, StopValue] = {
    "stop": "end_turn",
    "length": "max_tokens",
    "tool_calls": "tool_use",
    "content_filter": "refusal",
}


def _map_error(exc: Exception) -> Exception:
    if isinstance(exc, openai.LengthFinishReasonError):
        return ProviderOutputError("finish_reason=length")
    if isinstance(exc, openai.ContentFilterFinishReasonError):
        return ProviderRefusal("content_filter")
    if isinstance(exc, openai.APIConnectionError | openai.RateLimitError | openai.InternalServerError):
        return ProviderUnavailable(type(exc).__name__)
    if isinstance(exc, openai.APIStatusError):
        if exc.status_code >= 500 or exc.status_code in (408, 409, 429):
            return ProviderUnavailable(f"{type(exc).__name__} {exc.status_code}")
        return ProviderMisconfigured(f"{type(exc).__name__} {exc.status_code}")
    return exc


class OpenAIProvider:
    name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str | None = None,
        max_retries: int = 2,
        client: Any | None = None,
    ) -> None:
        self._client: Any = client or AsyncOpenAI(api_key=api_key, base_url=base_url, max_retries=max_retries)

    async def aclose(self) -> None:
        close = getattr(self._client, "close", None)
        if close is not None:
            await close()

    @staticmethod
    def _messages(request: LlmRequest) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if request.system_blocks:
            messages.append({"role": "system", "content": "\n\n".join(request.system_blocks)})
        messages.extend({"role": m.role, "content": m.content} for m in request.messages)
        return messages

    @staticmethod
    def _common(route: LlmRoute, request: LlmRequest) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": route.model,
            "messages": OpenAIProvider._messages(request),
            "max_completion_tokens": route.max_tokens,
        }
        if route.openai_reasoning_effort:
            kwargs["reasoning_effort"] = route.openai_reasoning_effort
        return kwargs

    @staticmethod
    def _usage(usage: Any) -> Usage:
        if usage is None:
            return Usage()
        details = getattr(usage, "prompt_tokens_details", None)
        return Usage(
            input_tokens=usage.prompt_tokens or 0,
            output_tokens=usage.completion_tokens or 0,
            cache_read_input_tokens=(getattr(details, "cached_tokens", None) or 0) if details else 0,
        )

    async def generate_structured(
        self, route: LlmRoute, request: LlmRequest, output_model: type[T]
    ) -> LlmResult[T]:
        started = time.perf_counter()
        try:
            completion = await self._client.with_options(timeout=route.timeout_s).chat.completions.parse(
                **self._common(route, request), response_format=output_model
            )
        except openai.OpenAIError as exc:
            raise _map_error(exc) from exc
        choice = completion.choices[0]
        if getattr(choice.message, "refusal", None):
            raise ProviderRefusal("model_refusal")
        parsed = choice.message.parsed
        if parsed is None:
            raise ProviderOutputError(f"no parsed output (finish_reason={choice.finish_reason})")
        return LlmResult(
            text=None,
            parsed=parsed,
            stop=_FINISH_TO_STOP.get(choice.finish_reason or "", "other"),
            model=completion.model,
            usage=self._usage(completion.usage),
            latency_ms=int((time.perf_counter() - started) * 1000),
            provider_request_id=getattr(completion, "_request_id", None),
        )

    async def stream_text(
        self, route: LlmRoute, request: LlmRequest
    ) -> AsyncIterator[LlmStreamDelta | LlmResult[BaseModel]]:
        started = time.perf_counter()
        ttft_ms: int | None = None
        parts: list[str] = []
        finish: str | None = None
        usage: Any = None
        model = route.model
        try:
            stream = await self._client.with_options(timeout=route.timeout_s).chat.completions.create(
                **self._common(route, request), stream=True, stream_options={"include_usage": True}
            )
            async for chunk in stream:
                model = getattr(chunk, "model", None) or model
                if getattr(chunk, "usage", None):
                    usage = chunk.usage
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                if choice.finish_reason:
                    finish = choice.finish_reason
                text = getattr(choice.delta, "content", None)
                if text:
                    if ttft_ms is None:
                        ttft_ms = int((time.perf_counter() - started) * 1000)
                    parts.append(text)
                    yield LlmStreamDelta(text=text)
        except openai.OpenAIError as exc:
            raise _map_error(exc) from exc
        if finish == "content_filter":
            raise ProviderRefusal("content_filter")
        yield LlmResult(
            text="".join(parts),
            parsed=None,
            stop=_FINISH_TO_STOP.get(finish or "", "other"),
            model=model,
            usage=self._usage(usage),
            latency_ms=int((time.perf_counter() - started) * 1000),
            ttft_ms=ttft_ms,
        )
