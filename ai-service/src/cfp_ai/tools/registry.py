"""Tool registry (AI_TECHNICAL_SPEC.md §9).

A tool is available to a capability only if:
  * the capability is in ``allowed_capabilities``; and
  * every backend endpoint the tool uses is callable in this environment.
Tools whose endpoints are unconfirmed simply do not exist for the model.

Invocation validates arguments (JSON-parsed, never string-matched), enforces the
timeout and result size, injects tenant/principal from ``RunContext`` (never from
model arguments), and returns errors as ``is_error`` results rather than raising.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from cfp_ai.agents.base import RunContext
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.observability.metrics import Metrics

log = logging.getLogger(__name__)

ToolKind = Literal["backend_read", "backend_write", "retrieval", "ai_internal"]
ToolFn = Callable[[RunContext, Any], Awaitable[BaseModel]]
_CHARS_PER_TOKEN = 4


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    kind: ToolKind
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    backend_endpoint_ids: tuple[str, ...]
    allowed_capabilities: frozenset[str]
    expose_to_llm: bool = True  # False for system-only tools (e.g. backend writes)
    timeout_s: float = 5.0
    max_result_tokens: int = 4000


@dataclass(frozen=True)
class ToolResult:
    tool: str
    content: str  # JSON, already truncated; untrusted data
    is_error: bool
    output: BaseModel | None = field(default=None, compare=False)


def _strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """JSON Schema with additionalProperties: false everywhere (strict tool use)."""
    schema = model.model_json_schema()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object":
                node.setdefault("additionalProperties", False)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(schema)
    return schema


class ToolRegistry:
    def __init__(self, *, endpoints: BackendEndpointRegistry, metrics: Metrics) -> None:
        self._endpoints = endpoints
        self._metrics = metrics
        self._tools: dict[str, tuple[ToolSpec, ToolFn]] = {}

    def register(self, spec: ToolSpec, fn: ToolFn) -> None:
        if spec.name in self._tools:
            raise ValueError(f"tool {spec.name} already registered")
        if spec.kind == "backend_write" and spec.expose_to_llm:
            raise ValueError(f"tool {spec.name}: backend writes must not be exposed to the LLM")
        unknown = [e for e in spec.backend_endpoint_ids if self._endpoints.entry(e) is None]
        if unknown:
            raise ValueError(f"tool {spec.name}: unknown backend endpoints {unknown}")
        self._tools[spec.name] = (spec, fn)

    def _available(self, spec: ToolSpec) -> bool:
        return all(self._endpoints.is_callable(e) for e in spec.backend_endpoint_ids)

    def tools_for(self, capability: str, *, llm_only: bool = True) -> list[ToolSpec]:
        return sorted(
            (
                spec
                for spec, _ in self._tools.values()
                if capability in spec.allowed_capabilities
                and self._available(spec)
                and (spec.expose_to_llm or not llm_only)
            ),
            key=lambda s: s.name,  # deterministic order keeps the prompt cache stable
        )

    def llm_definitions(self, capability: str) -> list[dict[str, Any]]:
        return [
            {
                "name": spec.name,
                "description": spec.description,
                "input_schema": _strict_schema(spec.input_model),
                "strict": True,
            }
            for spec in self.tools_for(capability)
        ]

    async def invoke(self, ctx: RunContext, name: str, raw_args: Mapping[str, Any] | str) -> ToolResult:
        entry = self._tools.get(name)
        if entry is None:
            return self._error(name, "unknown_tool", "No such tool.")
        spec, fn = entry
        if ctx.capability not in spec.allowed_capabilities:
            return self._error(name, "not_allowed", "This tool is not available here.")
        if not self._available(spec):
            return self._error(name, "unavailable", "This data source is not available yet.")
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            parsed = spec.input_model.model_validate(args)
        except (ValueError, ValidationError) as exc:
            return self._error(name, "invalid_arguments", f"Invalid arguments: {exc}"[:500])
        try:
            async with asyncio.timeout(min(spec.timeout_s, max(0.1, ctx.remaining_s()))):
                output = await fn(ctx, parsed)
        except TimeoutError:
            return self._error(name, "timeout", "The data source timed out.")
        except BackendError as exc:
            if exc.kind == "unauthorized":
                raise AppError("unauthenticated", internal_detail=str(exc)) from exc
            return self._error(name, exc.kind, "The data source returned an error or no access.")
        content = output.model_dump_json()
        max_chars = spec.max_result_tokens * _CHARS_PER_TOKEN
        if len(content) > max_chars:
            # Keep the result valid JSON for the model; mark it as partial.
            content = json.dumps({"truncated": True, "partial_json": content[:max_chars]})
        self._metrics.tool_calls.labels(name, "ok").inc()
        return ToolResult(tool=name, content=content, is_error=False, output=output)

    def _error(self, name: str, outcome: str, message: str) -> ToolResult:
        self._metrics.tool_calls.labels(name, outcome).inc()
        log.info("tool error", extra={"tool": name, "outcome": outcome})
        return ToolResult(tool=name, content=json.dumps({"error": message}), is_error=True)

    def names(self) -> Sequence[str]:
        return sorted(self._tools)
