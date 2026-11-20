"""
CFP AI Service — public API schemas (Pydantic v2)

Status:            DRAFT FOR REVIEW — not yet implemented.
Contract version:  1.0.0-rc.1
Mirrors:           docs/ai/contracts/ai-contracts.ts (frontend TypeScript contract)
Spec:              docs/ai/AI_API_SPEC.md, docs/ai/AI_TECHNICAL_SPEC.md

At implementation time this module becomes `cfp_ai.schemas` in the AI service
repository. FastAPI generates the OpenAPI document from these models, and the
frontend regenerates its TypeScript types from that document.

Conventions
  - snake_case wire format; ISO 8601 UTC datetimes.
  - `extra="forbid"` on all request models: unknown fields are a 400.
  - Nullable fields are required-with-None (`T | None` without default) on
    responses so they are always present on the wire, matching the TS contract.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar, Union

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION: Literal["1.0.0-rc.1"] = "1.0.0-rc.1"

# ─────────────────────────────────────────────────────────────────────────────
# Base models
# ─────────────────────────────────────────────────────────────────────────────


class ContractModel(BaseModel):
    """Base for all response/shared models."""

    model_config = ConfigDict(extra="forbid", frozen=False, populate_by_name=True)


class RequestModel(ContractModel):
    """Base for request bodies (strict: unknown fields rejected)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ─────────────────────────────────────────────────────────────────────────────
# Identifiers & primitives
# ─────────────────────────────────────────────────────────────────────────────

BackendId = Annotated[str, Field(min_length=1, max_length=128)]
TenantId = BackendId
UserId = BackendId
EmployeeId = BackendId
SkillId = BackendId
IndicatorId = BackendId
RoleId = BackendId
CatalogueItemId = BackendId
PlanId = BackendId
AssessmentId = BackendId
RubricRowId = BackendId
LibraryItemId = BackendId
EvidenceId = BackendId
ResponseItemId = BackendId


# AI-issued IDs: "<prefix>_" + ULID (26 chars, Crockford base32).
ScenarioId = Annotated[str, Field(pattern=r"^sc_[0-9A-HJKMNP-TV-Z]{26}$")]
CoachSessionId = Annotated[str, Field(pattern=r"^cs_[0-9A-HJKMNP-TV-Z]{26}$")]
MessageId = Annotated[str, Field(pattern=r"^msg_[0-9A-HJKMNP-TV-Z]{26}$")]
ConversationId = Annotated[str, Field(pattern=r"^cv_[0-9A-HJKMNP-TV-Z]{26}$")]
RoleplayId = Annotated[str, Field(pattern=r"^rp_[0-9A-HJKMNP-TV-Z]{26}$")]
DraftId = Annotated[str, Field(pattern=r"^drf_[0-9A-HJKMNP-TV-Z]{26}$")]
JobId = Annotated[str, Field(pattern=r"^job_[0-9A-HJKMNP-TV-Z]{26}$")]
ApprovalId = Annotated[str, Field(pattern=r"^apr_[0-9A-HJKMNP-TV-Z]{26}$")]
SuggestionId = Annotated[str, Field(pattern=r"^sug_[0-9A-HJKMNP-TV-Z]{26}$")]
ScoringSetId = Annotated[str, Field(pattern=r"^scs_[0-9A-HJKMNP-TV-Z]{26}$")]
FactId = Annotated[str, Field(pattern=r"^fact_[0-9A-HJKMNP-TV-Z]{26}$")]

BackendEndpointId = Annotated[str, Field(pattern=r"^BE-\d{3}$")]
Level = Annotated[int, Field(ge=1, le=10)]
Score1to5 = Annotated[int, Field(ge=1, le=5)]
Percent = Annotated[int, Field(ge=0, le=100)]
ClientMessageId = Annotated[str, Field(min_length=8, max_length=64)]

# ─────────────────────────────────────────────────────────────────────────────
# Enumerations
# ─────────────────────────────────────────────────────────────────────────────

AgentName = Literal["coaching", "dev_plan", "talent_assessment"]

