"""``system.diagnostics`` — foundation smoke-test capability (dev/test only, not public).

Exercises the full stack exactly as the specialised agents will:
authorise subject → shared context (backend as the principal) → deterministic gaps
→ LLM structured output → semantic validation with repair → provenance.

Output is a short, non-binding summary of a subject's largest capability gap.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from langgraph.runtime import Runtime
from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.agents.base import (
    AccessRule,
    AgentDeps,
    Capability,
    CapabilitySpec,
    GraphContext,
    RunContext,
)
from cfp_ai.agents.catalogue import HR_TENANT, MANAGER_OF, SELF
from cfp_ai.agents.graph import StandardWorkflow, WorkflowState, compile_workflow, repair_messages
from cfp_ai.agents.registry import authorize_subject
from cfp_ai.context.models import CapabilityContext, ContextRequest
from cfp_ai.context.render import render_context
from cfp_ai.llm.types import LlmMessage, LlmRequest
from cfp_ai.schemas.public import ContextGap, DraftValidationReport, SkillGap, ValidationIssue

PROMPT_VERSION = "system.diagnostics@v1"
ROUTE = "system.diagnostics"

SYSTEM_PROMPT = """You are a diagnostic component of a workplace capability platform.
You receive reference data about one employee (pseudonymised as "the employee"), their role's
skill requirements, and pre-computed skill gaps. Identify the single most important gap to focus on
and explain why in plain language for a manager or L&D professional.

Rules:
- focus_skill_id must be one of the skill IDs listed in <skill_gaps>, or null if there are no gaps.
- Do not invent skills, levels, courses or facts that are not in the reference data.
- Proficiency levels are practice-independent facts from the organisation; never claim to change them.
- Keep summary under 80 words and rationale under 120 words.
- If some context is listed as unavailable, say what could not be considered."""


class DiagnosticsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: str = Field(min_length=1, max_length=128)


class DiagnosticSummary(BaseModel):
    """What the LLM produces (structured output schema)."""

    summary: str = Field(max_length=800)
    focus_skill_id: str | None
    rationale: str = Field(max_length=1200)


class DiagnosticsProvenance(BaseModel):
    """Like the public AiProvenance, but for an internal (non-public) capability."""

    capability: str
    model: str
    prompt_version: str
    generated_at: datetime
    context_as_of: datetime
    unavailable_context: list[ContextGap]


class DiagnosticsResult(BaseModel):
    employee_id: str
    summary: str
    focus_skill_id: str | None
    rationale: str
    skill_gaps: list[SkillGap]
    validation: DraftValidationReport
    provenance: DiagnosticsProvenance


SPEC = CapabilitySpec(
    capability="system.diagnostics",
    agent="system",
    code="SYS1",
    mode="sync",
    entitlement=None,
    access=(SELF, MANAGER_OF, HR_TENANT, AccessRule(frozenset({"organisation_admin"}), "tenant")),
    optional_endpoints=("BE-010", "BE-020", "BE-022", "BE-023", "BE-030", "BE-042"),
    llm_routes=(ROUTE,),
    implemented=True,
    public=False,
    sync_deadline_s=30,
)


def validate_summary(output: DiagnosticSummary, context: CapabilityContext) -> list[ValidationIssue]:
    gap_ids = {g.skill_id for g in context.skill_gaps}
    if output.focus_skill_id is None:
        if gap_ids:
            return [
                ValidationIssue(
                    code="missing_focus",
                    message="a focus skill is required when gaps exist",
                    path="focus_skill_id",
                )
            ]
        return []
    if output.focus_skill_id not in gap_ids:
        return [
            ValidationIssue(
                code="unknown_id",
                message=f"'{output.focus_skill_id}' is not one of the listed skill gaps",
                path="focus_skill_id",
            )
        ]
    return []


# ── nodes ────────────────────────────────────────────────────────────────────


async def _authorize(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
    ctx = runtime.context
    await authorize_subject(SPEC, ctx.run.principal, state["input"].employee_id, ctx.deps)
    return {}


async def _load_context(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
    ctx = runtime.context
    context = await ctx.deps.context.build(
        ctx.run.principal,
        ContextRequest(
            subject_employee_id=state["input"].employee_id,
            slices=frozenset(
                {"subject_profile", "role_profile", "framework", "capabilities", "learning_history"}
            ),
        ),
        deadline=ctx.run.deadline,
    )
    return {"context": context}


async def _generate(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
    ctx = runtime.context
    context: CapabilityContext = state["context"]
    messages = [
        LlmMessage(
            role="user", content=render_context(context) + "\n\nIdentify the focus gap and explain it."
        )
    ]
    messages.extend(repair_messages(state))
    result = await ctx.deps.gateway.structured(
        ROUTE,
        LlmRequest(
            route_id=ROUTE,
            system_blocks=(SYSTEM_PROMPT,),
            messages=tuple(messages),
            metadata={"tenant_id": ctx.run.principal.tenant_id, "capability": SPEC.capability},
        ),
        DiagnosticSummary,
        deadline=ctx.run.deadline,
    )
    return {"candidate": result.parsed, "model": result.model, "usage": result.usage}


async def _validate(state: WorkflowState, runtime: Runtime[GraphContext]) -> dict[str, Any]:
    return {"issues": validate_summary(state["candidate"], state["context"])}


WORKFLOW = StandardWorkflow(
    name="system.diagnostics",
    authorize=_authorize,
    load_context=_load_context,
    generate=_generate,
    validate=_validate,
    max_repairs=2,
)


class DiagnosticsCapability(Capability[DiagnosticsRequest, DiagnosticsResult]):
    spec = SPEC
    _graph = compile_workflow(WORKFLOW)

    def __init__(self, deps: AgentDeps) -> None:
        super().__init__(deps)

    async def run(self, ctx: RunContext, payload: DiagnosticsRequest) -> DiagnosticsResult:
        state = await self._graph.ainvoke({"input": payload}, context=GraphContext(run=ctx, deps=self.deps))
        output: DiagnosticSummary = state["output"]
        context: CapabilityContext = state["context"]
        gaps: list[ContextGap] = list(context.gaps_in_context)
        return DiagnosticsResult(
            employee_id=payload.employee_id,
            summary=output.summary,
            focus_skill_id=output.focus_skill_id,
            rationale=output.rationale,
            skill_gaps=context.skill_gaps,
            validation=state["report"],
            provenance=DiagnosticsProvenance(
                capability=SPEC.capability,
                model=state.get("model", "unknown"),
                prompt_version=PROMPT_VERSION,
                generated_at=datetime.now(UTC),
                context_as_of=context.as_of,
                unavailable_context=gaps,
            ),
        )


def fake_responder(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    """Deterministic dev response for the fake provider: focus on the first listed gap."""
    text = request.messages[0].content
    focus = None
    if "<skill_gaps>" in text:
        first = text.split("<skill_gaps>\n", 1)[1].split("\n", 1)[0]
        if first.startswith("- "):
            focus = first[2:].split(" ", 1)[0]
    return {
        "summary": "Offline fake summary of the focus gap.",
        "focus_skill_id": focus,
        "rationale": "Generated by the fake provider for local development.",
    }
