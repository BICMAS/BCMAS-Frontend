"""Declarations of the 18 public capabilities (AI_TECHNICAL_SPEC.md §3.2–§3.3).

Declared now so that registration, authorisation, availability and telemetry are
exercised by the foundation. ``implemented=False`` until each agent is built;
such capabilities report ``unavailable`` with reason ``ai_disabled``.

BE-001 (JWKS) is a service-level dependency (a request cannot reach a capability
without a verified token), so it is not repeated per capability.
"""

from __future__ import annotations

from dataclasses import replace

from cfp_ai.agents.base import AccessRule, CapabilitySpec, SubjectMode

USERS = frozenset({"employee", "line_manager", "hr_ld_admin", "organisation_admin"})
SELF = AccessRule(USERS, "self")
MANAGER_OF = AccessRule(frozenset({"line_manager"}), "direct_report")
HR_TENANT = AccessRule(frozenset({"hr_ld_admin"}), "tenant")
CANDIDATE = AccessRule(frozenset({"candidate"}), "assessment_scope")

_DECLARED: tuple[CapabilitySpec, ...] = (
    # ── AI Coaching Agent ────────────────────────────────────────────────
    CapabilitySpec(
        "coaching.roleplay_turn",
        "coaching",
        "C1",
        "stream",
        "ai_coaching",
        (SELF,),
        optional_endpoints=("BE-010", "BE-023", "BE-030"),
        llm_routes=("coaching.persona_turn", "coaching.observer"),
        sync_deadline_s=60,
    ),
    CapabilitySpec(
        "coaching.evaluate_session",
        "coaching",
        "C2",
        "job",
        "ai_coaching",
        (SELF,),
        optional_endpoints=("BE-022", "BE-041"),
        commit_endpoints=("BE-081",),
        llm_routes=("coaching.evaluate",),
    ),
    CapabilitySpec(
        "coaching.recommend_scenarios",
        "coaching",
        "C3",
        "sync",
        "ai_coaching",
        (SELF,),
        optional_endpoints=("BE-023", "BE-030", "BE-082"),
        llm_routes=("coaching.recommend_reason",),
    ),
    CapabilitySpec(
        "coaching.draft_scenario",
        "coaching",
        "C4",
        "job",
        "ai_coaching",
        (HR_TENANT,),
        optional_endpoints=("BE-022",),
        llm_routes=("coaching.draft_scenario",),
        approval="user_accept",
    ),
    CapabilitySpec(
        "coaching.conversation_turn",
        "coaching",
        "C5",
        "stream",
        "ai_coaching",
        (SELF,),
        optional_endpoints=("BE-010", "BE-023", "BE-030", "BE-041"),
        llm_routes=("coaching.conversation_turn",),
        sync_deadline_s=60,
    ),
    CapabilitySpec(
        "coaching.manager_brief",
        "coaching",
        "C6",
        "sync",
        "ai_coaching",
        (MANAGER_OF,),
        required_endpoints=("BE-010", "BE-011", "BE-030"),
        optional_endpoints=("BE-023",),
        llm_routes=("coaching.manager_brief",),
    ),
    # ── AI Training & Development Plan Agent ─────────────────────────────
    CapabilitySpec(
        "dev_plan.draft_plan",
        "dev_plan",
        "D1",
        "job",
        "ai_dev_plans",
        (SELF, MANAGER_OF, HR_TENANT),
        required_endpoints=("BE-010", "BE-023", "BE-030", "BE-041"),
        optional_endpoints=("BE-022", "BE-024", "BE-031", "BE-042", "BE-050"),
        commit_endpoints=("BE-052",),
        llm_routes=("dev_plan.generate",),
        approval="user_accept",
    ),
    CapabilitySpec(
        "dev_plan.explain_gaps",
        "dev_plan",
        "D2",
        "sync",
        "ai_dev_plans",
        (SELF, MANAGER_OF, HR_TENANT),
        required_endpoints=("BE-023", "BE-030"),
        optional_endpoints=("BE-010", "BE-022"),
        llm_routes=("dev_plan.explain_gaps",),
    ),
    CapabilitySpec(
        "dev_plan.recommend_learning",
        "dev_plan",
        "D3",
        "sync",
        "ai_dev_plans",
        (SELF, MANAGER_OF, HR_TENANT),
        required_endpoints=("BE-040", "BE-041"),
        optional_endpoints=("BE-030", "BE-042"),
        llm_routes=("dev_plan.recommend_learning",),
    ),
    CapabilitySpec(
        "dev_plan.review_plan",
        "dev_plan",
        "D4",
        "job",
        "ai_dev_plans",
        (SELF, MANAGER_OF, HR_TENANT),
        required_endpoints=("BE-051", "BE-030"),
        optional_endpoints=("BE-041", "BE-042"),
        commit_endpoints=("BE-053",),
        llm_routes=("dev_plan.generate",),
        approval="user_accept",
    ),
    CapabilitySpec(
        "dev_plan.draft_cohort_pathway",
        "dev_plan",
        "D5",
        "job",
        "ai_dev_plans",
        (HR_TENANT,),
        required_endpoints=("BE-010", "BE-030", "BE-041"),
        optional_endpoints=("BE-042",),
        commit_endpoints=("BE-052",),
        llm_routes=("dev_plan.cohort_batch",),
        approval="role_approval",
        job_deadline_s=21600,
    ),
    CapabilitySpec(
        "dev_plan.manager_recommendations",
        "dev_plan",
        "D6",
        "sync",
        "ai_dev_plans",
        (MANAGER_OF,),
        required_endpoints=("BE-010", "BE-011", "BE-030"),
        optional_endpoints=("BE-042", "BE-050"),
        llm_routes=("dev_plan.manager_recs",),
    ),
    # ── AI Talent Assessment Agent ───────────────────────────────────────
    CapabilitySpec(
        "talent.draft_items",
        "talent_assessment",
        "T1",
        "job",
        "ai_talent_assessment",
        (HR_TENANT,),
        required_endpoints=("BE-022",),
        optional_endpoints=("BE-023", "BE-024", "BE-064"),
        commit_endpoints=("BE-065",),
        llm_routes=("talent.draft_items",),
        approval="per_item_review",
    ),
    CapabilitySpec(
        "talent.roleplay_turn",
        "talent_assessment",
        "T2",
        "stream",
        "ai_talent_assessment",
        (CANDIDATE, SELF),
        required_endpoints=("BE-060",),
        commit_endpoints=("BE-062",),
        llm_routes=("coaching.persona_turn",),
        sync_deadline_s=60,
    ),
    CapabilitySpec(
        "talent.recommend_scores",
        "talent_assessment",
        "T3",
        "job",
        "ai_talent_assessment",
        (HR_TENANT,),
        required_endpoints=("BE-060", "BE-061", "BE-022"),
        commit_endpoints=("BE-063",),
        llm_routes=("talent.score_row",),
        approval="per_item_review",
    ),
    CapabilitySpec(
        "talent.draft_report",
        "talent_assessment",
        "T4",
        "job",
        "ai_talent_assessment",
        (HR_TENANT, MANAGER_OF),
        required_endpoints=("BE-060", "BE-061"),
        optional_endpoints=("BE-022",),
        commit_endpoints=("BE-067",),
        llm_routes=("talent.report",),
        approval="role_approval",
    ),
    CapabilitySpec(
        "talent.analyze_evidence",
        "talent_assessment",
        "T5",
        "sync",
        "ai_talent_assessment",
        (MANAGER_OF, HR_TENANT),
        required_endpoints=("BE-070", "BE-071", "BE-022"),
        optional_endpoints=("BE-011",),
        llm_routes=("talent.evidence",),
    ),
    CapabilitySpec(
        "talent.insights_turn",
        "talent_assessment",
        "T6",
        "stream",
        "ai_talent_assessment",
        (HR_TENANT,),
        required_endpoints=("BE-066",),
        llm_routes=("talent.insights_turn",),
        sync_deadline_s=60,
    ),
)