CapabilityId = Literal[
    "coaching.roleplay_turn",  # C1
    "coaching.evaluate_session",  # C2
    "coaching.recommend_scenarios",  # C3
    "coaching.draft_scenario",  # C4
    "coaching.conversation_turn",  # C5
    "coaching.manager_brief",  # C6
    "dev_plan.draft_plan",  # D1
    "dev_plan.explain_gaps",  # D2
    "dev_plan.recommend_learning",  # D3
    "dev_plan.review_plan",  # D4
    "dev_plan.draft_cohort_pathway",  # D5
    "dev_plan.manager_recommendations",  # D6
    "talent.draft_items",  # T1
    "talent.roleplay_turn",  # T2
    "talent.recommend_scores",  # T3
    "talent.draft_report",  # T4
    "talent.analyze_evidence",  # T5
    "talent.insights_turn",  # T6
]

Role = Literal[
    "employee", "line_manager", "hr_ld_admin", "organisation_admin", "platform_super_admin"
]
Entitlement = Literal["ai_coaching", "ai_dev_plans", "ai_talent_assessment"]
SkillCategory = Literal["technical", "behavioural", "knowledge"]
GapPriority = Literal["critical", "high", "medium", "low"]
Confidence = Literal["low", "medium", "high"]

# ─────────────────────────────────────────────────────────────────────────────
# Errors
# ─────────────────────────────────────────────────────────────────────────────

ErrorCode = Literal[
    "invalid_request",
    "unauthenticated",
    "forbidden",
    "entitlement_required",
    "not_found",
    "conflict",
    "idempotency_conflict",
    "precondition_failed",
    "ai_output_invalid",
    "content_refused",
    "backend_dependency_unconfirmed",
    "upstream_unavailable",
    "rate_limited",
    "budget_exceeded",
    "internal_error",
    "ai_unavailable",
    "deadline_exceeded",
]

ERROR_HTTP_STATUS: dict[str, int] = {
    "invalid_request": 400,
    "unauthenticated": 401,
    "forbidden": 403,
    "entitlement_required": 403,
    "not_found": 404,
    "conflict": 409,
    "idempotency_conflict": 409,
    "precondition_failed": 412,
    "ai_output_invalid": 422,
    "content_refused": 422,
    "backend_dependency_unconfirmed": 424,
    "upstream_unavailable": 424,
    "rate_limited": 429,
    "budget_exceeded": 429,
    "internal_error": 500,
    "ai_unavailable": 503,
    "deadline_exceeded": 504,
}


class ErrorDetail(ContractModel):
    field: str | None = None
    issue: str


class ErrorBody(ContractModel):
    code: ErrorCode
    message: str
    request_id: str
    retryable: bool
    retry_after_s: int | None = None
    details: list[ErrorDetail] | None = None
    backend_endpoint_ids: list[BackendEndpointId] | None = None


class ErrorEnvelope(ContractModel):
    error: ErrorBody


# ─────────────────────────────────────────────────────────────────────────────
# Shared structures
# ─────────────────────────────────────────────────────────────────────────────

T = TypeVar("T")
PayloadT = TypeVar("PayloadT")
ProposalT = TypeVar("ProposalT")


class Page(ContractModel, Generic[T]):
    items: list[T]
    next_cursor: str | None


CitationSourceType = Literal[
    "skill_level",
    "indicator",
    "role_profile",
    "catalogue_item",
    "scenario",
    "library_item",
    "evidence",
    "transcript",
    "assessment_response",
]


class Citation(ContractModel):
    source_type: CitationSourceType
    source_id: str
    source_version: str | None
    title: str
    excerpt: str | None


ContextSlice = Literal[
    "subject_profile",
    "role_profile",
    "framework",
    "capabilities",
    "learning_history",
    "development_plans",
    "coaching_history",
    "team",
    "assessment",
    "evidence",
]
ContextGapReason = Literal["backend_unconfirmed", "forbidden", "not_found", "upstream_error"]


class ContextGap(ContractModel):
    slice: ContextSlice
    reason: ContextGapReason


class AiProvenance(ContractModel):
    capability: CapabilityId
    model: str
    prompt_version: str
    generated_at: datetime
    context_as_of: datetime | None
    citations: list[Citation]
    unavailable_context: list[ContextGap]


class SkillTarget(ContractModel):
    skill_id: SkillId
    skill_name: str
    target_level: Level
    level_label: str | None


class SkillLevelRef(RequestModel):
    skill_id: SkillId
    target_level: Level


# ─────────────────────────────────────────────────────────────────────────────
# Streaming (SSE)
# ─────────────────────────────────────────────────────────────────────────────


class StreamMeta(ContractModel):
    request_id: str
    capability: CapabilityId
    model: str
    resource_id: str | None
    turn_id: str | None


class JobProgress(ContractModel):
    step: str
    pct: Percent


