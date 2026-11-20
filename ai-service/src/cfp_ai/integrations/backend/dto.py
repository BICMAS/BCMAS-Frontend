"""
CFP AI Service — expected backend data contracts (Pydantic v2)

Status:  PROPOSED. EVERY MODEL IN THIS FILE REQUIRES CONFIRMATION BY THE BACKEND TEAM.
         None of these endpoints or payloads is known to exist. They describe the
         minimum data the AI service needs. If the backend's real resources differ,
         an adapter maps them onto these models; the AI agents depend only on these
         models, never on raw backend payloads.

Spec:    docs/ai/BACKEND_INTEGRATION_SPEC.md (endpoint IDs BE-xxx)
Registry: docs/ai/contracts/backend-endpoints.registry.yaml

Design notes
  - `extra="ignore"`: the backend may return more fields than we need; we must not
    break when it does. Missing *required* fields are a contract violation and are
    reported as `upstream_unavailable` with the endpoint ID.
  - Levels are integers on the tenant scale (requirement R2).
  - Skill references are IDs (requirement R1).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class BackendDTO(BaseModel):
    """Tolerant base for data received from the backend."""

    model_config = ConfigDict(extra="ignore", frozen=True)


Level = Annotated[int, Field(ge=1, le=10)]

# ─────────────────────────────────────────────────────────────────────────────
# Identity (BE-001 … BE-006)
# ─────────────────────────────────────────────────────────────────────────────


class AccessTokenClaims(BackendDTO):
    """Claims the AI service requires in a backend-issued JWT.  [PROPOSED — BE-001]"""

    iss: str
    aud: str | list[str]
    sub: str
    tenant_id: str
    roles: list[str]
    employee_id: str | None = None
    exp: int
    iat: int
    jti: str | None = None
    scope: str | None = None  # candidates: "assessment:{assessment_id}"
    ai_entitlements: list[str] | None = None  # optional alternative to BE-005


class MeDTO(BackendDTO):
    """GET /me  [PROPOSED — BE-004]"""

    user_id: str
    employee_id: str | None
    tenant_id: str
    roles: list[str]


class TenantEntitlementsDTO(BackendDTO):
    """GET /tenants/{tenant_id}/entitlements  [PROPOSED — BE-005]"""

    ai_coaching: bool
    ai_dev_plans: bool
    ai_talent_assessment: bool
    ai_monthly_token_budget: int | None = None


# ─────────────────────────────────────────────────────────────────────────────
# People (BE-010, BE-011)
# ─────────────────────────────────────────────────────────────────────────────


class DepartmentRef(BackendDTO):
    id: str
    name: str


class EmployeeDTO(BackendDTO):
    """GET /employees/{employee_id}  [PROPOSED — BE-010]"""

    id: str
    user_id: str | None
    tenant_id: str
    name: str
    job_title: str | None
    department: DepartmentRef | None
    role_id: str | None
    role_profile_version: str | None
    manager_id: str | None
    joined_at: datetime | None = None


class DirectReportDTO(BackendDTO):
    """Item of GET /managers/{manager_id}/direct-reports  [PROPOSED — BE-011]"""

    employee_id: str
    name: str
    role_id: str | None


class OrgUnitDTO(BackendDTO):
    """Item of GET /org/units?parent_id={id}&updated_since={ts}  [PROPOSED — BE-012, v1.6]

    Organisational structure: department/team hierarchy with the unit manager. Returned
    filtered to the units the caller may see.
    """

    id: str
    name: str
    type: Literal["organisation", "division", "department", "team"]
    parent_id: str | None
    manager_employee_id: str | None
    headcount: int | None = None
    updated_at: datetime


class PerformanceGoalDTO(BackendDTO):
    title: str
    status: Literal["not_started", "on_track", "at_risk", "achieved", "missed"]
    rating: str | None = None  # the tenant's own rating label; None when not visible to the caller


class PerformanceSummaryDTO(BackendDTO):
    """GET /employees/{employee_id}/performance-summary  [PROPOSED — BE-032, v1.6]

    Authorised performance information only. The backend applies field-level permissions
    for the caller and states what was withheld; free-text review comments are never sent.
    """

    employee_id: str
    period: str
    visibility: Literal["full", "summary", "none"]
    goals: list[PerformanceGoalDTO] = []
    overall_rating: str | None = None
    withheld_fields: list[str] = []
    as_of: datetime


# ─────────────────────────────────────────────────────────────────────────────
# Competency framework (BE-020 … BE-023)
# ─────────────────────────────────────────────────────────────────────────────


class FrameworkLevelDTO(BackendDTO):
    """Item of GET /framework/levels  [PROPOSED — BE-020]"""

    level: Level
    label: str
    description: str | None


class IndicatorDTO(BackendDTO):
    id: str
    text: str


class SkillLevelDTO(BackendDTO):
    level: Level
    label: str
    description: str | None
    indicators: list[IndicatorDTO]  # requirement R6


class SkillDTO(BackendDTO):
    """GET /skills, GET /skills/{skill_id}  [PROPOSED — BE-021, BE-022]"""

    id: str
    name: str
    description: str | None
    category: Literal["technical", "behavioural", "knowledge"]
    status: Literal["draft", "awaiting_review", "published", "archived"]
    version: str
    levels: list[SkillLevelDTO]
    updated_at: datetime


class JobDescriptionDTO(BackendDTO):
    text: str
    source: Literal["uploaded", "pasted", "authored"]
    file_id: str | None = None
    updated_at: datetime


class RoleDTO(BackendDTO):
    """GET /roles/{role_id}, GET /roles  [PROPOSED — BE-024, BE-025]"""

    id: str
    title: str
    department: DepartmentRef | None
    status: Literal["draft", "awaiting_review", "approved", "changes_requested", "published"]
    current_profile_version: str | None
    overview: str | None
    job_description: JobDescriptionDTO | None
    employee_count: int | None = None
    updated_at: datetime


class RoleRequirementDTO(BackendDTO):
    skill_id: str
    required_level: Level
    category: Literal["technical", "behavioural", "knowledge"]
    weight: float | None = None


class RoleProfileDTO(BackendDTO):
    """GET /roles/{role_id}/profile?version=  [PROPOSED — BE-023]"""

    role_id: str
    title: str
    version: str
    status: Literal["draft", "awaiting_review", "approved", "changes_requested", "published"]
    requirements: list[RoleRequirementDTO]


# ─────────────────────────────────────────────────────────────────────────────
# Capability state (BE-030, BE-031)
# ─────────────────────────────────────────────────────────────────────────────


class CapabilityLevelDTO(BackendDTO):
    """Item of GET /employees/{employee_id}/capabilities  [PROPOSED — BE-030]"""

    skill_id: str
    verified_level: Level | None
    verified_at: datetime | None
    verified_by: str | None
    self_assessed_level: Level | None
    self_assessed_at: datetime | None
    evidence_ids: list[str] = []


class AssessmentHistoryDTO(BackendDTO):
    """Item of GET /employees/{employee_id}/assessment-history  [PROPOSED — BE-031]"""

    cycle_id: str
    skill_id: str
    self_rating: Level | None
    manager_rating: Level | None
    final_level: Level | None
    completed_at: datetime | None


# ─────────────────────────────────────────────────────────────────────────────
# Learning (BE-040 … BE-042)
# ─────────────────────────────────────────────────────────────────────────────


class CatalogueItemDTO(BackendDTO):
    """GET /learning/catalogue, GET /learning/catalogue/{item_id}  [PROPOSED — BE-040, BE-041]"""

    id: str
    title: str
    description: str | None
    kind: str
    provider: str | None
    format: str | None
    duration_minutes: int | None
    skill_ids: list[str]
    target_levels: list[Level] = []
    tags: list[str] = []
    status: Literal["active", "retired"]
    scenario_id: str | None = None  # set when kind == "ai_coaching" (BE-082)
    updated_at: datetime


class LearningRecordDTO(BackendDTO):
    """Item of GET /employees/{employee_id}/learning-records  [PROPOSED — BE-042]

    Covers all training records: catalogue courses, workshops, certifications,
    external training, and AI coaching practice (if the backend adopts BE-081).
    """

    id: str
    record_type: Literal["course", "workshop", "certification", "external", "ai_coaching"]
    source: Literal["catalogue", "external", "ai_coaching"]
    catalogue_item_id: str | None  # required when source == "catalogue"
    title: str
    provider: str | None = None
    skill_ids: list[str] = []
    status: Literal["enrolled", "in_progress", "completed", "withdrawn", "expired"]
    progress_pct: int | None
    started_at: datetime | None = None
    completed_at: datetime | None
    expires_at: datetime | None = None  # certifications


# ─────────────────────────────────────────────────────────────────────────────
# Development plans (BE-050 … BE-053)
# ─────────────────────────────────────────────────────────────────────────────


class ProvenanceDTO(BackendDTO):
    """`source` field on backend resources created from AI drafts.  [PROPOSED — §6 of spec]"""

    type: Literal["manual", "ai", "ai_edited"]
    draft_id: str | None = None
    model: str | None = None
    prompt_version: str | None = None


class PlanActionDTO(BackendDTO):
    id: str
    type: str
    title: str
    catalogue_item_id: str | None
    scenario_id: str | None
    status: Literal["not_started", "in_progress", "done"]
    due_date: datetime | None


class PlanGoalDTO(BackendDTO):
    id: str
    skill_id: str
    from_level: int
    to_level: Level
    objective: str
    due_date: datetime | None
    progress_pct: int | None
    actions: list[PlanActionDTO]


class DevelopmentPlanDTO(BackendDTO):
    """GET /development-plans?employee_id=, GET /development-plans/{plan_id}  [PROPOSED — BE-050, BE-051]"""

    id: str
    employee_id: str
    status: Literal["draft", "active", "completed", "archived"]
    owner_id: str | None
    goals: list[PlanGoalDTO]
    source: ProvenanceDTO | None
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# Talent assessment (BE-060 … BE-067)
# ─────────────────────────────────────────────────────────────────────────────


class AssessmentSubjectDTO(BackendDTO):
    type: Literal["candidate", "employee"]
    id: str


class RubricRowDTO(BackendDTO):
    row_id: str
    skill_id: str
    required_level: Level
    score: int | None
    score_source: Literal["human", "ai_accepted", "ai_overridden"] | None = None


class TalentAssessmentDTO(BackendDTO):
    """GET /talent/assessments/{assessment_id}  [PROPOSED — BE-060]"""

    id: str
    # "development" (v1.4, PROPOSED): an internal capability assessment of an employee.
    type: Literal["recruitment", "promotion", "development"]
    subject: AssessmentSubjectDTO
    role_id: str
    role_profile_version: str
    status: str
    rubric_version: str
    rubric: list[RubricRowDTO]
    library_item_ids: list[str]
    created_by: str
    title: str | None = None  # v1.4, PROPOSED
    objectives: list[str] = []  # v1.4, PROPOSED: assessment objectives shown in reports


class AssessmentResponseDTO(BackendDTO):
    """Item of GET /talent/assessments/{assessment_id}/responses  [PROPOSED — BE-061]"""

    item_id: str
    library_item_id: str
    item_type: str
    response_text: str | None
    file_ids: list[str] = []
    submitted_at: datetime
    # v1.4, PROPOSED (additive): who answered, an SJT choice, a self/manager proficiency rating.
    respondent: Literal["subject", "manager", "assessor"] = "subject"
    selected_option_key: str | None = None
    rating: Level | None = None


class LibraryItemDTO(BackendDTO):
    """Item of GET /talent/library  [PROPOSED — BE-064]"""

    id: str
    title: str
    type: str
    skill_id: str
    target_level: Level | None
    content: dict[str, Any] | None
    reusable_role_ids: list[str] = []
    scenario_id: str | None = None  # for type == "ai_roleplay"
    updated_at: datetime


class AssessmentItemOptionDTO(BackendDTO):
    option_key: str
    text: str
    score: int  # 1-5, keyed by the assessment designer
    indicator_ids: list[str] = []


class MarkingBandDTO(BackendDTO):
    level: Level
    descriptor: str
    indicator_ids: list[str] = []


class AssessmentItemDTO(BackendDTO):
    """Item of GET /talent/assessments/{assessment_id}/items  [PROPOSED — BE-068, v1.4]

    The instrument pinned to an assessment: questions, keyed options, marking guides and the
    indicators each item is designed to evidence. Read with the assessor's token.
    """

    library_item_id: str
    type: str
    title: str
    stem: str
    skill_ids: list[str]
    target_level: Level | None
    expected_indicator_ids: list[str] = []
    options: list[AssessmentItemOptionDTO] | None = None
    marking_guide: list[MarkingBandDTO] = []
    respondent: Literal["subject", "manager", "assessor"] = "subject"


# ─────────────────────────────────────────────────────────────────────────────
# Evidence (BE-070, BE-071)
# ─────────────────────────────────────────────────────────────────────────────


class EvidenceFileDTO(BackendDTO):
    id: str
    name: str
    mime: str
    size: int


class EvidenceDTO(BackendDTO):
    """GET /evidence/{evidence_id}  [PROPOSED — BE-070]"""

    id: str
    employee_id: str
    skill_id: str
    note: str | None
    file: EvidenceFileDTO | None
    status: Literal["awaiting_review", "verified", "more_evidence", "not_verified"]
    submitted_at: datetime


# ─────────────────────────────────────────────────────────────────────────────
# Requests the AI service itself sends to the backend (writes)
# ─────────────────────────────────────────────────────────────────────────────


class RoleplayTranscriptSubmission(BaseModel):
    """POST /talent/assessments/{assessment_id}/responses  [PROPOSED — BE-062]

    The only backend write performed by the AI service in v1. It is sent with the
    participant's own token so that the transcript cannot be altered client-side.
    """

    model_config = ConfigDict(extra="forbid")

    library_item_id: str
    item_type: Literal["ai_roleplay"] = "ai_roleplay"
    transcript: list[dict[str, str]]  # [{role, text, created_at}]
    roleplay_id: str
    started_at: datetime
    ended_at: datetime
    source: ProvenanceDTO


# ─────────────────────────────────────────────────────────────────────────────
# Events — Backend → AI  (delivered to POST /v1/events)  [PROPOSED — BE-080]
# ─────────────────────────────────────────────────────────────────────────────

BackendEventType = Literal[
    "framework.skill.updated",
    "framework.skill.published",
    "role.profile.published",
    "learning.catalogue.updated",
    "talent.library.updated",
    "employee.role.changed",
    "capability.verified",
    "evidence.submitted",
    "learning.record.completed",
    "assessment.cycle.completed",
    "talent.assessment.submitted",
    "development_plan.created",
    "development_plan.updated",
    "tenant.entitlements.changed",
    "employee.deleted",
    "user.erasure_requested",
]


class EventSubject(BackendDTO):
    type: str
    id: str


class BackendEvent(BackendDTO):
    event_id: str
    type: BackendEventType
    tenant_id: str
    occurred_at: datetime
    subject: EventSubject
    data: dict[str, Any]


# ─────────────────────────────────────────────────────────────────────────────
# Events — AI → Backend (sent to POST /integrations/ai/events)  [PROPOSED — BE-081]
# ─────────────────────────────────────────────────────────────────────────────

AiOutboundEventType = Literal[
    "coaching.session.completed",
    "ai.recommendation.available",
    "ai.job.failed",
]


class AiOutboundEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    type: AiOutboundEventType
    tenant_id: str
    occurred_at: datetime
    subject: dict[str, str]
    data: dict[str, Any]


class CoachingSessionCompletedData(BaseModel):
    """`data` of coaching.session.completed. Practice signal only — never a verified level."""

    model_config = ConfigDict(extra="forbid")

    employee_id: str
    session_id: str
    scenario_id: str
    skill_ids: list[str]
    practice_score: Annotated[int, Field(ge=0, le=100)]
    duration_s: int
    completed_at: datetime
