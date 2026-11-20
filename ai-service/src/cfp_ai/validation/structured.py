"""Structured output validation with bounded repair (AI_TECHNICAL_SPEC.md §2.3).

Schema validity is enforced by the provider (structured outputs) and Pydantic.
On top of that, *semantic* validators check things only the application knows —
referenced IDs exist, levels are on the scale, quotes appear in the source.
Failures trigger at most ``max_repairs`` re-prompts listing the issues; after
that the caller gets ``ai_output_invalid`` or, if ``allow_partial``, the last
output with ``report.passed = False``.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Iterable, Sequence
from dataclasses import dataclass
from typing import Generic, TypeVar

from pydantic import BaseModel

from cfp_ai.errors import AppError
from cfp_ai.llm.gateway import LlmGateway
from cfp_ai.llm.types import LlmMessage, LlmRequest, Usage
from cfp_ai.observability.metrics import Metrics
from cfp_ai.schemas.public import DraftValidationReport, ValidationIssue

T = TypeVar("T", bound=BaseModel)
Validator = Callable[[T], list[ValidationIssue]]


@dataclass(frozen=True)
class ValidatedOutput(Generic[T]):
    output: T
    report: DraftValidationReport
    attempts: int
    usage: Usage
    model: str


def run_validators(output: T, validators: Iterable[Validator[T]]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for validator in validators:
        issues.extend(validator(output))
    return issues


def _repair_message(issues: Sequence[ValidationIssue]) -> str:
    lines = "\n".join(f"- [{i.code}] at {i.path}: {i.message}" for i in issues)
    return (
        "Your previous output failed validation with these issues:\n"
        f"{lines}\n"
        "Return a complete corrected output that fixes every issue. Use only identifiers "
        "that were provided to you."
    )


async def generate_validated(
    gateway: LlmGateway,
    route_id: str,
    request: LlmRequest,
    output_model: type[T],
    validators: Sequence[Validator[T]] = (),
    *,
    metrics: Metrics | None = None,
    max_repairs: int = 2,
    allow_partial: bool = False,
    deadline: float | None = None,
) -> ValidatedOutput[T]:
    messages = list(request.messages)
    usage = Usage()
    attempts = 0
    repaired = False
    while True:
        attempts += 1
        result = await gateway.structured(
            route_id,
            LlmRequest(
                route_id=route_id,
                system_blocks=request.system_blocks,
                messages=tuple(messages),
                metadata=request.metadata,
            ),
            output_model,
            deadline=deadline,
        )
        usage = usage + result.usage
        assert result.parsed is not None  # gateway guarantees parsed output for structured()
        issues = run_validators(result.parsed, validators)
        if not issues:
            return ValidatedOutput(
                result.parsed,
                DraftValidationReport(passed=True, repaired=repaired, issues=[]),
                attempts,
                usage,
                result.model,
            )
        if attempts > max_repairs:
            if metrics:
                metrics.output_invalid.labels(output_model.__name__).inc()
            if allow_partial:
                return ValidatedOutput(
                    result.parsed,
                    DraftValidationReport(passed=False, repaired=repaired, issues=issues),
                    attempts,
                    usage,
                    result.model,
                )
            raise AppError(
                "ai_output_invalid", internal_detail=f"{output_model.__name__}: {[i.code for i in issues]}"
            )
        if metrics:
            metrics.validation_repairs.labels(output_model.__name__).inc()
        repaired = True
        messages.append(LlmMessage(role="assistant", content=result.parsed.model_dump_json()))
        messages.append(LlmMessage(role="user", content=_repair_message(issues)))


# ── Reusable semantic validators ─────────────────────────────────────────────


def ids_exist(
    getter: Callable[[T], Iterable[tuple[str, str | None]]],
    allowed: Collection[str],
    *,
    code: str = "unknown_id",
) -> Validator[T]:
    """``getter`` yields (json_path, id) pairs; ``None`` ids are skipped."""

    def check(output: T) -> list[ValidationIssue]:
        return [
            ValidationIssue(code=code, message=f"'{value}' is not a known identifier", path=path)
            for path, value in getter(output)
            if value is not None and value not in allowed
        ]

    return check


def levels_in_scale(
    getter: Callable[[T], Iterable[tuple[str, int | None]]], scale: Collection[int]
) -> Validator[T]:
    def check(output: T) -> list[ValidationIssue]:
        return [
            ValidationIssue(
                code="level_out_of_scale", message=f"level {value} is not on the scale", path=path
            )
            for path, value in getter(output)
            if value is not None and value not in scale
        ]

    return check


def quotes_in_source(
    getter: Callable[[T], Iterable[tuple[str, str]]], source_text: Callable[[str], str | None]
) -> Validator[T]:
    """``getter`` yields (source_id, quote); ``source_text`` returns the source's full text."""

    def check(output: T) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        for source_id, quote in getter(output):
            text = source_text(source_id)
            if text is None or quote.strip() not in text:
                issues.append(
                    ValidationIssue(
                        code="quote_not_in_source",
                        message="quote does not appear verbatim in its source",
                        path=source_id,
                    )
                )
        return issues

    return check