class StreamDelta(ContractModel):
    text: str


SseEventName = Literal["meta", "delta", "progress", "result", "error", "done"]
# Frames are serialised as:  event: <name>\ndata: <json>\n\n
# Payload per event: meta→StreamMeta, delta→StreamDelta, progress→JobProgress,
# result→capability result model, error→ErrorBody, done→{}.

# ─────────────────────────────────────────────────────────────────────────────
# Async jobs
# ─────────────────────────────────────────────────────────────────────────────

JobStatus = Literal["queued", "running", "awaiting_approval", "succeeded", "failed", "cancelled"]


class JobAccepted(ContractModel):
    job_id: JobId
    status: Literal["queued"] = "queued"
    status_url: str
    events_url: str


class Job(ContractModel, Generic[T]):
    job_id: JobId
    capability: CapabilityId
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    progress: JobProgress | None
    result: T | None
    error: ErrorBody | None
    approval_id: ApprovalId | None


# ─────────────────────────────────────────────────────────────────────────────
# Human approval workflows
# ─────────────────────────────────────────────────────────────────────────────

DraftKind = Literal[
    "development_plan",
    "plan_adjustment",
    "cohort_pathway",
    "scenario",
    "assessment_items",
    "assessment_report",
]
DraftStatus = Literal[
    "open", "accepted", "edited", "rejected", "expired", "committed", "commit_failed"
]
ApprovalMode = Literal["none", "user_accept", "role_approval", "per_item_review"]


class ApprovalPolicy(ContractModel):
    mode: ApprovalMode
    approver_roles: list[Role]
    commit_target: Literal["backend", "ai_service", "none"]
    commit_endpoint_id: BackendEndpointId | None


class CommittedRef(ContractModel):
    system: Literal["backend", "ai_service"]
    resource_type: str
    resource_id: str


class DraftResolution(ContractModel):
    decision: Literal["accepted", "edited", "rejected"]
    resolved_by: UserId
    resolved_at: datetime
    reason: str | None
    committed_ref: CommittedRef | None


class Draft(ContractModel, Generic[PayloadT]):
    draft_id: DraftId
    kind: DraftKind
    status: DraftStatus
    subject_employee_id: EmployeeId | None
    payload: PayloadT
    provenance: AiProvenance
    approval_policy: ApprovalPolicy
    disclaimer: str
    created_by: UserId
    created_at: datetime
    expires_at: datetime
    resolution: DraftResolution | None


class DraftResolutionRequest(RequestModel, Generic[PayloadT]):
    decision: Literal["accepted", "edited", "rejected"]
    edited_payload: PayloadT | None = None  # required when decision == "edited"
    reason: Annotated[str, Field(max_length=1000)] | None = None


class DraftCommitReport(RequestModel):
    committed_ref: CommittedRef


ApprovalCheckpoint = Literal["cohort_members", "item_blueprint"]
ApprovalStatus = Literal["pending", "approved", "rejected", "expired"]


class ApprovalRequest(ContractModel, Generic[ProposalT]):
    approval_id: ApprovalId
    job_id: JobId
    capability: CapabilityId
    checkpoint: ApprovalCheckpoint
    summary: str
    proposal: ProposalT
    allowed_decisions: list[Literal["approve", "reject", "modify"]]
    approver_roles: list[Role]
    status: ApprovalStatus
    created_at: datetime
    expires_at: datetime


class ApprovalDecisionRequest(RequestModel, Generic[ProposalT]):
    decision: Literal["approve", "reject", "modify"]
    modified_proposal: ProposalT | None = None  # required when decision == "modify"
    comment: Annotated[str, Field(max_length=1000)] | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Capability discovery
# ─────────────────────────────────────────────────────────────────────────────

AvailabilityReason = Literal[
    "not_entitled",
    "role_not_permitted",
    "backend_dependency_unconfirmed",
    "backend_dependency_down",
    "ai_disabled",
]


class CapabilityStatus(ContractModel):
    capability: CapabilityId
    agent: AgentName
    availability: Literal["available", "degraded", "unavailable"]
    reasons: list[AvailabilityReason]
    missing_backend_endpoints: list[BackendEndpointId]


class CapabilitiesResponse(ContractModel):
    contract_version: Literal["1.0.0-rc.1"] = CONTRACT_VERSION
    tenant_id: TenantId
    capabilities: list[CapabilityStatus]


# ─────────────────────────────────────────────────────────────────────────────
# Agent 1 — AI Coaching Agent
# ─────────────────────────────────────────────────────────────────────────────

