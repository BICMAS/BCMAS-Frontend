"""LLM route table loader (``cfp_ai/config/llm_routes.yaml``).

Each route may say ``provider: default`` / ``model: default``; these resolve to
``CFP_AI_LLM_DEFAULT_PROVIDER`` and that provider's default model. Routes on a
provider without a configured model (OpenAI has no default by design) are
reported as unusable rather than guessed.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import yaml

from cfp_ai.llm.types import Effort, LlmRoute, ProviderName
from cfp_ai.settings import LlmProviderName, Settings

_EFFORTS: frozenset[str] = frozenset({"low", "medium", "high", "xhigh", "max"})


@dataclass(frozen=True)
class RouteTable:
    routes: dict[str, LlmRoute]
    unusable: dict[str, str]  # route_id → reason
    prices_per_mtok: dict[str, tuple[float, float]]  # model → (input, output) USD

    def get(self, route_id: str) -> LlmRoute | None:
        return self.routes.get(route_id)


def _default_model(provider: str, settings: Settings) -> str | None:
    if provider == LlmProviderName.ANTHROPIC:
        return settings.anthropic_default_model
    if provider == LlmProviderName.OPENAI:
        return settings.openai_default_model
    return "fake-model"


def load_routes(path: Path, settings: Settings) -> RouteTable:
    raw: dict[str, Any] = yaml.safe_load(path.read_text(encoding="utf-8"))
    defaults: dict[str, Any] = raw.get("defaults", {})
    routes: dict[str, LlmRoute] = {}
    unusable: dict[str, str] = {}
    for route_id, spec in raw["routes"].items():
        merged = {**defaults, **(spec or {})}
        provider = str(merged.get("provider", "default"))
        if provider == "default":
            provider = settings.llm_default_provider.value
        model = str(merged.get("model", "default"))
        if model == "default":
            resolved = _default_model(provider, settings)
            if resolved is None:
                unusable[route_id] = f"no default model configured for provider {provider}"
                continue
            model = resolved
        effort = str(merged.get("effort", "medium"))
        if effort not in _EFFORTS:
            raise ValueError(f"route {route_id}: invalid effort {effort}")
        routes[route_id] = LlmRoute(
            route_id=route_id,
            provider=cast(ProviderName, provider),
            model=model,
            effort=cast(Effort, effort),
            max_tokens=int(merged.get("max_tokens", 4000)),
            timeout_s=float(merged.get("timeout_s", 60)),
            stream=bool(merged.get("stream", False)),
            refusal_fallback=bool(merged.get("refusal_fallback", settings.anthropic_refusal_fallback)),
            cache_system_prompt=bool(merged.get("cache_system_prompt", True)),
            inference_geo=merged.get("inference_geo"),
            openai_reasoning_effort=merged.get("openai_reasoning_effort"),
        )
    prices = {
        model: (float(p["input"]), float(p["output"]))
        for model, p in (raw.get("prices_per_mtok") or {}).items()
    }
    return RouteTable(routes=routes, unusable=unusable, prices_per_mtok=prices)
