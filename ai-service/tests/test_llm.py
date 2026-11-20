from __future__ import annotations

import json
from typing import Any

import httpx
import httpx2
import pytest
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from pydantic import BaseModel

from cfp_ai.errors import AppError
from cfp_ai.llm.gateway import LlmGateway
from cfp_ai.llm.providers.anthropic_provider import FALLBACK_BETA, AnthropicProvider
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.llm.providers.openai_provider import OpenAIProvider
from cfp_ai.llm.routes import RouteTable, load_routes
from cfp_ai.llm.types import (
    LlmMessage,
    LlmRequest,
    LlmResult,
    LlmRoute,
    LlmStreamDelta,
    ProviderOutputError,
    ProviderRefusal,
    ProviderUnavailable,
)
from cfp_ai.observability.metrics import Metrics
from cfp_ai.settings import DEFAULT_CONFIG_DIR
from tests.conftest import make_settings


class Answer(BaseModel):
    summary: str
    score: int


ROUTE = LlmRoute(
    route_id="test.route",
    provider="anthropic",
    model="claude-opus-5-5",
    effort="high",
    max_tokens=1000,
    timeout_s=10,
)
REQUEST = LlmRequest(
    route_id="test.route",
    system_blocks=("You are a test.", "Tenant framework context."),
    messages=(LlmMessage(role="user", content="Hello"),),
    metadata={"tenant_id": "org-gec"},
)


# ── route table ──────────────────────────────────────────────────────────────


def test_route_table_resolves_default_provider_and_model() -> None:
    table = load_routes(
        DEFAULT_CONFIG_DIR / "llm_routes.yaml", make_settings(llm_default_provider="anthropic")
    )
    route = table.get("coaching.persona_turn")
    assert route is not None
    assert (route.provider, route.model, route.effort, route.stream) == (
        "anthropic",
        "claude-opus-5-5",
        "low",
        True,
    )
    assert table.prices_per_mtok["claude-opus-5-5"] == (4.0, 20.0)


def test_openai_routes_unusable_without_explicit_model() -> None:
    table = load_routes(DEFAULT_CONFIG_DIR / "llm_routes.yaml", make_settings(llm_default_provider="openai"))
    assert table.routes == {}
    assert "no default model" in table.unusable["system.diagnostics"]
    table = load_routes(
        DEFAULT_CONFIG_DIR / "llm_routes.yaml",
        make_settings(llm_default_provider="openai", openai_default_model="my-org-model"),
    )
    route = table.get("system.diagnostics")
    assert route is not None and route.model == "my-org-model"


# ── Anthropic adapter against the real SDK (mock HTTP transport) ─────────────


def _anthropic(handler: Any) -> AnthropicProvider:
    # anthropic>=2 is built on httpx2 (not httpx); the transport must come from httpx2.
    sdk = AsyncAnthropic(
        api_key="test-key",
        max_retries=0,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
    )
    return AnthropicProvider(api_key="unused", client=sdk)


def _anthropic_message(text: str, stop_reason: str = "end_turn", **extra: Any) -> dict[str, Any]:
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {
            "input_tokens": 120,
            "output_tokens": 30,
            "cache_read_input_tokens": 100,
            "cache_creation_input_tokens": 0,
        },
        **extra,
    }


async def test_anthropic_structured_request_shape_and_parse() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return httpx2.Response(200, json=_anthropic_message(json.dumps({"summary": "ok", "score": 4})))

    result = await _anthropic(handler).generate_structured(ROUTE, REQUEST, Answer)
    assert result.parsed == Answer(summary="ok", score=4)
    assert result.usage.cache_read_input_tokens == 100
    body = captured["body"]
    assert body["model"] == "claude-opus-5-5"
    assert body["output_config"]["effort"] == "high"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["fallbacks"] == "default"
    assert FALLBACK_BETA in captured["headers"]["anthropic-beta"]
    assert all(block["cache_control"] == {"type": "ephemeral"} for block in body["system"])
    for forbidden in ("temperature", "top_p", "top_k", "thinking"):
        assert forbidden not in body
    assert body["messages"][-1]["role"] == "user"  # never an assistant prefill


async def test_anthropic_without_fallback_uses_stable_endpoint() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured["body"] = json.loads(request.content)
        captured["beta"] = request.headers.get("anthropic-beta")
        return httpx2.Response(200, json=_anthropic_message(json.dumps({"summary": "ok", "score": 1})))

    route = LlmRoute(**{**ROUTE.__dict__, "refusal_fallback": False})
    await _anthropic(handler).generate_structured(route, REQUEST, Answer)
    assert "fallbacks" not in captured["body"]
    assert captured["beta"] is None