ScenarioCategory = Literal["role", "soft", "technical", "custom"]
ScenarioDifficulty = Literal["foundation", "intermediate", "advanced", "expert"]
ScenarioStatus = Literal["draft", "published", "archived"]


class PersonaPublic(ContractModel):
    name: Annotated[str, Field(max_length=80)]
    role: Annotated[str, Field(max_length=120)]
    avatar_url: str | None


class SuccessCriterion(ContractModel):
    criterion_id: str
    text: Annotated[str, Field(max_length=500)]
    skill_id: SkillId
    indicator_id: IndicatorId | None


class ScenarioAuthoring(ContractModel):
    persona_brief: Annotated[str, Field(max_length=4000)]
    hidden_constraints: list[Annotated[str, Field(max_length=500)]]
    escalation_rules: list[Annotated[str, Field(max_length=500)]]
    success_criteria: Annotated[list[SuccessCriterion], Field(min_length=1, max_length=12)]


class CoachScenario(ContractModel):
    scenario_id: ScenarioId
    version: Annotated[int, Field(ge=1)]
    title: Annotated[str, Field(min_length=3, max_length=120)]
    description: Annotated[str, Field(max_length=1000)]
    category: ScenarioCategory
    difficulty: ScenarioDifficulty
    estimated_minutes: Annotated[int, Field(ge=5, le=90)]
    target_skills: Annotated[list[SkillTarget], Field(min_length=1, max_length=3)]
    persona: PersonaPublic
    opening: Annotated[str, Field(max_length=2000)]
    status: ScenarioStatus
    updated_at: datetime


class CoachScenarioAdmin(CoachScenario):
    authoring: ScenarioAuthoring


class ScenarioRecommendation(ContractModel):
    scenario: CoachScenario
    reason: str
    target_skill_id: SkillId | None
    gap: int | None


class ScenarioRecommendationsResponse(ContractModel):
    recommendations: list[ScenarioRecommendation]
    provenance: AiProvenance


class ScenarioDraftRequest(RequestModel):
    title: Annotated[str, Field(min_length=3, max_length=120)]
    brief: Annotated[str, Field(max_length=2000)] | None
    category: ScenarioCategory
    difficulty: ScenarioDifficulty | None
    target_skills: Annotated[list[SkillLevelRef], Field(min_length=1, max_length=3)]


class ScenarioDraftPayload(ContractModel):
    title: Annotated[str, Field(min_length=3, max_length=120)]
    description: Annotated[str, Field(max_length=1000)]
    category: ScenarioCategory
    difficulty: ScenarioDifficulty
    estimated_minutes: Annotated[int, Field(ge=5, le=90)]
    target_skills: Annotated[list[SkillTarget], Field(min_length=1, max_length=3)]
    persona: PersonaPublic
    opening: Annotated[str, Field(max_length=2000)]
    authoring: ScenarioAuthoring


class PublishScenarioRequest(RequestModel):
    from_draft_id: DraftId | None
    scenario: ScenarioDraftPayload


class UpdateScenarioRequest(RequestModel):
    expected_version: Annotated[int, Field(ge=1)]
    status: ScenarioStatus | None = None
    title: Annotated[str, Field(min_length=3, max_length=120)] | None = None
    description: Annotated[str, Field(max_length=1000)] | None = None
    difficulty: ScenarioDifficulty | None = None
    estimated_minutes: Annotated[int, Field(ge=5, le=90)] | None = None
    persona: PersonaPublic | None = None
    opening: Annotated[str, Field(max_length=2000)] | None = None
    authoring: ScenarioAuthoring | None = None


class CoachMessage(ContractModel):
    message_id: MessageId
    role: Literal["coach", "user"]
    text: str
    created_at: datetime


CoachSessionStatus = Literal["active", "evaluating", "evaluated", "abandoned"]
EvaluationStatus = Literal["none", "pending", "ready", "failed"]


class CreateCoachSessionRequest(RequestModel):
    scenario_id: ScenarioId
    mode: Literal["practice"] = "practice"


class CoachSessionSummary(ContractModel):
    session_id: CoachSessionId
    employee_id: EmployeeId
    scenario_id: ScenarioId
    scenario_version: int
    title: str
    status: CoachSessionStatus
    evaluation_status: EvaluationStatus
    persona: PersonaPublic
    target_skills: list[SkillTarget]
    started_at: datetime
    ended_at: datetime | None
    duration_s: int | None
    time_limit_s: int
    practice_score: Percent | None