# Routing metadata used by the orchestrator: (summary, subject_mode, required_args).
_ROUTING: dict[str, tuple[str, SubjectMode, tuple[str, ...]]] = {
    "coaching.roleplay_turn": ("Continue a live role-play practice session.", "required", ()),
    "coaching.evaluate_session": ("Evaluate a finished coaching practice session.", "required", ()),
    "coaching.recommend_scenarios": ("Recommend coaching practice scenarios for skill gaps.", "required", ()),
    "coaching.draft_scenario": ("Draft a new coaching scenario for the scenario library.", "none", ()),
    "coaching.conversation_turn": ("Open-ended career and skills coaching conversation.", "required", ()),
    "coaching.manager_brief": (
        "Prepare a line manager's coaching brief (talking points, questions) about a direct report.",
        "required",
        (),
    ),
    "dev_plan.draft_plan": ("Draft a development plan that closes an employee's skill gaps.", "required", ()),
    "dev_plan.explain_gaps": (
        "Explain an employee's skill gaps against their role requirements and why each matters.",
        "required",
        (),
    ),
    "dev_plan.recommend_learning": ("Recommend learning catalogue items for skill gaps.", "required", ()),
    "dev_plan.review_plan": ("Review progress on an existing development plan.", "required", ("plan_id",)),
    "dev_plan.draft_cohort_pathway": ("Draft a shared learning pathway for a team.", "none", ()),
    "dev_plan.manager_recommendations": (
        "Recommend actions a manager can take for a report.",
        "required",
        (),
    ),
    "talent.draft_items": ("Draft assessment items for the talent library.", "none", ()),
    "talent.roleplay_turn": ("Continue an assessment role-play.", "none", ("assessment_id",)),
    "talent.recommend_scores": (
        "Recommend rubric scores for a submitted recruitment or promotion assessment, for HR review.",
        "none",
        ("assessment_id",),
    ),
    "talent.draft_report": (
        "Draft an assessment report from assessor-confirmed scores.",
        "optional",
        ("assessment_id",),
    ),
    "talent.analyze_evidence": (
        "Analyse submitted evidence against skill indicators.",
        "none",
        ("evidence_id",),
    ),
    "talent.insights_turn": ("Answer questions about talent assessment trends.", "none", ()),
}

PUBLIC_CAPABILITIES: tuple[CapabilitySpec, ...] = tuple(
    replace(
        spec,
        summary=_ROUTING[spec.capability][0],
        subject_mode=_ROUTING[spec.capability][1],
        required_args=_ROUTING[spec.capability][2],
    )
    for spec in _DECLARED
)


def declared(capability: str) -> CapabilitySpec:
    """The catalogue declaration for a capability (implementations copy it with implemented=True)."""
    for spec in PUBLIC_CAPABILITIES:
        if spec.capability == capability:
            return spec
    raise KeyError(capability)
