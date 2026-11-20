"""D1 ``dev_plan.draft_plan`` — Individual Development Plan generation (draft → human review).

Collaboration (through the orchestrator):
  * receives ``talent.assessment_reported`` handoffs (reviewer-confirmed scores) from the
    Talent Assessment Agent and uses them as evidence and to raise priority;
  * uses coaching practice results from the Coaching Agent as (non-verified) evidence;
  * emits ``dev_plan.practice_needed`` for critical goals → Coaching Agent (C3).

The plan is never an official record until reviewed: it is stored as a draft whose
acceptance yields a commit plan for the backend (BE-052, PROPOSED).
"""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
from typing import Any, Literal

from pydantic import BaseModel

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.common import provenance
from cfp_ai.agents.dev_plan import planning
from cfp_ai.agents.dev_plan.models import EmployeeRef, IndividualDevelopmentPlan
from cfp_ai.agents.steps import CommitInstruction, HandoffRequest, StepInput, StepOutput
from cfp_ai.auth.principal import Principal
from cfp_ai.context.models import CapabilityContext, ContextRequest
from cfp_ai.drafts.service import DraftEnvelope, DraftRecord, KindHandler
from cfp_ai.errors import AppError
from cfp_ai.schemas.public import ApprovalPolicy, ValidationIssue

SPEC = replace(
    declared("dev_plan.draft_plan"),
    implemented=True,
    optional_endpoints=("BE-022", "BE-024", "BE-031", "BE-040", "BE-042", "BE-050"),
)
DISCLAIMER = (
    "AI-generated draft development plan. It becomes an official development record only after review "
    "and approval, and it does not change verified capability levels."
)
_SLICES = frozenset(
    {"subject_profile", "role_profile", "framework", "capabilities", "learning_history", "development_plans"}
)


def parse_args(args: dict[str, str]) -> dict[str, Any]:
    """Orchestrator step args are strings; lists are comma-separated."""

    def as_int(name: str, default: int | None, low: int, high: int) -> int | None:
        if name not in args or args[name] == "":
            return default
        try:
            value = int(args[name])
        except ValueError as exc:
            raise AppError("invalid_request", f"{name} must be a number.") from exc
        if not low <= value <= high:
            raise AppError("invalid_request", f"{name} must be between {low} and {high}.")
        return value

    focus = [s for s in args.get("focus_skill_ids", "").split(",") if s]
    return {
        "role_id": args.get("role_id") or None,
        "focus_skill_ids": focus,
        "horizon_weeks": as_int("horizon_weeks", 12, 4, 52),
        "hours_per_week": as_int("hours_per_week", None, 1, 40),
    }


class DraftPlanCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = DraftEnvelope
    context_slices = _SLICES
    required_slices = frozenset({"role_profile", "capabilities"})

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        if self.deps.drafts is None or step.subject_employee_id is None:
            raise AppError("ai_unavailable", internal_detail="draft service not configured")
        options = parse_args(step.args)
        payload = step.handoff_payload or {}
        if payload:  # talent.assessment_reported: plan against the assessed role, for the skills below it
            options["role_id"] = options["role_id"] or payload.get("role_id")
            assessed = list(payload.get("development_skill_ids") or [])
            options["focus_skill_ids"] = options["focus_skill_ids"] or assessed
        elif step.args.get(
            "assessment_id"
        ):  # workflow: confirmed scores from the reviewed result, never from args
            payload = _reviewed_payload(
                self.deps, ctx.principal.tenant_id, step.args["assessment_id"], step.subject_employee_id
            )
            options["role_id"] = options["role_id"] or payload.get("role_id")
            options["focus_skill_ids"] = options["focus_skill_ids"] or payload["development_skill_ids"]
        subject = step.subject_employee_id
        if (
            options["role_id"] or context is None
        ):  # target role (progression) → context for that role, as the caller
            context = await self.deps.context.build(
                ctx.principal,
                ContextRequest(
                    subject_employee_id=subject,
                    role_id=options["role_id"],
                    slices=_SLICES,
                    required=frozenset({"role_profile", "capabilities"}),
                ),
                deadline=ctx.deadline,
            )
        assert context is not None and context.role_profile is not None
        scores = {k: int(v) for k, v in (payload.get("confirmed_scores") or {}).items()}
        goals = planning.select_goals(
            context,
            focus_skill_ids=options["focus_skill_ids"],
            assessment_scores=scores,
            max_goals=self.deps.dev_plan_max_goals,
        )
        evidence, completed = planning.evidence_from(
            context, scores, planning.coaching_evidence(self.deps, ctx.principal.tenant_id, subject)
        )
        inputs = planning.PlanningInputs(
            context=context,
            goals=goals,
            horizon_weeks=options["horizon_weeks"],
            hours_per_week=options["hours_per_week"],
            evidence=evidence,
            completed_items=completed,
        )
        await planning.gather_candidates(self.deps, ctx, inputs)
        employee = EmployeeRef(
            employee_id=subject,
            job_title=context.subject.job_title if context.subject else None,
            department=context.subject.department.name
            if context.subject and context.subject.department
            else None,
            current_role_id=context.subject.role_id if context.subject else None,
            plan_role_id=context.role_profile.role_id,
            plan_role_title=context.role_profile.title,
            role_profile_version=context.role_profile.version,
        )
        plan, model = await planning.generate_plan(self.deps, ctx, inputs, employee)
        vctx = planning.validation_context(inputs)
        vctx["fixed"] = {
            g.skill_id: {
                "current_level": g.current_level,
                "target_level": g.target_level,
                "gap": g.gap,
                "priority": g.priority,
            }
            for g in plan.goals
        }
        vctx["resources"] = {
            c.id: {
                "title": c.title,
                "kind": c.kind,
                "provider": c.provider,
                "duration_minutes": c.duration_minutes,
            }
            for g in inputs.goals
            for c in g.catalogue
        }
        envelope = self.deps.drafts.create(
            ctx.principal,
            kind="development_plan",
            capability=SPEC.capability,
            subject_employee_id=subject,
            payload=plan,
            provenance=provenance(
                SPEC.capability, model=model, prompt_version=planning.PROMPT_VERSION, context=context
            ),
            approval_policy=approval_policy(self.deps.dev_plan_approval_mode),
            disclaimer=DISCLAIMER,
            validation_context=vctx,
        )
        critical = [g for g in plan.goals if g.priority == "critical"]
        handoffs = (
            [
                HandoffRequest(
                    type="dev_plan.practice_needed",
                    target_capability="coaching.recommend_scenarios",
                    subject_employee_id=subject,
                    title="Practise the plan's critical competencies",
                    detail="Coaching practice for: " + ", ".join(g.skill_name for g in critical),
                    payload={
                        "skill_ids": [g.skill_id for g in critical],
                        "target_levels": {g.skill_id: g.target_level for g in critical},
                        "draft_id": envelope.draft.draft_id,
                    },
                )
            ]
            if critical
            else []
        )
        return StepOutput(
            summary=(
                f"Draft development plan with {len(plan.goals)} goal(s) over {plan.horizon_weeks} weeks; "
                "awaiting review."
            ),
            output_type="DraftEnvelope",
            data=envelope.model_dump(mode="json"),
            handoffs=handoffs,
        )


def _reviewed_payload(deps: Any, tenant_id: str, assessment_id: str, subject: str | None) -> dict[str, Any]:
    reviewed = deps.talent_results.reviewed(tenant_id, assessment_id) if deps.talent_results else None
    if reviewed is None or reviewed.subject_type != "employee" or reviewed.subject_id != subject:
        raise AppError("precondition_failed", "There is no assessor-reviewed assessment for this employee.")
    required = {s.rubric_row_id: s.required_level for s in reviewed.evaluation.recommendations}
    confirmed = {r.skill_id: r.final_score for r in reviewed.rows if r.final_score is not None}
    below = sorted(
        r.skill_id
        for r in reviewed.rows
        if r.final_score is not None and r.final_score < required[r.rubric_row_id]
    )
    return {
        "assessment_id": assessment_id,
        "role_id": reviewed.role_id,
        "confirmed_scores": confirmed,
        "development_skill_ids": below,
    }