class CoachSession(ContractModel):
    session_id: CoachSessionId
    employee_id: EmployeeId
    scenario_id: ScenarioId
    scenario_version: int
    title: str
    status: CoachSessionStatus
    evaluation_status: EvaluationStatus
    persona: PersonaPublic
    target_skills: list[SkillTarget]
    started_at: datetime
    ended_at: datetime | None
    duration_s: int | None
    time_limit_s: int
    messages: list[CoachMessage]


class SendCoachMessageRequest(RequestModel):
    text: Annotated[str, Field(min_length=1, max_length=4000)]
    client_message_id: ClientMessageId


class CoachTurnResult(ContractModel):
    user_message: CoachMessage
    coach_message: CoachMessage
    session_status: CoachSessionStatus
    suggest_end: bool
    remaining_s: int


class EndCoachSessionRequest(RequestModel):
    reason: Literal["user_ended", "time_limit"]


class TranscriptQuote(ContractModel):
    message_id: MessageId
    quote: Annotated[str, Field(max_length=500)]


class SkillObservation(ContractModel):
    skill_id: SkillId
    skill_name: str
    target_level: Level
    observed_level: Level | None
    evidence: list[TranscriptQuote]


class FeedbackPoint(ContractModel):
    text: str
    indicator_id: IndicatorId | None
    evidence: list[TranscriptQuote]


class GrowthPoint(FeedbackPoint):
    tip: str


class NextStep(ContractModel):
    type: Literal["learning", "scenario"]
    ref_id: str
    title: str
    reason: str


class SessionEvaluation(ContractModel):
    session_id: CoachSessionId
    overall_practice_score: Percent
    skill_observations: list[SkillObservation]
    strengths: Annotated[list[FeedbackPoint], Field(max_length=5)]
    growth_areas: Annotated[list[GrowthPoint], Field(max_length=5)]
    next_steps: Annotated[list[NextStep], Field(max_length=4)]
    provenance: AiProvenance
    disclaimer: str


class CoachMetrics(ContractModel):
    total_sessions: int
    sessions_this_month: int
    skills_targeted: int
    average_practice_score: Percent | None
    minutes_coached: int


class SuggestedAction(ContractModel):
    type: Literal["open_scenario", "view_learning", "generate_plan", "view_gap"]
    label: str
    ref_id: str | None


class CreateConversationRequest(RequestModel):
    topic: Annotated[str, Field(max_length=200)] | None = None


class Conversation(ContractModel):
    conversation_id: ConversationId
    status: Literal["active", "closed"]
    created_at: datetime
    messages: list[CoachMessage]


class ConversationTurnResult(ContractModel):
    user_message: CoachMessage
    assistant_message: CoachMessage
    suggested_actions: Annotated[list[SuggestedAction], Field(max_length=3)]


class ManagerBriefRequest(RequestModel):
    employee_id: EmployeeId


class ManagerCoachingBrief(ContractModel):
    employee_id: EmployeeId
    focus_skills: list[SkillTarget]
    talking_points: Annotated[list[str], Field(max_length=6)]
    questions_to_ask: Annotated[list[str], Field(max_length=6)]
    suggested_scenarios: Annotated[list[ScenarioRecommendation], Field(max_length=3)]
    provenance: AiProvenance
    disclaimer: str


# ─────────────────────────────────────────────────────────────────────────────
# Agent 2 — AI Training & Development Plan Agent
# ─────────────────────────────────────────────────────────────────────────────


class SkillGap(ContractModel):
    skill_id: SkillId
    skill_name: str
    category: SkillCategory
    required_level: Level
    verified_level: Level | None
    self_assessed_level: Level | None
    gap: int
    priority: GapPriority


class GapInsight(SkillGap):
    why_it_matters: str
    priority_rationale: str
    citations: list[Citation]


class GapInsightsResponse(ContractModel):
    employee_id: EmployeeId
    role_id: RoleId
    role_profile_version: str
    gaps: list[GapInsight]
    provenance: AiProvenance


class LearningRecommendation(ContractModel):
    catalogue_item_id: CatalogueItemId
    title: str
    kind: str
    provider: str | None
    duration_minutes: int | None
    skill_id: SkillId
    target_level: Level | None
    fit_reason: str
    citations: list[Citation]


class LearningRecommendationsResponse(ContractModel):
    recommendations: list[LearningRecommendation]
    provenance: AiProvenance


