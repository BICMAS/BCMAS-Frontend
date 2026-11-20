"""The three collaborative workflows (docs/ai/WORKFLOWS.md §2).

Every agent step runs through the orchestrator as the acting person (``StageContext.capability``),
so the agents' own authorisation, context, validation and governance apply unchanged. Human
checkpoints wait on the existing review mechanisms: the T3 assessor review (orchestrator
approval) and draft review (``/v1/drafts``). Nothing here writes official records.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ulid import ULID

from cfp_ai.agents.coaching.models import StartConversationRequest
from cfp_ai.agents.talent.models import METHOD_CATEGORIES
from cfp_ai.agents.talent.store import ScoringSetRef
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.schemas.public import ContextSlice, Suggestion
from cfp_ai.workflows.engine import (
    Finish,
    Skip,
    StageContext,
    StageDef,
    StageFailed,
    StageResult,
    Waiting,
    WorkflowDefinition,
)
from cfp_ai.workflows.models import StartWorkflowRequest

_SCOREABLE = frozenset({"submitted", "awaiting_review", "completed", "reviewed"})
_LEARNING: frozenset[ContextSlice] = frozenset({"learning_history"})
_PLANS: frozenset[ContextSlice] = frozenset({"development_plans"})
_ROLE: frozenset[ContextSlice] = frozenset({"role_profile", "framework"})
_GAP_REQUIRED: frozenset[ContextSlice] = frozenset({"role_profile", "capabilities"})
_PLAN_SLICES: frozenset[ContextSlice] = frozenset(
    {"subject_profile", "role_profile", "capabilities", "learning_history", "development_plans"}
)


# ── shared stage helpers ─────────────────────────────────────────────────────


async def _draft_plan(ctx: StageContext, args: dict[str, str]) -> StageResult:
    """D1 through the orchestrator. An open/accepted draft from this stage is reused (no duplicates)."""
    drafts = ctx.deps.drafts
    assert drafts is not None
    existing = ctx.stage.refs.get("draft_id")
    if existing and (record := drafts.record(ctx.record.tenant_id, existing)) is not None:
        if record.draft.status not in ("rejected", "expired"):
            ctx.data["plan_draft_id"] = existing
            return StageResult("Reusing the development plan draft already generated.", ctx.stage.output)
    execution = await ctx.capability("dev_plan.draft_plan", args)
    envelope = execution.steps[0].output or {}
    draft = envelope["draft"]
    goals = draft["payload"]["goals"]
    ctx.data["plan_draft_id"] = draft["draft_id"]
    ctx.data["plan_goals"] = [
        {"skill_id": g["skill_id"], "skill_name": g["skill_name"], "priority": g["priority"], "gap": g["gap"]}
        for g in goals
    ]
    return StageResult(
        f"Training Plan Agent drafted an IDP with {len(goals)} goal(s); approval makes it official.",
        {
            "draft_id": draft["draft_id"],
            "goals": ctx.data["plan_goals"],
            "approval_policy": draft["approval_policy"],
        },
        {"draft_id": draft["draft_id"]},
    )


async def _plan_approval(ctx: StageContext, regenerate_from: str) -> StageResult:
    """Human checkpoint: the line manager (or HR) reviews the plan draft. Rejection → regenerate on retry."""
    drafts = ctx.deps.drafts
    assert drafts is not None
    draft_id = ctx.data.get("plan_draft_id")
    if not draft_id or drafts.record(ctx.record.tenant_id, draft_id) is None:
        raise StageFailed("not_found", "The plan draft no longer exists.", retry_from=regenerate_from)
    envelope = await drafts.get(ctx.principal, draft_id)  # applies expiry and visibility
    status = envelope.draft.status
    if status == "open":
        raise Waiting("manager_or_hr", "Review and approve the development plan", "draft", draft_id)
    if status in ("rejected", "expired"):
        reason = envelope.draft.resolution.reason if envelope.draft.resolution else None
        raise StageFailed(
            "plan_rejected",
            f"The development plan was {status}" + (f": {reason}" if reason else "."),
            regenerate_from,
        )
    committed = envelope.draft.resolution.committed_ref if envelope.draft.resolution else None
    ctx.data["plan_status"] = status
    return StageResult(
        f"The development plan was {status} by a reviewer"
        + ("; it is committed to the HR system." if committed else "; the frontend commits it (BE-052)."),
        {"status": status, "commit_plan": [c.model_dump(mode="json") for c in envelope.commit_plan]},
    )


async def _coaching(
    ctx: StageContext, skill_ids: list[str], topic: str, *, conversation: bool
) -> StageResult:
    """Coaching Agent: practice recommendations (C3) and, optionally, a development coaching conversation."""
    execution = await ctx.capability("coaching.recommend_scenarios", {"skill_ids": ",".join(skill_ids)})
    recs = (execution.steps[0].output or {}).get("recommendations", [])
    scenarios = [{"scenario_id": r["scenario"]["scenario_id"], "title": r["scenario"]["title"]} for r in recs]
    output: dict[str, Any] = {"skill_ids": skill_ids, "scenarios": scenarios}
    refs: dict[str, str] = {}
    if conversation:
        coaching = ctx.service.coaching
        conversation_id = ctx.stage.refs.get("conversation_id")
        if conversation_id is None and coaching is not None:
            request = StartConversationRequest(
                mode="performance", topic=topic, focus_skill_ids=skill_ids[:3], use_memory=False
            )
            try:
                started = await coaching.start_conversation(ctx.principal, request)
            except AppError as exc:
                if exc.code != "invalid_request":
                    raise
                started = await coaching.start_conversation(  # skills outside the current role: no focus
                    ctx.principal, request.model_copy(update={"focus_skill_ids": []})
                )
            conversation_id = started.conversation_id
            ctx.stage.refs["conversation_id"] = conversation_id
        output["conversation_id"] = conversation_id
        if conversation_id:
            refs["conversation_id"] = conversation_id
    return StageResult(
        f"Coaching Agent: {len(scenarios)} practice scenario(s)"
        + (" and a development coaching conversation started." if output.get("conversation_id") else "."),
        output,
        refs,
    )


def _plan_skills(ctx: StageContext) -> list[str]:
    goals = ctx.data.get("plan_goals") or []
    ranked = [g["skill_id"] for g in goals if g["priority"] in ("critical", "high")] or [
        g["skill_id"] for g in goals
    ]
    return ranked or [g["skill_id"] for g in ctx.data.get("gaps", [])]


# ── Workflow A: capability assessment → development ──────────────────────────


def _validate_a(request: StartWorkflowRequest) -> dict[str, Any]:
    if not request.assessment_id:
        raise AppError("invalid_request", "assessment_id is required for this workflow.")
    return {"assessment_id": request.assessment_id}


async def _a_initiate(ctx: StageContext) -> StageResult:
    return StageResult(
        f"Capability assessment {ctx.record.inputs['assessment_id']} initiated for development.",
        {"assessment_id": ctx.record.inputs["assessment_id"]},
    )


async def _a_conduct(ctx: StageContext) -> StageResult:
    """Talent Assessment Agent: the assessment (and its instrument) is ready and the responses are in."""
    aid = ctx.record.inputs["assessment_id"]
    backend = ctx.deps.backend
    try:
        assessment = await backend.get_assessment(ctx.principal, aid)
    except BackendError as exc:
        raise exc.to_app_error() from exc
    if assessment.subject.type != "employee" or assessment.subject.id != ctx.subject:
        raise StageFailed("invalid_request", "The assessment is not for this employee.")
    if assessment.status not in _SCOREABLE:
        raise Waiting("subject", "Complete and submit the assessment responses", "assessment", aid)
    try:
        items = await backend.get_assessment_items(ctx.principal, aid)
        methods = sorted({i.type for i in items})
    except BackendError:
        methods = []
    ctx.data["assessment"] = {"assessment_id": aid, "type": assessment.type, "role_id": assessment.role_id}
    return StageResult(
        f"{assessment.type.title()} assessment submitted: {len(assessment.rubric)} competency(ies)"
        + (f", methods: {', '.join(methods)}." if methods else "."),
        {
            "competencies": [r.skill_id for r in assessment.rubric],
            "methods": methods,
            "status": assessment.status,
        },
    )


async def _a_evaluate(ctx: StageContext) -> StageResult:
    """Talent Assessment Agent evaluates the responses against the competency rubrics (T3)."""
    if (scoring := ctx.data.get("scoring")) is not None:
        return StageResult("Evaluation already produced; reusing it.", scoring)
    aid = ctx.record.inputs["assessment_id"]
    execution = await ctx.capability("talent.recommend_scores", {"assessment_id": aid}, subject=None)
    step = execution.steps[0]
    evaluation = step.output or {}
    scoring = {
        "execution_id": execution.execution_id,
        "approval_id": step.approval.approval_id if step.approval else None,
        "scoring_set_id": evaluation["scoring_set_id"],
        "recommendations": [
            {
                "skill_id": r["skill_id"],
                "recommended_score": r["recommended_score"],
                "required_level": r["required_level"],
            }
            for r in evaluation["recommendations"]
        ],
    }
    if ctx.deps.talent_results is not None:
        ctx.deps.talent_results.link_scoring_set(
            ctx.record.tenant_id,
            scoring["scoring_set_id"],
            ScoringSetRef(execution.execution_id, scoring["approval_id"], "employee", ctx.subject),
        )
    ctx.data["scoring"] = scoring
    return StageResult(
        f"Evidence-based scores recommended for {len(scoring['recommendations'])} competency(ies).",
        scoring,
        {"scoring_set_id": scoring["scoring_set_id"]},
    )


async def _a_assessor_review(ctx: StageContext) -> StageResult:
    scoring = ctx.data["scoring"]
    record = ctx.service.executions.get(ctx.record.tenant_id, scoring["execution_id"])
    approval = record.steps[0].approval if record else None
    if approval is None:
        raise StageFailed("not_found", "The evaluation is no longer available.", retry_from="evaluate")
    if approval.status == "pending":
        raise Waiting(
            "assessor", "Review the AI-recommended scores", "scoring_set", scoring["scoring_set_id"]
        )
    if approval.status in ("rejected", "cancelled"):
        raise Finish(
            "assessment_rejected", "The assessor rejected the AI scores; no development actions were taken."
        )
    reviewed = (
        ctx.deps.talent_results.reviewed(ctx.record.tenant_id, ctx.record.inputs["assessment_id"])
        if ctx.deps.talent_results
        else None
    )
    if reviewed is None:
        raise StageFailed("not_found", "The reviewed result is not available.", retry_from="evaluate")
    ctx.data["confirmed"] = [r.model_dump(mode="json") for r in reviewed.rows]
    overridden = sum(r.decision == "overridden" for r in reviewed.rows)
    return StageResult(
        f"Assessor {approval.status} the scores ({overridden} override(s)).",
        {"status": approval.status, "rows": ctx.data["confirmed"]},
    )


async def _a_identify_gaps(ctx: StageContext) -> StageResult:
    required = {r["skill_id"]: r["required_level"] for r in ctx.data["scoring"]["recommendations"]}
    gaps, undetermined = [], []
    for row in ctx.data["confirmed"]:
        if row["final_score"] is None:
            undetermined.append(row["skill_id"])
        elif row["final_score"] < required[row["skill_id"]]:
            gaps.append(
                {
                    "skill_id": row["skill_id"],
                    "confirmed_level": row["final_score"],
                    "required_level": required[row["skill_id"]],
                    "gap": required[row["skill_id"]] - row["final_score"],
                }
            )
    ctx.data["gaps"] = gaps
    if not gaps:
        raise Finish(
            "no_development_needs", "No competency is below the requirement in the confirmed results."
        )
    return StageResult(
        f"{len(gaps)} competency gap(s) confirmed: "
        + ", ".join(f"{g['skill_id']} (gap {g['gap']})" for g in gaps),
        {"gaps": gaps, "undetermined": undetermined},
    )


async def _a_generate_idp(ctx: StageContext) -> StageResult:
    return await _draft_plan(ctx, {"assessment_id": ctx.record.inputs["assessment_id"]})


async def _a_plan_approval(ctx: StageContext) -> StageResult:
    return await _plan_approval(ctx, "generate_idp")


async def _a_start_coaching(ctx: StageContext) -> StageResult:
    return await _coaching(
        ctx, _plan_skills(ctx), "Development plan from my capability assessment", conversation=True
    )


WORKFLOW_A = WorkflowDefinition(
    type="assessment_to_development",
    title="Capability assessment to development",
    description="Assessment → evidence-based evaluation → confirmed gaps → IDP → approval → coaching.",
    validate=_validate_a,
    stages=(
        StageDef("initiate", "Employee initiates the assessment", "system", "any", _a_initiate),
        StageDef(
            "conduct",
            "Talent Assessment Agent conducts the assessment",
            "talent_assessment",
            "assessor",
            _a_conduct,
        ),
        StageDef(
            "evaluate",
            "Evaluate responses against competency rubrics",
            "talent_assessment",
            "assessor",
            _a_evaluate,
        ),
        StageDef(
            "assessor_review",
            "Assessor reviews the scores",
            "talent_assessment",
            "any",
            _a_assessor_review,
            checkpoint=True,
        ),
        StageDef("identify_gaps", "Identify competency gaps", "talent_assessment", "any", _a_identify_gaps),
        StageDef("generate_idp", "Training Plan Agent generates an IDP", "dev_plan", "any", _a_generate_idp),
        StageDef(
            "plan_approval",
            "Manager reviews and approves the plan",
            "dev_plan",
            "any",
            _a_plan_approval,
            checkpoint=True,
        ),
        StageDef(
            "start_coaching",
            "AI Coaching Agent initiates development coaching",
            "coaching",
            "subject",
            _a_start_coaching,
        ),
    ),
)


# ── Workflow B: personal development ─────────────────────────────────────────


def _validate_b(request: StartWorkflowRequest) -> dict[str, Any]:
    return {
        "objectives": request.objectives,
        "focus_skill_ids": request.focus_skill_ids,
        "horizon_weeks": request.horizon_weeks or 12,
    }


async def _b_profile(ctx: StageContext) -> StageResult:
    context = await ctx.context(_PLAN_SLICES, required=_GAP_REQUIRED)
    role = context.role_profile
    assert role is not None
    profile = {
        "job_title": context.subject.job_title if context.subject else None,
        "role_id": role.role_id,
        "role_title": role.title,
        "verified_competencies": sum(1 for c in context.capabilities or [] if c.verified_level is not None),
        "gaps": len([g for g in context.skill_gaps if g.gap > 0]),
        "context_as_of": context.as_of.isoformat() if context.as_of else None,
        "unavailable_context": [g.model_dump() for g in context.gaps_in_context],
    }
    ctx.data["profile"] = profile
    return StageResult(
        f"Profile retrieved: {role.title}, {profile['gaps']} gap(s) against the role.", profile
    )


async def _b_objectives(ctx: StageContext) -> StageResult:
    context = await ctx.context(_PLAN_SLICES)
    active = [p for p in context.development_plans or [] if p.status == "active"]
    objectives = list(ctx.record.inputs["objectives"]) + [g.objective for p in active for g in p.goals]
    gaps = {g.skill_id: g for g in context.skill_gaps if g.gap > 0}
    focus = [s for s in ctx.record.inputs["focus_skill_ids"] if s in gaps] or [
        s for s, g in gaps.items() if g.priority in ("critical", "high")
    ]
    ctx.data["objectives"] = {
        "objectives": objectives,
        "focus_skill_ids": focus,
        "active_plan_ids": [p.id for p in active],
    }
    return StageResult(
        f"{len(objectives)} development objective(s); focus on {len(focus)} competency(ies).",
        ctx.data["objectives"],
    )


async def _gaps_via_agent(ctx: StageContext) -> list[dict[str, Any]]:
    execution = await ctx.capability("dev_plan.explain_gaps")
    gaps = [
        {
            "skill_id": g["skill_id"],
            "skill_name": g["skill_name"],
            "priority": g["priority"],
            "gap": g["gap"],
            "required_level": g["required_level"],
        }
        for g in (execution.steps[0].output or {}).get("gaps", [])
        if g["gap"] > 0
    ]
    ctx.data["gaps"] = gaps
    return gaps


async def _b_analyse_gaps(ctx: StageContext) -> StageResult:
    gaps = await _gaps_via_agent(ctx)
    return StageResult(f"{len(gaps)} competency gap(s) analysed by the Training Plan Agent.", {"gaps": gaps})


async def _b_recommend_learning(ctx: StageContext) -> StageResult:
    execution = await ctx.capability("dev_plan.recommend_learning", {"limit": "5"})
    recs = [
        {"catalogue_item_id": r["catalogue_item_id"], "title": r["title"], "skill_id": r["skill_id"]}
        for r in (execution.steps[0].output or {}).get("recommendations", [])
    ]
    ctx.data["learning"] = recs
    return StageResult(
        f"{len(recs)} organisational learning intervention(s) recommended.", {"recommendations": recs}
    )


async def _b_generate_plan(ctx: StageContext) -> StageResult:
    focus = ctx.data["objectives"]["focus_skill_ids"]
    args = {"horizon_weeks": str(ctx.record.inputs["horizon_weeks"])}
    if focus:
        args["focus_skill_ids"] = ",".join(focus)
    return await _draft_plan(ctx, args)


async def _b_plan_approval(ctx: StageContext) -> StageResult:
    return await _plan_approval(ctx, "generate_plan")


async def _b_coaching_activities(ctx: StageContext) -> StageResult:
    result = await _coaching(ctx, _plan_skills(ctx), "My development plan", conversation=False)
    created = []
    for scenario in result.output["scenarios"][:3]:
        suggestion = ctx.service.suggestions.add(
            ctx.record.tenant_id,
            Suggestion(
                suggestion_id=f"sug_{ULID()}",
                kind="practice_scenario",
                subject_employee_id=ctx.subject,
                title=f"Practise: {scenario['title']}",
                detail="Coaching activity from your development plan.",
                source_handoff="dev_plan.practice_needed",
                ref_id=scenario["scenario_id"],
                status="pending",
                created_at=datetime.now(UTC),
            ),
        )
        created.append(suggestion.suggestion_id)
    result.output["activity_suggestion_ids"] = created
    result.summary = f"{len(created)} coaching activity(ies) created from the plan."
    return result


async def _monitor(ctx: StageContext, plan_id: str) -> dict[str, Any]:
    execution = await ctx.capability("dev_plan.review_plan", {"plan_id": plan_id, "progress_only": "true"})
    progress = (execution.steps[0].output or {}).get("progress", {})
    return {
        "plan_id": plan_id,
        "overall_progress_pct": progress.get("overall_progress_pct"),
        "goals": [
            {"skill_id": g["skill_id"], "status": g["status"], "progress_pct": g["progress_pct"]}
            for g in progress.get("goals", [])
        ],
    }


async def _b_monitor_progress(ctx: StageContext) -> StageResult:
    drafts = ctx.deps.drafts
    assert drafts is not None
    record = drafts.record(ctx.record.tenant_id, ctx.data["plan_draft_id"])
    committed = record.draft.resolution.committed_ref if record and record.draft.resolution else None
    if committed is None:
        raise Waiting(
            "manager_or_hr",
            "Commit the approved plan to the HR system (BE-052) and report it",
            "draft",
            ctx.data["plan_draft_id"],
        )
    snapshot = await _monitor(ctx, committed.resource_id)
    return StageResult(
        f"Monitoring plan {committed.resource_id}: {snapshot['overall_progress_pct']}% complete.",
        snapshot,
        {"plan_id": committed.resource_id},
    )


WORKFLOW_B = WorkflowDefinition(
    type="personal_development",
    title="Personal development",
    description="Profile → objectives → gaps → learning → plan (approved) → coaching activities → progress.",
    validate=_validate_b,
    stages=(
        StageDef("profile", "Retrieve employee profile", "system", "any", _b_profile),
        StageDef("objectives", "Retrieve development objectives", "system", "any", _b_objectives),
        StageDef("analyse_gaps", "Analyse competency gaps", "dev_plan", "any", _b_analyse_gaps),
        StageDef(
            "recommend_learning",
            "Recommend learning interventions",
            "dev_plan",
            "any",
            _b_recommend_learning,
            optional=True,
        ),
        StageDef("generate_plan", "Generate development plan", "dev_plan", "any", _b_generate_plan),
        StageDef(
            "plan_approval", "Manager approves the plan", "dev_plan", "any", _b_plan_approval, checkpoint=True
        ),
        StageDef(
            "coaching_activities", "Create coaching activities", "coaching", "subject", _b_coaching_activities
        ),
        StageDef(
            "monitor_progress", "Monitor progress", "dev_plan", "any", _b_monitor_progress, checkpoint=True
        ),
    ),
)


# ── Workflow C: continuous development ───────────────────────────────────────


def _validate_c(request: StartWorkflowRequest) -> dict[str, Any]:
    return {}


async def _c_assessment_results(ctx: StageContext) -> StageResult:
    latest: dict[str, dict[str, Any]] = {}
    reviewed = (
        ctx.deps.talent_results.reviewed_for_subject(ctx.record.tenant_id, ctx.subject)
        if ctx.deps.talent_results
        else []
    )
    for result in reviewed:  # newest first
        for row in result.rows:
            if row.final_score is not None and row.skill_id not in latest:
                latest[row.skill_id] = {
                    "level": row.final_score,
                    "source": "talent_assessment",
                    "at": result.reviewed_at.isoformat(),
                }
    history_note = None
    try:
        history = await ctx.deps.backend.get_assessment_history(ctx.principal, ctx.subject)
        for h in sorted(
            history, key=lambda x: x.completed_at or datetime.min.replace(tzinfo=UTC), reverse=True
        ):
            if h.final_level is not None and h.skill_id not in latest:
                latest[h.skill_id] = {
                    "level": h.final_level,
                    "source": "assessment_cycle",
                    "at": h.completed_at.isoformat() if h.completed_at else None,
                }
    except BackendError as exc:
        history_note = f"assessment history unavailable ({exc.kind})"
    ctx.data["assessments"] = latest
    return StageResult(
        f"Previous assessment results for {len(latest)} competency(ies)"
        + (f"; {history_note}." if history_note else "."),
        {"latest": latest, "note": history_note},
    )


async def _c_learning(ctx: StageContext) -> StageResult:
    context = await ctx.context(_LEARNING)
    done = [
        {
            "title": r.title,
            "skill_ids": r.skill_ids,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in context.learning_history or []
        if r.status == "completed"
    ]
    ctx.data["learning_completed"] = done
    return StageResult(f"{len(done)} completed learning activity(ies).", {"completed": done})


async def _c_coaching_history(ctx: StageContext) -> StageResult:
    """Coaching data is the employee's own; managers see summaries only (if the organisation allows)."""
    practice: dict[str, int] = {}
    if ctx.principal.employee_id == ctx.subject and ctx.deps.coaching_store is not None:
        sessions = ctx.deps.coaching_store.sessions_for(ctx.record.tenant_id, ctx.subject)
        conversations = ctx.deps.coaching_store.conversations_for(ctx.record.tenant_id, ctx.subject)
        for s in sessions:
            for obs in s.evaluation.skill_observations if s.evaluation else []:
                if obs.observed_level is not None:
                    practice[obs.skill_id] = max(practice.get(obs.skill_id, 0), obs.observed_level)
        summary = {
            "sessions": len(sessions),
            "conversations": len(conversations),
            "practice_levels": practice,
        }
    elif ctx.service.coaching is not None and ctx.principal.has_any_role("line_manager"):
        views = await ctx.service.coaching.manager_view(ctx.principal, ctx.subject)
        summary = {
            "sessions": sum(v.kind == "role_play" for v in views),
            "conversations": sum(v.kind == "conversation" for v in views),
            "practice_levels": {},
        }
    else:
        raise Skip("Coaching history is private to the employee (and summaries to their manager).")
    ctx.data["coaching"] = summary
    return StageResult(
        f"Coaching history: {summary['conversations']} conversation(s), {summary['sessions']} session(s).",
        summary,
    )


