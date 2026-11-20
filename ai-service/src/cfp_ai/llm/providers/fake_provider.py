"""Deterministic scripted provider — DEV/TEST ONLY.

Responses come from (in order):
  1. the FIFO ``queue`` — items may be a BaseModel/dict (structured), str (text)
     or an Exception (raised);
  2. a per-route ``responder`` callable registered by capabilities for offline dev.
Every call is recorded in ``calls`` for assertions.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass, field
from typing import Any, TypeVar

from pydantic import BaseModel

from cfp_ai.llm.types import (
    LlmRequest,
    LlmResult,
    LlmRoute,
    LlmStreamDelta,
    ProviderOutputError,
    Usage,
)

T = TypeVar("T", bound=BaseModel)
Responder = Callable[[LlmRequest, type[BaseModel] | None], Any]


@dataclass
class FakeCall:
    route_id: str
    model: str
    request: LlmRequest
    output_model: type[BaseModel] | None


@dataclass
class FakeLlmProvider:
    name: str = "fake"
    queue: list[Any] = field(default_factory=list)
    responders: dict[str, Responder] = field(default_factory=dict)
    calls: list[FakeCall] = field(default_factory=list)

    async def aclose(self) -> None:
        return None

    def _next(self, route: LlmRoute, request: LlmRequest, output_model: type[BaseModel] | None) -> Any:
        self.calls.append(FakeCall(route.route_id, route.model, request, output_model))
        if self.queue:
            item = self.queue.pop(0)
        elif route.route_id in self.responders:
            item = self.responders[route.route_id](request, output_model)
        else:
            raise ProviderOutputError(f"fake provider has no response for route {route.route_id}")
        if isinstance(item, Exception):
            raise item
        return item

    async def generate_structured(
        self, route: LlmRoute, request: LlmRequest, output_model: type[T]
    ) -> LlmResult[T]:
        item = self._next(route, request, output_model)
        parsed = item if isinstance(item, output_model) else output_model.model_validate(item)
        return LlmResult(
            text=None,
            parsed=parsed,
            stop="end_turn",
            model=route.model,
            usage=Usage(input_tokens=100, output_tokens=50),
            latency_ms=1,
        )

    async def stream_text(
        self, route: LlmRoute, request: LlmRequest
    ) -> AsyncIterator[LlmStreamDelta | LlmResult[BaseModel]]:
        text = str(self._next(route, request, None))
        for word in text.split(" "):
            yield LlmStreamDelta(text=word + " ")
        yield LlmResult(
            text=text,
            parsed=None,
            stop="end_turn",
            model=route.model,
            usage=Usage(input_tokens=100, output_tokens=len(text) // 4),
            latency_ms=1,
            ttft_ms=1,
        )