PlanActionType = Literal[
    "learning", "workplace_practice", "coaching_scenario", "mentoring", "evidence"
]


class PlanAction(ContractModel):
    action_key: Annotated[str, Field(max_length=64)]
    type: PlanActionType
    title: Annotated[str, Field(max_length=200)]
    description: Annotated[str, Field(max_length=2000)]
    catalogue_item_id: CatalogueItemId | None
    scenario_id: ScenarioId | None
    success_indicator_ids: list[IndicatorId]
    due_in_days: Annotated[int, Field(ge=1, le=365)]


class PlanGoal(ContractModel):
    goal_key: Annotated[str, Field(max_length=64)]
    skill_id: SkillId
    skill_name: str
    from_level: Annotated[int, Field(ge=0, le=10)]  # 0 = not yet held
    to_level: Level
    priority: GapPriority
    objective: Annotated[str, Field(max_length=1000)]
    actions: Annotated[list[PlanAction], Field(min_length=1, max_length=10)]
    evidence_expectations: list[str]


class ValidationIssue(ContractModel):
    code: str
    message: str
    path: str


class DraftValidationReport(ContractModel):
    passed: bool
    repaired: bool
    issues: list[ValidationIssue]


class PlanConstraints(RequestModel):
    hours_per_week: Annotated[int, Field(ge=1, le=40)] | None = None
    preferred_formats: list[str] | None = None


class DevelopmentPlanDraftRequest(RequestModel):
    employee_id: EmployeeId
    role_id: RoleId | None = None
    focus_skill_ids: Annotated[list[SkillId], Field(max_length=10)] | None = None
    horizon_weeks: Annotated[int, Field(ge=4, le=52)] = 12
    constraints: PlanConstraints | None = None


class DevelopmentPlanDraftPayload(ContractModel):
    employee_id: EmployeeId
    role_id: RoleId
    role_profile_version: str
    horizon_weeks: int
    rationale: str
    goals: Annotated[list[PlanGoal], Field(max_length=6)]
    validation: DraftValidationReport


PlanReviewTrigger = Literal[
    "manual", "capability_verified", "learning_completed", "coaching_evaluated",
    "assessment_reported",
]


class PlanReviewRequest(RequestModel):
    trigger: PlanReviewTrigger = "manual"


class PlanChange(ContractModel):
    op: Literal[
        "add_goal", "remove_goal", "update_goal", "add_action", "remove_action",
        "update_action", "mark_goal_complete",
    ]
    goal_ref: str
    action_ref: str | None
    goal: PlanGoal | None
    action: PlanAction | None
    reason: str


class PlanAdjustmentPayload(ContractModel):
    plan_id: PlanId
    trigger: PlanReviewTrigger
    changes: list[PlanChange]
    rationale: str
    validation: DraftValidationReport


class CohortPathwayRequest(RequestModel):
    skill_id: SkillId
    target_level: Level
    employee_ids: Annotated[list[EmployeeId], Field(min_length=1, max_length=200)]


class CohortMember(ContractModel):
    employee_id: EmployeeId
    name: str
    current_level: Level | None


class ExcludedCohortMember(CohortMember):
    reason: str


class CohortMembersProposal(ContractModel):
    skill_id: SkillId
    target_level: Level
    included: list[CohortMember]
    excluded: list[ExcludedCohortMember]


class MemberOverride(ContractModel):
    employee_id: EmployeeId
    extra_actions: list[PlanAction]
    note: str


class CohortPathwayPayload(ContractModel):
    skill_id: SkillId
    target_level: Level
    members: list[CohortMember]
    shared_actions: list[PlanAction]
    member_overrides: list[MemberOverride]
    rationale: str
    validation: DraftValidationReport


class ManagerRecommendation(ContractModel):
    employee_id: EmployeeId
    kind: Literal[
        "start_plan", "assign_learning", "suggest_practice", "review_evidence", "plan_at_risk"
    ]
    title: str
    detail: str
    skill_id: SkillId | None
    ref_id: str | None
    priority: GapPriority


class ManagerRecommendationsResponse(ContractModel):
    employee_id: EmployeeId
    recommendations: list[ManagerRecommendation]
    provenance: AiProvenance


HandoffType = Literal[
    "coaching.session_evaluated", "talent.assessment_reported", "dev_plan.practice_needed"
]