async def _c_evaluate_progress(ctx: StageContext) -> StageResult:
    context = await ctx.context(_PLANS)
    active = [p for p in context.development_plans or [] if p.status == "active"]
    if not active:
        raise Skip("No active development plan to evaluate.")
    snapshot = await _monitor(ctx, active[0].id)
    ctx.data["progress"] = snapshot
    return StageResult(
        f"Plan {active[0].id}: {snapshot['overall_progress_pct']}% complete.",
        snapshot,
        {"plan_id": active[0].id},
    )


async def _c_remaining_gaps(ctx: StageContext) -> StageResult:
    gaps = await _gaps_via_agent(ctx)
    return StageResult(f"{len(gaps)} competency gap(s) remain.", {"gaps": gaps})


async def _c_reassessment(ctx: StageContext) -> StageResult:
    """Deterministic: reassess a gap when there is new development evidence since its last assessment."""
    context = await ctx.context(_ROLE)
    categories = (
        {r.skill_id: r.category for r in context.role_profile.requirements} if context.role_profile else {}
    )
    assessed = ctx.data.get("assessments", {})
    goals = {g["skill_id"]: g for g in (ctx.data.get("progress") or {}).get("goals", [])}
    practice = (ctx.data.get("coaching") or {}).get("practice_levels", {})
    recommend, not_yet = [], []
    for gap in ctx.data.get("gaps", []):
        sid = gap["skill_id"]
        since = (assessed.get(sid) or {}).get("at")
        reasons = [
            f"completed '{r['title']}'"
            for r in ctx.data.get("learning_completed", [])
            if sid in r["skill_ids"] and (since is None or (r["completed_at"] or "") > since)
        ]
        if (goal := goals.get(sid)) and goal["status"] in ("achieved", "on_track"):
            reasons.append(f"plan goal {goal['status'].replace('_', ' ')} ({goal['progress_pct']}%)")
        if practice.get(sid, 0) >= gap["required_level"]:
            reasons.append(f"practised at level {practice[sid]} in coaching role-play")
        entry = {"skill_id": sid, "skill_name": gap["skill_name"], "last_assessed": since}
        if reasons:
            methods = sorted(m for m, cats in METHOD_CATEGORIES.items() if categories.get(sid) in cats) or [
                "competency_based"
            ]
            recommend.append({**entry, "reasons": reasons, "suggested_methods": methods})
        else:
            not_yet.append({**entry, "reason": "no new development evidence since the last assessment"})
    ctx.data["reassessment"] = recommend
    return StageResult(
        f"Reassessment recommended for {len(recommend)} competency(ies).",
        {"recommend": recommend, "not_yet": not_yet},
    )