async def test_anthropic_refusal_detected_before_content() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            json=_anthropic_message(
                "",
                stop_reason="refusal",
                stop_details={"type": "refusal", "category": "cyber", "explanation": "x"},
            ),
        )

    with pytest.raises(ProviderRefusal) as err:
        await _anthropic(handler).generate_structured(ROUTE, REQUEST, Answer)
    assert err.value.category == "cyber"


@pytest.mark.parametrize(
    ("status", "expected"),
    [(429, ProviderUnavailable), (529, ProviderUnavailable), (500, ProviderUnavailable)],
)
async def test_anthropic_transient_errors(status: int, expected: type[Exception]) -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(status, json={"type": "error", "error": {"type": "x", "message": "m"}})

    with pytest.raises(expected):
        await _anthropic(handler).generate_structured(ROUTE, REQUEST, Answer)


async def test_anthropic_auth_error_is_misconfiguration() -> None:
    from cfp_ai.llm.types import ProviderMisconfigured

    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            401, json={"type": "error", "error": {"type": "authentication_error", "message": "m"}}
        )

    with pytest.raises(ProviderMisconfigured):
        await _anthropic(handler).generate_structured(ROUTE, REQUEST, Answer)


async def test_anthropic_stream_yields_deltas_then_final() -> None:
    events = [
        {
            "type": "message_start",
            "message": {
                **_anthropic_message(""),
                "content": [],
                "usage": {"input_tokens": 50, "output_tokens": 1},
            },
        },
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello "}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "there"}},
        {"type": "content_block_stop", "index": 0},
        {
            "type": "message_delta",
            "delta": {"stop_reason": "end_turn", "stop_sequence": None},
            "usage": {"output_tokens": 5},
        },
        {"type": "message_stop"},
    ]
    sse = "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)

    def handler(request: httpx2.Request) -> httpx2.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx2.Response(200, content=sse.encode(), headers={"content-type": "text/event-stream"})

    items = [item async for item in _anthropic(handler).stream_text(ROUTE, REQUEST)]
    deltas = [i.text for i in items if isinstance(i, LlmStreamDelta)]
    final = items[-1]
    assert deltas == ["Hello ", "there"]
    assert isinstance(final, LlmResult) and final.text == "Hello there" and final.stop == "end_turn"


# ── OpenAI adapter against the real SDK (mock HTTP transport) ────────────────


def _openai(handler: Any) -> OpenAIProvider:
    sdk = AsyncOpenAI(
        api_key="test-key",
        max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    return OpenAIProvider(api_key="unused", client=sdk)


OPENAI_ROUTE = LlmRoute(
    route_id="test.route",
    provider="openai",
    model="my-org-model",
    effort="high",
    max_tokens=800,
    timeout_s=10,
)


def _completion(content: str | None, finish: str = "stop", refusal: str | None = None) -> dict[str, Any]:
    return {
        "id": "c1",
        "object": "chat.completion",
        "created": 0,
        "model": "my-org-model",
        "choices": [
            {
                "index": 0,
                "finish_reason": finish,
                "message": {"role": "assistant", "content": content, "refusal": refusal},
            }
        ],
        "usage": {
            "prompt_tokens": 40,
            "completion_tokens": 10,
            "total_tokens": 50,
            "prompt_tokens_details": {"cached_tokens": 32},
        },
    }


async def test_openai_structured_request_shape_and_parse() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=_completion(json.dumps({"summary": "ok", "score": 2})))

    result = await _openai(handler).generate_structured(OPENAI_ROUTE, REQUEST, Answer)
    assert result.parsed == Answer(summary="ok", score=2)
    assert result.usage.cache_read_input_tokens == 32
    body = captured["body"]
    assert body["model"] == "my-org-model"
    assert body["max_completion_tokens"] == 800
    assert body["response_format"]["type"] == "json_schema"
    assert body["messages"][0] == {
        "role": "system",
        "content": "You are a test.\n\nTenant framework context.",
    }
    assert "reasoning_effort" not in body and "temperature" not in body


async def test_openai_refusal_and_length() -> None:
    with pytest.raises(ProviderRefusal):
        await _openai(
            lambda r: httpx.Response(200, json=_completion(None, refusal="I can't help"))
        ).generate_structured(OPENAI_ROUTE, REQUEST, Answer)
    with pytest.raises(ProviderOutputError):
        await _openai(
            lambda r: httpx.Response(200, json=_completion('{"summary": "tr', finish="length"))
        ).generate_structured(OPENAI_ROUTE, REQUEST, Answer)


