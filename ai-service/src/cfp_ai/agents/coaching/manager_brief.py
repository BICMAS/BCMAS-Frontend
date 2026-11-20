"""C6 ``coaching.manager_brief`` — Coaching Agent.

Preparation notes for a line manager's coaching conversation with a direct
report. Advisory only: nothing is written anywhere. Scenario suggestions are
empty until the scenario library exists (Coaching Agent phase).
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from pydantic import BaseModel, Field

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.common import extract_input_json, input_json_block, level_label, provenance
from cfp_ai.agents.steps import StepInput, StepOutput
from cfp_ai.context.models import CapabilityContext
from cfp_ai.context.render import render_context
from cfp_ai.errors import AppError
from cfp_ai.llm.types import LlmMessage, LlmRequest
from cfp_ai.schemas.public import ManagerCoachingBrief, SkillTarget, ValidationIssue
from cfp_ai.validation.structured import generate_validated

SPEC = replace(declared("coaching.manager_brief"), implemented=True)
ROUTE = "coaching.manager_brief"
PROMPT_VERSION = "coaching.manager_brief@v1"
DISCLAIMER = "AI-generated preparation notes. They do not change verified capability levels."

SYSTEM_PROMPT = """You help a line manager prepare a supportive coaching conversation with a direct report.
You receive pseudonymised data about the report, their role requirements, verified levels and
pre-computed skill gaps.

Return:
- focus_skill_ids: 1-3 skill IDs chosen ONLY from <input_json>.allowed_focus_skill_ids, most important first;
- talking_points: 3-6 concrete, encouraging points for the manager (max 40 words each);
- questions_to_ask: 3-6 open questions that invite the report to reflect (max 30 words each).
Ground everything in the provided data. Do not speculate about personal circumstances or performance
beyond the data, and never state or imply a change to verified levels."""


class BriefDraft(BaseModel):
    focus_skill_ids: list[str] = Field(min_length=1, max_length=3)
    talking_points: list[str] = Field(min_length=1, max_length=6)
    questions_to_ask: list[str] = Field(min_length=1, max_length=6)


class ManagerBriefCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = ManagerCoachingBrief
    context_slices = frozenset({"subject_profile", "role_profile", "framework", "capabilities"})
    required_slices = frozenset({"subject_profile", "capabilities"})

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        if context is None or step.subject_employee_id is None:
            raise AppError("precondition_failed", "Employee context is not available.")
        requirements = (
            {r.skill_id: r for r in context.role_profile.requirements} if context.role_profile else {}
        )
        allowed = [g.skill_id for g in context.skill_gaps] or sorted(requirements)
        if not allowed:
            raise AppError("precondition_failed", "The employee has no role requirements to coach against.")
        facts = {"allowed_focus_skill_ids": allowed, "requested_focus": step.message or ""}

        def check(output: BriefDraft) -> list[ValidationIssue]:
            return [
                ValidationIssue(
                    code="unknown_id",
                    message=f"'{sid}' is not an allowed focus skill",
                    path=f"focus_skill_ids[{i}]",
                )
                for i, sid in enumerate(output.focus_skill_ids)
                if sid not in allowed
            ]

        request = LlmRequest(
            route_id=ROUTE,
            system_blocks=(SYSTEM_PROMPT,),
            messages=(LlmMessage("user", render_context(context) + "\n\n" + input_json_block(facts)),),
            metadata={"tenant_id": ctx.principal.tenant_id, "capability": SPEC.capability},
        )
        result = await generate_validated(
            self.deps.gateway,
            ROUTE,
            request,
            BriefDraft,
            [check],
            metrics=self.deps.metrics,
            deadline=ctx.deadline,
        )
        gaps = {g.skill_id: g for g in context.skill_gaps}
        focus: list[SkillTarget] = []
        for sid in dict.fromkeys(result.output.focus_skill_ids):
            target = gaps[sid].required_level if sid in gaps else requirements[sid].required_level
            name = (
                gaps[sid].skill_name
                if sid in gaps
                else (context.skills[sid].name if sid in context.skills else sid)
            )
            focus.append(
                SkillTarget(
                    skill_id=sid,
                    skill_name=name,
                    target_level=target,
                    level_label=level_label(context, target),
                )
            )
        brief = ManagerCoachingBrief(
            employee_id=step.subject_employee_id,
            focus_skills=focus,
            talking_points=result.output.talking_points,
            questions_to_ask=result.output.questions_to_ask,
            suggested_scenarios=[],
            provenance=provenance(
                SPEC.capability, model=result.model, prompt_version=PROMPT_VERSION, context=context
            ),
            disclaimer=DISCLAIMER,
        )
        return StepOutput(
            summary="Coaching brief focusing on " + ", ".join(f.skill_name for f in focus) + ".",
            output_type="ManagerCoachingBrief",
            data=brief.model_dump(mode="json"),
        )


def fake_responder(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    allowed = extract_input_json(request).get("allowed_focus_skill_ids", [])
    return {
        "focus_skill_ids": allowed[:2],
        "talking_points": ["Recognise recent progress.", "Agree one practice opportunity this month."],
        "questions_to_ask": ["Where do you feel most stretched?", "What support would help most?"],
    }