class Suggestion(ContractModel):
    suggestion_id: SuggestionId
    kind: Literal["plan_review", "plan_draft", "practice_scenario"]
    subject_employee_id: EmployeeId
    title: str
    detail: str
    source_handoff: HandoffType
    ref_id: str | None
    status: Literal["pending", "dismissed", "acted"]
    created_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# Agent 3 — AI Talent Assessment Agent
# ─────────────────────────────────────────────────────────────────────────────

AssessmentItemType = Literal[
    "knowledge_test",
    "situational_judgement",
    "case_study",
    "ai_roleplay",
    "practical_exercise",
    "behavioural_assessment",
]


class ItemDraftRequest(RequestModel):
    type: AssessmentItemType
    skill_id: SkillId
    target_level: Level
    role_id: RoleId | None = None
    count: Annotated[int, Field(ge=1, le=5)] = 1
    guidance: Annotated[str, Field(max_length=2000)] | None = None


class IndicatorText(ContractModel):
    indicator_id: IndicatorId
    text: str


class ItemBlueprint(ContractModel):
    type: AssessmentItemType
    skill_id: SkillId
    target_level: Level
    indicators: list[IndicatorText]
    item_outlines: list[str]


class MarkingGuideBand(ContractModel):
    level: Level
    descriptor: str
    indicator_ids: list[IndicatorId]


class ItemOption(ContractModel):
    option_key: str
    text: str
    score: Score1to5


class RoleplayItemSpec(ScenarioAuthoring):
    persona: PersonaPublic
    opening: Annotated[str, Field(max_length=2000)]


class AssessmentItemDraftPayload(ContractModel):
    item_key: str
    type: AssessmentItemType
    skill_id: SkillId
    target_level: Level
    title: Annotated[str, Field(max_length=200)]
    stem: Annotated[str, Field(max_length=8000)]
    options: list[ItemOption] | None
    model_answer: str | None
    marking_guide: Annotated[list[MarkingGuideBand], Field(min_length=1)]
    estimated_minutes: Annotated[int, Field(ge=1, le=120)]
    roleplay: RoleplayItemSpec | None


class AssessmentItemsPayload(ContractModel):
    items: Annotated[list[AssessmentItemDraftPayload], Field(min_length=1, max_length=5)]
    validation: DraftValidationReport


class RoleplayMessage(ContractModel):
    message_id: MessageId
    role: Literal["persona", "participant"]
    text: str
    created_at: datetime


class StartRoleplayRequest(RequestModel):
    assessment_id: AssessmentId
    library_item_id: LibraryItemId


class RoleplaySession(ContractModel):
    roleplay_id: RoleplayId
    assessment_id: AssessmentId
    library_item_id: LibraryItemId
    status: Literal["active", "submitted", "expired"]
    persona: PersonaPublic
    time_limit_s: int
    started_at: datetime
    expires_at: datetime
    messages: list[RoleplayMessage]


class RoleplayTurnResult(ContractModel):
    participant_message: RoleplayMessage
    persona_message: RoleplayMessage
    remaining_s: int


class RoleplaySubmitResult(ContractModel):
    roleplay_id: RoleplayId
    status: Literal["submitted"] = "submitted"
    backend_submission: Literal["submitted", "pending_backend"]


class ScoringRequest(RequestModel):
    rubric_row_ids: list[RubricRowId] | None = None


class ResponseQuote(ContractModel):
    response_item_id: ResponseItemId
    quote: Annotated[str, Field(max_length=500)]


class ScoringRecommendation(ContractModel):
    rubric_row_id: RubricRowId
    skill_id: SkillId
    required_level: Level
    recommended_score: Score1to5
    confidence: Confidence
    rationale: Annotated[str, Field(max_length=2000)]
    evidence: Annotated[list[ResponseQuote], Field(min_length=1)]
    indicators_met: list[IndicatorId]
    indicators_missing: list[IndicatorId]


class ScoringRecommendationSet(ContractModel):
    scoring_set_id: ScoringSetId
    assessment_id: AssessmentId
    rubric_version: str
    blind: Literal[True] = True
    recommendations: list[ScoringRecommendation]
    approval_policy: ApprovalPolicy
    provenance: AiProvenance
    disclaimer: str


class ScoreReview(RequestModel):
    rubric_row_id: RubricRowId
    decision: Literal["accepted", "overridden"]
    final_score: Score1to5
    comment: Annotated[str, Field(max_length=1000)] | None = None


class ScoreReviewRequest(RequestModel):
    reviews: Annotated[list[ScoreReview], Field(min_length=1)]


