"""Backend read tools (AI_TECHNICAL_SPEC.md §9.2). All endpoints are PROPOSED.

Arguments never include tenant or principal fields — those come from RunContext,
so a model cannot widen its own access.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.agents.base import RunContext
from cfp_ai.integrations.backend.client import BackendClient
from cfp_ai.integrations.backend.dto import (
    CapabilityLevelDTO,
    CatalogueItemDTO,
    EmployeeDTO,
    RoleProfileDTO,
    SkillDTO,
)
from cfp_ai.tools.registry import ToolRegistry, ToolSpec


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmployeeArgs(_Args):
    employee_id: str = Field(min_length=1, max_length=128)


class SkillArgs(_Args):
    skill_id: str = Field(min_length=1, max_length=128)


class RoleArgs(_Args):
    role_id: str = Field(min_length=1, max_length=128)


class CatalogueArgs(_Args):
    item_id: str = Field(min_length=1, max_length=128)


class CapabilityLevels(BaseModel):
    items: list[CapabilityLevelDTO]


def register_backend_tools(registry: ToolRegistry, backend: BackendClient) -> None:
    async def get_subject_profile(ctx: RunContext, args: EmployeeArgs) -> EmployeeDTO:
        return await backend.get_employee(ctx.principal, args.employee_id)

    async def get_capability_levels(ctx: RunContext, args: EmployeeArgs) -> CapabilityLevels:
        return CapabilityLevels(items=await backend.get_capabilities(ctx.principal, args.employee_id))

    async def get_role_requirements(ctx: RunContext, args: RoleArgs) -> RoleProfileDTO:
        return await backend.get_role_profile(ctx.principal, args.role_id)

    async def get_skill_levels(ctx: RunContext, args: SkillArgs) -> SkillDTO:
        return await backend.get_skill(ctx.principal, args.skill_id)

    async def get_catalogue_item(ctx: RunContext, args: CatalogueArgs) -> CatalogueItemDTO:
        return await backend.get_catalogue_item(ctx.principal, args.item_id)

    specs = [
        (
            ToolSpec(
                "get_subject_profile",
                "Get an employee's job title, department and current role. Use when you need the "
                "employee's role context.",
                "backend_read",
                EmployeeArgs,
                EmployeeDTO,
                ("BE-010",),
                frozenset(
                    {
                        "coaching.conversation_turn",
                        "coaching.manager_brief",
                        "dev_plan.draft_plan",
                        "dev_plan.manager_recommendations",
                        "system.diagnostics",
                    }
                ),
            ),
            get_subject_profile,
        ),
        (
            ToolSpec(
                "get_capability_levels",
                "Get an employee's verified and self-assessed proficiency level for each skill.",
                "backend_read",
                EmployeeArgs,
                CapabilityLevels,
                ("BE-030",),
                frozenset(
                    {
                        "coaching.recommend_scenarios",
                        "coaching.conversation_turn",
                        "coaching.manager_brief",
                        "dev_plan.draft_plan",
                        "dev_plan.explain_gaps",
                        "dev_plan.recommend_learning",
                        "dev_plan.review_plan",
                        "dev_plan.draft_cohort_pathway",
                        "dev_plan.manager_recommendations",
                        "system.diagnostics",
                    }
                ),
            ),
            get_capability_levels,
        ),
        (
            ToolSpec(
                "get_role_requirements",
                "Get the skills and required proficiency levels for a role.",
                "backend_read",
                RoleArgs,
                RoleProfileDTO,
                ("BE-023",),
                frozenset(
                    {
                        "coaching.recommend_scenarios",
                        "coaching.conversation_turn",
                        "dev_plan.draft_plan",
                        "dev_plan.explain_gaps",
                        "talent.draft_items",
                        "system.diagnostics",
                    }
                ),
            ),
            get_role_requirements,
        ),
        (
            ToolSpec(
                "get_skill_levels",
                "Get a skill's definition and the observable behavioural indicators at each level.",
                "backend_read",
                SkillArgs,
                SkillDTO,
                ("BE-022",),
                frozenset(
                    {
                        "coaching.evaluate_session",
                        "coaching.draft_scenario",
                        "dev_plan.draft_plan",
                        "dev_plan.explain_gaps",
                        "talent.draft_items",
                        "talent.recommend_scores",
                        "talent.draft_report",
                        "talent.analyze_evidence",
                        "system.diagnostics",
                    }
                ),
            ),
            get_skill_levels,
        ),
        (
            ToolSpec(
                "get_catalogue_item",
                "Get one learning catalogue item by id, to confirm it exists and is active.",
                "backend_read",
                CatalogueArgs,
                CatalogueItemDTO,
                ("BE-041",),
                frozenset(
                    {
                        "coaching.evaluate_session",
                        "dev_plan.draft_plan",
                        "dev_plan.recommend_learning",
                        "dev_plan.review_plan",
                        "dev_plan.draft_cohort_pathway",
                        "system.diagnostics",
                    }
                ),
            ),
            get_catalogue_item,
        ),
    ]
    for spec, fn in specs:
        registry.register(spec, fn)  # type: ignore[arg-type]