async def test_openai_rate_limit_is_transient() -> None:
    with pytest.raises(ProviderUnavailable):
        await _openai(
            lambda r: httpx.Response(429, json={"error": {"message": "slow down"}})
        ).generate_structured(OPENAI_ROUTE, REQUEST, Answer)


# ── gateway ──────────────────────────────────────────────────────────────────


def _gateway(provider: Any, name: str = "fake") -> tuple[LlmGateway, Metrics]:
    route = LlmRoute(
        route_id="r",
        provider=name,
        model="claude-opus-5-5",
        effort="low",  # type: ignore[arg-type]
        max_tokens=100,
        timeout_s=5,
    )
    metrics = Metrics()
    table = RouteTable(
        routes={"r": route}, unusable={"u": "no model"}, prices_per_mtok={"claude-opus-5-5": (4.0, 20.0)}
    )
    return LlmGateway(routes=table, providers={name: provider}, metrics=metrics), metrics


def _req() -> LlmRequest:
    return LlmRequest(
        route_id="r",
        system_blocks=(),
        messages=(LlmMessage("user", "hi"),),
        metadata={"tenant_id": "org-gec"},
    )


async def test_gateway_success_records_tokens_and_cost() -> None:
    gateway, metrics = _gateway(FakeLlmProvider(queue=[{"summary": "s", "score": 1}]))
    result = await gateway.structured("r", _req(), Answer)
    assert result.parsed == Answer(summary="s", score=1)
    cost = metrics.registry.get_sample_value("ai_llm_cost_usd_total", {"tenant": "org-gec", "route": "r"})
    assert cost == pytest.approx((100 * 4 + 50 * 20) / 1_000_000)


@pytest.mark.parametrize(
    ("raised", "code"),
    [
        (ProviderRefusal("cyber"), "content_refused"),
        (ProviderUnavailable("x"), "ai_unavailable"),
        (ProviderOutputError("x"), "ai_output_invalid"),
    ],
)
async def test_gateway_maps_provider_errors(raised: Exception, code: str) -> None:
    gateway, _ = _gateway(FakeLlmProvider(queue=[raised]))
    with pytest.raises(AppError) as err:
        await gateway.structured("r", _req(), Answer)
    assert err.value.code == code


async def test_gateway_unknown_or_unusable_route() -> None:
    gateway, _ = _gateway(FakeLlmProvider())
    for route_id in ("missing", "u"):
        with pytest.raises(AppError) as err:
            await gateway.structured(route_id, _req(), Answer)
        assert err.value.code == "ai_unavailable"


async def test_gateway_provider_not_configured() -> None:
    route = LlmRoute(route_id="r", provider="anthropic", model="m", effort="low", max_tokens=1, timeout_s=1)
    gateway = LlmGateway(routes=RouteTable({"r": route}, {}, {}), providers={}, metrics=Metrics())
    assert not gateway.route_usable("r")
    with pytest.raises(AppError) as err:
        await gateway.structured("r", _req(), Answer)
    assert err.value.code == "ai_unavailable"


async def test_gateway_enforces_deadline() -> None:
    import time

    gateway, _ = _gateway(FakeLlmProvider(queue=[{"summary": "s", "score": 1}]))
    with pytest.raises(AppError) as err:
        await gateway.structured("r", _req(), Answer, deadline=time.monotonic() - 1)
    assert err.value.code == "deadline_exceeded"


async def test_gateway_timeout_maps_to_deadline_exceeded() -> None:
    import asyncio

    class Slow(FakeLlmProvider):
        async def generate_structured(self, route: Any, request: Any, output_model: Any) -> Any:
            await asyncio.sleep(1)

    route = LlmRoute(route_id="r", provider="fake", model="m", effort="low", max_tokens=1, timeout_s=0.01)
    gateway = LlmGateway(
        routes=RouteTable({"r": route}, {}, {}), providers={"fake": Slow()}, metrics=Metrics()
    )
    with pytest.raises(AppError) as err:
        await gateway.structured("r", _req(), Answer)
    assert err.value.code == "deadline_exceeded"


async def test_gateway_stream_passes_deltas_and_final() -> None:
    gateway, _ = _gateway(FakeLlmProvider(queue=["hello streaming world"]))
    items = [i async for i in gateway.stream("r", _req())]
    assert isinstance(items[-1], LlmResult) and items[-1].text == "hello streaming world"
    assert "".join(i.text for i in items if isinstance(i, LlmStreamDelta)).strip() == "hello streaming world"
