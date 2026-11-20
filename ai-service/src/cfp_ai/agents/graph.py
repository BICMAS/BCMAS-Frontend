"""Standard capability workflow on LangGraph (AI_TECHNICAL_SPEC.md §2.3).

    authorize → load_context → guard_input → retrieve → generate → validate
        validate ──issues & attempts ≤ max_repairs──▶ generate   (repair loop)
        validate ──issues & exhausted & allow_partial──▶ guard_output (flagged)
        validate ──issues & exhausted──▶ fail (ai_output_invalid)
        validate ──ok──▶ guard_output → persist → emit → END

Nodes are plain async functions ``(state, runtime) -> partial state``. The
principal, token and dependencies travel in ``runtime.context`` (``GraphContext``),
which LangGraph does not checkpoint. Optional nodes may be omitted.
"""

from __future__ import annotations

import itertools
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, TypedDict, cast

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from cfp_ai.agents.base import GraphContext
from cfp_ai.errors import AppError
from cfp_ai.llm.types import LlmMessage, Usage
from cfp_ai.schemas.public import DraftValidationReport, ValidationIssue


class WorkflowState(TypedDict, total=False):
    input: Any
    context: Any
    retrieved: list[Any]
    candidate: Any  # last generated output
    issues: list[ValidationIssue]
    attempts: int
    repaired: bool
    model: str
    usage: Usage
    output: Any
    report: DraftValidationReport
    handoffs: list[Any]


Node = Callable[[WorkflowState, Runtime[GraphContext]], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class StandardWorkflow:
    name: str
    generate: Node
    validate: Node
    authorize: Node | None = None
    load_context: Node | None = None
    guard_input: Node | None = None
    retrieve: Node | None = None
    guard_output: Node | None = None
    persist: Node | None = None
    emit: Node | None = None
    max_repairs: int = 2
    allow_partial: bool = False


def repair_messages(state: WorkflowState) -> list[LlmMessage]:
    """Messages to append on a repair attempt: previous output + the issues found."""
    issues = state.get("issues") or []
    candidate = state.get("candidate")
    if not issues or candidate is None:
        return []
    listing = "\n".join(f"- [{i.code}] at {i.path}: {i.message}" for i in issues)
    return [
        LlmMessage(role="assistant", content=candidate.model_dump_json()),
        LlmMessage(
            role="user",
            content=(
                "Your previous output failed validation with these issues:\n"
                f"{listing}\nReturn a complete corrected output. Use only identifiers provided to you."
            ),
        ),
    ]


def compile_workflow(workflow: StandardWorkflow, *, checkpointer: Any | None = None) -> Any:
    graph: StateGraph[WorkflowState, GraphContext, WorkflowState, WorkflowState] = StateGraph(
        WorkflowState, context_schema=GraphContext
    )

    pre = [
        (n, f)
        for n, f in (
            ("authorize", workflow.authorize),
            ("load_context", workflow.load_context),
            ("guard_input", workflow.guard_input),
            ("retrieve", workflow.retrieve),
        )
        if f is not None
    ]
    post = [
        (n, f)
        for n, f in (
            ("guard_output", workflow.guard_output),
            ("persist", workflow.persist),
            ("emit", workflow.emit),
        )
        if f is not None
    ]

    async def generate(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
        update = await workflow.generate(state, runtime)
        usage = state.get("usage") or Usage()
        return {
            **update,
            "attempts": state.get("attempts", 0) + 1,
            "usage": usage + update.pop("usage", Usage()),
        }

    async def validate(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
        update = await workflow.validate(state, runtime)
        issues: list[ValidationIssue] = update.get("issues", [])
        repairing = bool(issues) and state.get("attempts", 0) <= workflow.max_repairs
        metrics = runtime.context.deps.metrics
        if repairing:
            metrics.validation_repairs.labels(workflow.name).inc()
        elif issues:
            metrics.output_invalid.labels(workflow.name).inc()
        return {"issues": issues, "repaired": state.get("repaired", False) or repairing}

    async def finalize(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
        issues = state.get("issues") or []
        return {
            "output": state["candidate"],
            "report": DraftValidationReport(
                passed=not issues, repaired=state.get("repaired", False), issues=issues
            ),
        }

    async def fail(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
        codes = [i.code for i in state.get("issues") or []]
        raise AppError("ai_output_invalid", internal_detail=f"{workflow.name}: {codes}")

    for name, fn in pre:
        graph.add_node(name, cast(Any, fn))
    graph.add_node("generate", cast(Any, generate))
    graph.add_node("validate", cast(Any, validate))
    graph.add_node("finalize", cast(Any, finalize))
    graph.add_node("fail", cast(Any, fail))
    for name, fn in post:
        graph.add_node(name, cast(Any, fn))

    chain = [n for n, _ in pre] + ["generate", "validate"]
    previous = START
    for name in chain:
        graph.add_edge(previous, name)
        previous = name

    def after_validate(state: WorkflowState) -> str:
        if not state.get("issues"):
            return "finalize"
        if state.get("attempts", 0) <= workflow.max_repairs:
            return "generate"
        return "finalize" if workflow.allow_partial else "fail"

    graph.add_conditional_edges("validate", after_validate, ["generate", "finalize", "fail"])
    tail = ["finalize"] + [n for n, _ in post]
    for a, b in itertools.pairwise(tail):
        graph.add_edge(a, b)
    graph.add_edge(tail[-1], END)
    graph.add_edge("fail", END)
    return graph.compile(checkpointer=checkpointer, name=workflow.name)
