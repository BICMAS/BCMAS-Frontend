"""D2 ``dev_plan.explain_gaps`` — Development Plan Agent.

Gaps and their priority are computed deterministically from backend data
(context builder). The model only explains *why each gap matters* and *why it has
that priority*, citing the tenant's own level indicators. Critical gaps produce a
``dev_plan.practice_needed`` handoff to the Coaching Agent.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from pydantic import BaseModel, Field

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.common import extract_input_json, input_json_block, provenance
from cfp_ai.agents.steps import HandoffRequest, StepInput, StepOutput
from cfp_ai.context.models import CapabilityContext
from cfp_ai.context.render import render_context
from cfp_ai.errors import AppError
from cfp_ai.llm.types import LlmMessage, LlmRequest
from cfp_ai.schemas.public import Citation, GapInsight, GapInsightsResponse, ValidationIssue
from cfp_ai.validation.structured import generate_validated

SPEC = replace(declared("dev_plan.explain_gaps"), implemented=True)
ROUTE = "dev_plan.explain_gaps"
PROMPT_VERSION = "dev_plan.explain_gaps@v1"

SYSTEM_PROMPT = """You explain capability gaps for a workplace development platform.
You receive pseudonymised reference data about one employee, their role's skill requirements,
the organisation's behavioural indicators per skill level, and gaps that were ALREADY computed
and prioritised by the platform. Do not recompute or change gaps, levels or priorities.

For every gap in <input_json>.gaps, write exactly one item:
- why_it_matters: why the skill at the required level matters for this role (max 80 words);
- priority_rationale: why the platform's priority is appropriate, citing the level difference (max 50 words);
- indicator_ids: up to 4 indicator IDs from <input_json>.indicators for THAT skill which describe the
  required level. Use only IDs that are listed.
Write for the employee and their manager: specific, respectful, no judgement of the person."""


class GapExplanation(BaseModel):
    skill_id: str
    why_it_matters: str = Field(max_length=700)
    priority_rationale: str = Field(max_length=500)
    indicator_ids: list[str] = Field(max_length=4)


class GapExplanations(BaseModel):
    items: list[GapExplanation]


def _validator(gap_ids: list[str], indicators: dict[str, set[str]]) -> Any:
    def check(output: GapExplanations) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        seen = [item.skill_id for item in output.items]
        for missing in sorted(set(gap_ids) - set(seen)):
            issues.append(ValidationIssue(code="missing_gap", message=f"no item for {missing}", path="items"))
        for index, item in enumerate(output.items):
            if item.skill_id not in gap_ids:
                issues.append(
                    ValidationIssue(
                        code="unknown_id",
                        message=f"'{item.skill_id}' is not a listed gap",
                        path=f"items[{index}].skill_id",
                    )
                )
            elif seen.count(item.skill_id) > 1:
                issues.append(
                    ValidationIssue(
                        code="duplicate",
                        message=f"{item.skill_id} appears twice",
                        path=f"items[{index}].skill_id",
                    )
                )
            for ind in item.indicator_ids:
                if ind not in indicators.get(item.skill_id, set()):
                    issues.append(
                        ValidationIssue(
                            code="unknown_indicator",
                            message=f"'{ind}' is not an indicator of {item.skill_id}",
                            path=f"items[{index}].indicator_ids",
                        )
                    )
        return issues

    return check


class ExplainGapsCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = GapInsightsResponse
    context_slices = frozenset({"subject_profile", "role_profile", "framework", "capabilities"})
    required_slices = frozenset({"role_profile", "capabilities"})

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        if context is None or context.role_profile is None or step.subject_employee_id is None:
            raise AppError("precondition_failed", "The employee's role requirements are not available.")
        role = context.role_profile
        gaps = context.skill_gaps
        model = "none"
        insights: list[GapInsight] = []
        all_citations: list[Citation] = []
        if gaps:
            indicator_text: dict[str, dict[str, tuple[int, str]]] = {}
            for gap in gaps:
                skill = context.skills.get(gap.skill_id)
                if skill is None:
                    continue
                indicator_text[gap.skill_id] = {
                    ind.id: (lvl.level, ind.text)
                    for lvl in skill.levels
                    if lvl.level <= gap.required_level
                    for ind in lvl.indicators
                }
            facts = {
                "gaps": [g.model_dump(mode="json") for g in gaps],
                "indicators": {
                    sid: [{"id": i, "level": lv, "text": t} for i, (lv, t) in sorted(items.items())]
                    for sid, items in indicator_text.items()
                },
                "role": {"role_id": role.role_id, "title": role.title, "version": role.version},
            }
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
                GapExplanations,
                [_validator([g.skill_id for g in gaps], {k: set(v) for k, v in indicator_text.items()})],
                metrics=self.deps.metrics,
                deadline=ctx.deadline,
            )
            model = result.model
            by_skill = {item.skill_id: item for item in result.output.items}
            for gap in gaps:
                item = by_skill[gap.skill_id]
                skill = context.skills.get(gap.skill_id)
                citations = [
                    Citation(
                        source_type="indicator",
                        source_id=ind,
                        source_version=skill.version if skill else None,
                        title=f"{gap.skill_name} — level {indicator_text[gap.skill_id][ind][0]}",
                        excerpt=indicator_text[gap.skill_id][ind][1],
                    )
                    for ind in item.indicator_ids
                ]
                all_citations.extend(citations)
                insights.append(
                    GapInsight(
                        **gap.model_dump(),
                        why_it_matters=item.why_it_matters,
                        priority_rationale=item.priority_rationale,
                        citations=citations,
                    )
                )
        response = GapInsightsResponse(
            employee_id=step.subject_employee_id,
            role_id=role.role_id,
            role_profile_version=role.version,
            gaps=insights,
            provenance=provenance(
                SPEC.capability,
                model=model,
                prompt_version=PROMPT_VERSION,
                context=context,
                citations=all_citations,
            ),
        )
        critical = [g for g in gaps if g.priority == "critical"]
        handoffs = []
        if critical:
            handoffs.append(
                HandoffRequest(
                    type="dev_plan.practice_needed",
                    target_capability="coaching.recommend_scenarios",
                    subject_employee_id=step.subject_employee_id,
                    title="Practise critical skills",
                    detail="Coaching practice for: " + ", ".join(g.skill_name for g in critical),
                    payload={
                        "skill_ids": [g.skill_id for g in critical],
                        "target_levels": {g.skill_id: g.required_level for g in critical},
                    },
                )
            )
        summary = (
            f"{len(gaps)} skill gap(s) against {role.title}, {len(critical)} critical."
            if gaps
            else f"No skill gaps against {role.title}."
        )
        return StepOutput(
            summary=summary,
            output_type="GapInsightsResponse",
            data=response.model_dump(mode="json"),
            handoffs=handoffs,
        )


def fake_responder(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    items = []
    for gap in facts.get("gaps", []):
        indicators = facts.get("indicators", {}).get(gap["skill_id"], [])
        items.append(
            {
                "skill_id": gap["skill_id"],
                "why_it_matters": f"{gap['skill_name']} at level {gap['required_level']} is required.",
                "priority_rationale": f"The gap is {gap['gap']} level(s), so it is {gap['priority']}.",
                "indicator_ids": [i["id"] for i in indicators if i["level"] == gap["required_level"]][:2],
            }
        )
    return {"items": items}
