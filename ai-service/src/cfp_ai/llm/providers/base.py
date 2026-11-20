"""Provider adapter interface."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol, TypeVar

from pydantic import BaseModel

from cfp_ai.llm.types import LlmRequest, LlmResult, LlmRoute, LlmStreamDelta

T = TypeVar("T", bound=BaseModel)


class LlmProvider(Protocol):
    """Implementations must:
    * raise ``ProviderRefusal`` when the model declines (check before reading content);
    * raise ``ProviderUnavailable`` for transient failures, ``ProviderMisconfigured``
      for permanent ones, ``ProviderOutputError`` when no structured output exists;
    * never log prompt or response bodies.
    """

    name: str

    async def generate_structured(
        self, route: LlmRoute, request: LlmRequest, output_model: type[T]
    ) -> LlmResult[T]: ...

    def stream_text(
        self, route: LlmRoute, request: LlmRequest
    ) -> AsyncIterator[LlmStreamDelta | LlmResult[BaseModel]]:
        """Yield text deltas, then exactly one final ``LlmResult`` (text populated)."""
        ...

    async def aclose(self) -> None: ...
