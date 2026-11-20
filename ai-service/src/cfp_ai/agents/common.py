"""Helpers shared by agent capabilities."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any

from cfp_ai.context.models import CapabilityContext
from cfp_ai.llm.types import LlmRequest
from cfp_ai.schemas.public import AiProvenance, Citation, ContextGap

_INPUT_OPEN = "<input_json>"
_INPUT_CLOSE = "</input_json>"

# Talent outputs must never contain decision language (AI_TECHNICAL_SPEC.md §14.7).
DECISION_LANGUAGE = re.compile(
    r"\b(near[- ]ready|not[- ]ready|ready for promotion|ready to promote|do not hire|should (?:be )?hired?|"
    r"recommend (?:hiring|promotion)|promote (?:him|her|them)|readiness band)\b",
    re.IGNORECASE,
)


def input_json_block(facts: dict[str, Any]) -> str:
    """Machine-readable facts for the model, with sorted keys (prompt-cache stable)."""
    return f"{_INPUT_OPEN}\n{json.dumps(facts, sort_keys=True, ensure_ascii=False)}\n{_INPUT_CLOSE}"


def extract_input_json(request: LlmRequest) -> dict[str, Any]:
    """Used by offline fake responders to read the facts a prompt was given."""
    for message in request.messages:
        if _INPUT_OPEN in message.content:
            raw = message.content.split(_INPUT_OPEN, 1)[1].split(_INPUT_CLOSE, 1)[0]
            parsed: dict[str, Any] = json.loads(raw)
            return parsed
    return {}


def provenance(
    capability: str,
    *,
    model: str,
    prompt_version: str,
    context: CapabilityContext | None,
    citations: list[Citation] | None = None,
    extra_gaps: list[ContextGap] | None = None,
) -> AiProvenance:
    return AiProvenance.model_validate(
        {
            "capability": capability,
            "model": model,
            "prompt_version": prompt_version,
            "generated_at": datetime.now(UTC),
            "context_as_of": context.as_of if context else None,
            "citations": citations or [],
            "unavailable_context": [*(context.gaps_in_context if context else []), *(extra_gaps or [])],
        }
    )


def level_label(context: CapabilityContext | None, level: int) -> str | None:
    if context is None:
        return None
    for lvl in context.framework_levels:
        if lvl.level == level:
            return lvl.label
    return None