def approval_policy(mode: Literal["role_approval", "user_accept"]) -> ApprovalPolicy:
    roles: list[Any] = (
        ["line_manager", "hr_ld_admin"]
        if mode == "role_approval"
        else ["employee", "line_manager", "hr_ld_admin"]
    )
    return ApprovalPolicy(
        mode=mode, approver_roles=roles, commit_target="backend", commit_endpoint_id="BE-052"
    )


# ── draft kind handler: validation of human edits + commit plan ──────────────


def validate_edit(model: BaseModel, vctx: dict[str, Any]) -> list[ValidationIssue]:
    assert isinstance(model, IndividualDevelopmentPlan)
    issues = planning.plan_rules(model.goals, vctx)
    fixed: dict[str, dict[str, Any]] = vctx.get("fixed", {})
    resources: dict[str, dict[str, Any]] = vctx.get("resources", {})
    for gi, goal in enumerate(model.goals):
        expected = fixed.get(goal.skill_id)
        if expected is not None:
            for name, value in expected.items():
                if getattr(goal, name) != value:
                    issues.append(
                        ValidationIssue(
                            code="fixed_field",
                            path=f"goals[{gi}].{name}",
                            message=f"{name} comes from verified data and cannot be edited",
                        )
                    )
        referenced = {a.catalogue_item_id for a in goal.interventions if a.type == "learning"}
        listed = {r.catalogue_item_id for r in goal.resources}
        if referenced != listed:
            issues.append(
                ValidationIssue(
                    code="resources_mismatch",
                    path=f"goals[{gi}].resources",
                    message="resources must match the goal's learning interventions",
                )
            )
        for r in goal.resources:
            known = resources.get(r.catalogue_item_id)
            if known is not None and r.title != known["title"]:
                issues.append(
                    ValidationIssue(
                        code="fixed_field",
                        path=f"goals[{gi}].resources",
                        message="resource details come from the catalogue",
                    )
                )
    return issues


def commit_plan(
    record: DraftRecord, model: BaseModel, principal: Principal, source: Literal["ai", "ai_edited"]
) -> list[CommitInstruction]:
    """BE-052 POST /development-plans body (BACKEND_HANDOVER.md §5.8), executed by the frontend."""
    assert isinstance(model, IndividualDevelopmentPlan)
    start = model.start_date

    def due(days: int) -> str:
        return (start + timedelta(days=days)).isoformat()

    body = {
        "employee_id": model.employee.employee_id,
        "owner_id": model.employee.employee_id,
        "role_id": model.employee.plan_role_id,
        "role_profile_version": model.employee.role_profile_version,
        "start_date": model.start_date.isoformat(),
        "end_date": model.end_date.isoformat(),
        "objectives": model.development_objectives,
        "goals": [
            {
                "skill_id": g.skill_id,
                "from_level": g.current_level or 0,
                "to_level": g.target_level,
                "priority": g.priority,
                "objective": g.objective,
                "due_date": due(g.end_week * 7),
                "expected_outcomes": g.expected_outcomes,
                "success_indicator_ids": [s.indicator_id for s in g.success_indicators],
                "milestones": [
                    {"title": m.title, "due_date": due(m.due_week * 7), "measure": m.measure}
                    for m in g.milestones
                ],
                "actions": [
                    {
                        "type": a.type,
                        "title": a.title,
                        "description": a.description,
                        "catalogue_item_id": a.catalogue_item_id,
                        "scenario_id": a.scenario_id,
                        "due_date": due(a.due_in_days),
                    }
                    for a in g.interventions
                ],
            }
            for g in model.goals
        ],
        "source": {
            "type": source,
            "draft_id": record.draft.draft_id,
            "model": record.draft.provenance.model,
            "prompt_version": record.draft.provenance.prompt_version,
        },
    }
    return [
        CommitInstruction(
            endpoint_id="BE-052",
            method="POST",
            path="/development-plans",
            body=body,
            endpoint_status="unknown",
        )
    ]


HANDLER = KindHandler(
    kind="development_plan",
    payload_model=IndividualDevelopmentPlan,
    validate=validate_edit,
    commit=commit_plan,
)
