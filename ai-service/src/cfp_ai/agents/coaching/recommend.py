"""C3 ``coaching.recommend_scenarios`` — deterministic, gap-driven scenario ranking.

No model call: scenarios are ranked by how much of the employee's (computed)
skill-gap they practise, with a small bonus for matching the required level and a
penalty for scenarios practised in the last 14 days. Orchestratable, so the
Development Plan Agent's ``dev_plan.practice_needed`` handoff now runs it.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.coaching.scenarios import ScenarioStore, public_view
from cfp_ai.agents.coaching.store import CoachingStore
from cfp_ai.agents.common import provenance
from cfp_ai.agents.steps import StepInput, StepOutput
from cfp_ai.context.models import CapabilityContext
from cfp_ai.errors import AppError
from cfp_ai.schemas.public import ScenarioRecommendation, ScenarioRecommendationsResponse

SPEC = replace(declared("coaching.recommend_scenarios"), implemented=True, llm_routes=())
PROMPT_VERSION = "coaching.recommend@v1-deterministic"
RECENT = timedelta(days=14)


def recommend(
    scenarios: ScenarioStore,
    store: CoachingStore,
    tenant_id: str,
    employee_id: str,
    context: CapabilityContext | None,
    *,
    skill_filter: list[str] | None = None,
    limit: int = 3,
) -> ScenarioRecommendationsResponse:
    gaps = {g.skill_id: g for g in (context.skill_gaps if context else [])}
    required = (
        {r.skill_id for r in context.role_profile.requirements} if context and context.role_profile else set()
    )
    cutoff = datetime.now(UTC) - RECENT
    recent = {s.scenario_id for s in store.sessions_for(tenant_id, employee_id) if s.started_at >= cutoff}
    ranked: list[tuple[int, str, ScenarioRecommendation]] = []
    for scenario in scenarios.list(tenant_id):
        targets = scenario.target_skills
        if skill_filter and not {t.skill_id for t in targets} & set(skill_filter):
            continue
        matched = [gaps[t.skill_id] for t in targets if t.skill_id in gaps]
        score = sum(g.gap for g in matched) * 10 + sum(1 for t in targets if t.skill_id in required)
        score += 3 * sum(
            1 for t in targets if t.skill_id in gaps and t.target_level == gaps[t.skill_id].required_level
        )
        if scenario.scenario_id in recent:
            score -= 15
        if score <= 0:
            continue
        if matched:
            top = max(matched, key=lambda g: g.gap)
            reason = (
                f"Practises {', '.join(g.skill_name for g in matched)}, where your verified level is below "
                f"the role requirement."
            )
            target_id, gap = top.skill_id, top.gap
        else:
            reason = f"Practises {', '.join(t.skill_name for t in targets)} from your role profile."
            target_id, gap = targets[0].skill_id, None
        ranked.append(
            (
                score,
                scenario.title,
                ScenarioRecommendation(
                    scenario=public_view(scenario), reason=reason, target_skill_id=target_id, gap=gap
                ),
            )
        )
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return ScenarioRecommendationsResponse(
        recommendations=[r for _, _, r in ranked[:limit]],
        provenance=provenance(SPEC.capability, model="none", prompt_version=PROMPT_VERSION, context=context),
    )


class RecommendScenariosCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = ScenarioRecommendationsResponse
    context_slices = frozenset({"role_profile", "framework", "capabilities"})

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        if (
            self.deps.scenarios is None
            or self.deps.coaching_store is None
            or step.subject_employee_id is None
        ):
            raise AppError("ai_unavailable", internal_detail="scenario library not configured")
        skill_filter = list((step.handoff_payload or {}).get("skill_ids") or []) or [
            s for s in step.args.get("skill_ids", "").split(",") if s
        ]
        response = recommend(
            self.deps.scenarios,
            self.deps.coaching_store,
            ctx.principal.tenant_id,
            step.subject_employee_id,
            context,
            skill_filter=skill_filter,
        )
        titles = ", ".join(r.scenario.title for r in response.recommendations)
        summary = f"Recommended practice: {titles}." if titles else "No matching practice scenarios yet."
        return StepOutput(
            summary=summary,
            output_type="ScenarioRecommendationsResponse",
            data=response.model_dump(mode="json"),
        )