async def _c_update_recommendations(ctx: StageContext) -> StageResult:
    plan_id = (ctx.data.get("progress") or {}).get("plan_id")
    if plan_id:
        trigger = (
            "assessment_reported"
            if ctx.data.get("assessments")
            else ("learning_completed" if ctx.data.get("learning_completed") else "manual")
        )
        execution = await ctx.capability("dev_plan.review_plan", {"plan_id": plan_id, "trigger": trigger})
        result = execution.steps[0].output or {}
        adjustment = result.get("adjustment")
        draft_id = adjustment["draft"]["draft_id"] if adjustment else None
        return StageResult(
            result.get("summary", "Plan reviewed."),
            {"plan_id": plan_id, "adjustment_draft_id": draft_id, "trigger": trigger},
            {"adjustment_draft_id": draft_id} if draft_id else {},
        )
    execution = await ctx.capability("dev_plan.recommend_learning", {"limit": "5"})
    recs = [r["catalogue_item_id"] for r in (execution.steps[0].output or {}).get("recommendations", [])]
    return StageResult(f"No active plan: {len(recs)} learning recommendation(s) updated.", {"learning": recs})


WORKFLOW_C = WorkflowDefinition(
    type="continuous_development",
    title="Continuous development",
    description="Assessment, learning and coaching history → progress → gaps → reassessment → updates.",
    validate=_validate_c,
    stages=(
        StageDef(
            "assessment_results",
            "Retrieve previous assessment results",
            "talent_assessment",
            "any",
            _c_assessment_results,
        ),
        StageDef(
            "learning_activities", "Retrieve completed learning activities", "system", "any", _c_learning
        ),
        StageDef(
            "coaching_history",
            "Retrieve coaching history",
            "coaching",
            "any",
            _c_coaching_history,
            optional=True,
        ),
        StageDef(
            "evaluate_progress",
            "Evaluate development progress",
            "dev_plan",
            "any",
            _c_evaluate_progress,
            optional=True,
        ),
        StageDef(
            "remaining_gaps", "Identify remaining competency gaps", "dev_plan", "any", _c_remaining_gaps
        ),
        StageDef(
            "recommend_reassessment", "Recommend reassessment", "talent_assessment", "any", _c_reassessment
        ),
        StageDef(
            "update_recommendations",
            "Update development recommendations",
            "dev_plan",
            "any",
            _c_update_recommendations,
        ),
    ),
)

DEFINITIONS: dict[str, WorkflowDefinition] = {d.type: d for d in (WORKFLOW_A, WORKFLOW_B, WORKFLOW_C)}