class PerSkillReport(ContractModel):
    skill_id: SkillId
    narrative: str
    recommended_score: Score1to5 | None
    final_score: Score1to5 | None


class DevelopmentHandoffItem(ContractModel):
    skill_id: SkillId
    suggestion: str


class AssessmentReportPayload(ContractModel):
    assessment_id: AssessmentId
    summary: Annotated[str, Field(max_length=4000)]
    strengths: list[str]
    risks: list[str]
    per_skill: list[PerSkillReport]
    development_handoff: list[DevelopmentHandoffItem]


class EvidenceAnalysisRequest(RequestModel):
    target_level: Level | None = None


class SupportedIndicator(ContractModel):
    indicator_id: IndicatorId
    quote: str


class MissingIndicator(ContractModel):
    indicator_id: IndicatorId
    suggested_question: str


class EvidenceAnalysis(ContractModel):
    evidence_id: EvidenceId
    skill_id: SkillId
    target_level: Level
    indicators_supported: list[SupportedIndicator]
    indicators_missing: list[MissingIndicator]
    summary: str
    provenance: AiProvenance
    disclaimer: str


class ChartPoint(ContractModel):
    x: str
    y: float


class ChartSeries(ContractModel):
    name: str
    points: list[ChartPoint]


class ChartSpec(ContractModel):
    type: Literal["bar", "line", "donut", "table"]
    title: str
    x_label: str | None
    y_label: str | None
    series: list[ChartSeries]


class InsightsTurnRequest(RequestModel):
    conversation_id: ConversationId | None = None
    text: Annotated[str, Field(min_length=1, max_length=2000)]
    client_message_id: ClientMessageId


class InsightsTurnResult(ContractModel):
    conversation_id: ConversationId
    answer: str
    chart: ChartSpec | None
    provenance: AiProvenance


# ─────────────────────────────────────────────────────────────────────────────
# Feedback, personal data
# ─────────────────────────────────────────────────────────────────────────────


class FeedbackTarget(RequestModel):
    type: Literal["message", "draft", "evaluation", "recommendation", "scoring_set", "analysis"]
    id: str


class FeedbackRequest(RequestModel):
    target: FeedbackTarget
    rating: Literal["up", "down"]
    reasons: Annotated[list[str], Field(max_length=10)] = []
    comment: Annotated[str, Field(max_length=1000)] | None = None


class LearnerMemoryFact(ContractModel):
    fact_id: FactId
    kind: Literal["preference", "goal", "theme"]
    text: Annotated[str, Field(max_length=300)]
    source_session_id: str | None
    created_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# Platform console (platform_super_admin)
# ─────────────────────────────────────────────────────────────────────────────


class DependencyHealth(ContractModel):
    name: str
    status: Literal["healthy", "degraded", "down", "not_configured"]
    detail: str | None


class AdminHealthResponse(ContractModel):
    status: Literal["healthy", "degraded", "down"]
    version: str
    contract_version: Literal["1.0.0-rc.1"] = CONTRACT_VERSION
    dependencies: list[DependencyHealth]
    checked_at: datetime


class TenantUsageRow(ContractModel):
    tenant_id: TenantId
    requests: int
    input_tokens: int
    output_tokens: int
    cost_usd: float
    budget_used_ratio: float | None


class AdminMetricsResponse(ContractModel):
    period_start: datetime
    period_end: datetime
    tenants: list[TenantUsageRow]
    p95_latency_ms_by_capability: dict[CapabilityId, int]


# ─────────────────────────────────────────────────────────────────────────────
# Concrete draft / approval aliases used by routes
# ─────────────────────────────────────────────────────────────────────────────

ScenarioDraft = Draft[ScenarioDraftPayload]
DevelopmentPlanDraft = Draft[DevelopmentPlanDraftPayload]
PlanAdjustmentDraft = Draft[PlanAdjustmentPayload]
CohortPathwayDraft = Draft[CohortPathwayPayload]
AssessmentItemsDraft = Draft[AssessmentItemsPayload]
AssessmentReportDraft = Draft[AssessmentReportPayload]

CohortMembersApproval = ApprovalRequest[CohortMembersProposal]
ItemBlueprintApproval = ApprovalRequest[ItemBlueprint]

AnyDraftPayload = Union[
    ScenarioDraftPayload,
    DevelopmentPlanDraftPayload,
    PlanAdjustmentPayload,
    CohortPathwayPayload,
    AssessmentItemsPayload,
    AssessmentReportPayload,
]
