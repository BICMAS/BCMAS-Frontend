"""LLM gateway — what agents call (AI_TECHNICAL_SPEC.md §8.1, §8.4).

Responsibilities: route resolution, provider selection, deadline enforcement,
per-provider/model circuit breaking, error mapping to public codes, usage and
cost telemetry. Provider SDK retries handle transport-level retries.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Mapping
from dataclasses import replace
from typing import TypeVar

from pydantic import BaseModel

from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.circuit import CircuitBreaker
from cfp_ai.llm.providers.base import LlmProvider
from cfp_ai.llm.routes import RouteTable
from cfp_ai.llm.types import (
    LlmRequest,
    LlmResult,
    LlmRoute,
    LlmStreamDelta,
    ProviderMisconfigured,
    ProviderOutputError,
    ProviderRefusal,
    ProviderUnavailable,
)
from cfp_ai.llm.usage import UsageTracker
from cfp_ai.observability.metrics import Metrics
from cfp_ai.observability.tracing import tracer
from cfp_ai.security.injection import UNTRUSTED_INPUT_POLICY

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)


def _harden(request: LlmRequest) -> LlmRequest:
    """Every model call starts with the untrusted-input policy (prompt-injection defence)."""
    if request.system_blocks and request.system_blocks[0] == UNTRUSTED_INPUT_POLICY:
        return request
    return replace(request, system_blocks=(UNTRUSTED_INPUT_POLICY, *request.system_blocks))


class LlmGateway:
    def __init__(
        self,
        *,
        routes: RouteTable,
        providers: Mapping[str, LlmProvider],
        metrics: Metrics,
        breaker: CircuitBreaker | None = None,
        usage: UsageTracker | None = None,
    ) -> None:
        self._routes = routes
        self.usage = usage or UsageTracker()
        self._providers = dict(providers)
        self._metrics = metrics
        self._breaker = breaker or CircuitBreaker(window_s=60, min_calls=20, failure_ratio=0.5, open_s=30)

    # ── introspection (health, capability availability) ──────────────────

    def provider_names(self) -> list[str]:
        return sorted(self._providers)

    def route_usable(self, route_id: str) -> bool:
        route = self._routes.get(route_id)
        return route is not None and route.provider in self._providers

    async def aclose(self) -> None:
        for provider in self._providers.values():
            await provider.aclose()

    # ── internals ────────────────────────────────────────────────────────

    def _resolve(self, route_id: str) -> tuple[LlmRoute, LlmProvider]:
        route = self._routes.get(route_id)
        if route is None:
            reason = self._routes.unusable.get(route_id, "unknown route")
            raise AppError("ai_unavailable", internal_detail=f"route {route_id}: {reason}")
        provider = self._providers.get(route.provider)
        if provider is None:
            raise AppError(
                "ai_unavailable",
                internal_detail=f"provider {route.provider} not configured (route {route_id})",
            )
        if self._breaker.is_open(f"{route.provider}:{route.model}"):
            raise AppError("ai_unavailable", internal_detail=f"circuit open {route.provider}:{route.model}")
        return route, provider

    def _check_budget(self, request: LlmRequest) -> None:
        tenant = request.metadata.get("tenant_id")
        if tenant is None:
            return
        try:
            self.usage.check(tenant)
        except AppError:
            self._metrics.llm_budget_rejections.labels(tenant).inc()
            raise

    @staticmethod
    def _timeout(route: LlmRoute, deadline: float | None) -> float:
        if deadline is None:
            return route.timeout_s
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise AppError("deadline_exceeded", internal_detail="deadline passed before LLM call")
        return min(route.timeout_s, remaining)

    def _record_success(
        self, route: LlmRoute, request: LlmRequest, result: LlmResult[BaseModel] | LlmResult[T]
    ) -> None:
        self._breaker.record(f"{route.provider}:{route.model}", ok=True)
        m = self._metrics
        u = result.usage
        for kind, value in (
            ("input", u.input_tokens),
            ("output", u.output_tokens),
            ("cache_read", u.cache_read_input_tokens),
            ("cache_write", u.cache_creation_input_tokens),
        ):
            if value:
                m.llm_tokens.labels(route.route_id, result.model, kind).inc(value)
        tenant = request.metadata.get("tenant_id", "unknown")
        price = self._routes.prices_per_mtok.get(result.model)
        cost: float | None = None
        if price:
            cost = (u.input_tokens * price[0] + u.output_tokens * price[1]) / 1_000_000
            m.llm_cost.labels(tenant, route.route_id).inc(cost)
        else:
            m.llm_unpriced_calls.labels(result.model).inc()
        ratio = self.usage.record(
            tenant,
            capability=request.metadata.get("capability", route.route_id),
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
            cache_read_tokens=u.cache_read_input_tokens,
            cache_write_tokens=u.cache_creation_input_tokens,
            cost_usd=cost,
            latency_ms=result.latency_ms,
        )
        if ratio is not None:
            m.llm_budget_used.labels(tenant).set(ratio)
        m.llm_calls.labels(route.route_id, route.provider, "ok").inc()
        m.llm_latency.labels(route.route_id, route.provider).observe(result.latency_ms / 1000)
        log.info(
            "llm call",
            extra={
                "route": route.route_id,
                "model": result.model,
                "input_tokens": u.input_tokens,
                "output_tokens": u.output_tokens,
                "cache_read_tokens": u.cache_read_input_tokens,
                "latency_ms": result.latency_ms,
                "fallback_used": result.fallback_used,
            },
        )

    def _map_failure(self, route: LlmRoute, exc: BaseException) -> AppError:
        key = f"{route.provider}:{route.model}"
        labels = (route.route_id, route.provider)
        if isinstance(exc, ProviderRefusal):
            self._metrics.llm_refusals.labels(route.route_id, exc.category or "unknown").inc()
            self._metrics.llm_calls.labels(*labels, "refusal").inc()
            return AppError("content_refused", internal_detail=f"refusal category={exc.category}")
        if isinstance(exc, TimeoutError):
            self._breaker.record(key, ok=False)
            self._metrics.llm_calls.labels(*labels, "timeout").inc()
            return AppError("deadline_exceeded", internal_detail=f"LLM timeout on {route.route_id}")
        if isinstance(exc, ProviderUnavailable):
            self._breaker.record(key, ok=False)
            self._metrics.llm_calls.labels(*labels, "unavailable").inc()
            return AppError("ai_unavailable", internal_detail=str(exc))
        if isinstance(exc, ProviderOutputError):
            self._metrics.llm_calls.labels(*labels, "output_error").inc()
            return AppError("ai_output_invalid", internal_detail=str(exc))
        if isinstance(exc, ProviderMisconfigured):
            self._metrics.llm_calls.labels(*labels, "misconfigured").inc()
            log.error("llm provider misconfigured", extra={"route": route.route_id, "detail": str(exc)})
            return AppError("internal_error", internal_detail=str(exc))
        self._metrics.llm_calls.labels(*labels, "error").inc()
        return AppError("internal_error", internal_detail=f"{type(exc).__name__}: {exc}")

    # ── public API ───────────────────────────────────────────────────────

    async def structured(
        self,
        route_id: str,
        request: LlmRequest,
        output_model: type[T],
        *,
        deadline: float | None = None,
    ) -> LlmResult[T]:
        route, provider = self._resolve(route_id)
        self._check_budget(request)
        timeout = self._timeout(route, deadline)
        request = _harden(request)
        with tracer().start_as_current_span("llm.call") as span:
            span.set_attribute("llm.route_id", route.route_id)
            span.set_attribute("llm.provider", route.provider)
            span.set_attribute("llm.model", route.model)
            span.set_attribute("llm.effort", route.effort)
            try:
                async with asyncio.timeout(timeout):
                    result = await provider.generate_structured(route, request, output_model)
            except (
                ProviderRefusal,
                ProviderUnavailable,
                ProviderOutputError,
                ProviderMisconfigured,
                TimeoutError,
            ) as exc:
                raise self._map_failure(route, exc) from exc
            span.set_attribute("llm.input_tokens", result.usage.input_tokens)
            span.set_attribute("llm.output_tokens", result.usage.output_tokens)
            span.set_attribute("llm.fallback_used", result.fallback_used)
        self._record_success(route, request, result)
        return result

    async def stream(
        self,
        route_id: str,
        request: LlmRequest,
        *,
        deadline: float | None = None,
    ) -> AsyncIterator[LlmStreamDelta | LlmResult[BaseModel]]:
        route, provider = self._resolve(route_id)
        self._check_budget(request)
        timeout = self._timeout(route, deadline)
        request = _harden(request)
        final: LlmResult[BaseModel] | None = None
        try:
            async with asyncio.timeout(timeout):
                async for item in provider.stream_text(route, request):
                    if isinstance(item, LlmResult):
                        final = item
                    yield item
        except (
            ProviderRefusal,
            ProviderUnavailable,
            ProviderOutputError,
            ProviderMisconfigured,
            TimeoutError,
        ) as exc:
            raise self._map_failure(route, exc) from exc
        if final is None:
            raise AppError("internal_error", internal_detail="stream ended without final result")
        self._record_success(route, request, final)
