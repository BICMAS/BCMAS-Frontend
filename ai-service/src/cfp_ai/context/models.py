"""Shared context models (AI_TECHNICAL_SPEC.md §5)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.integrations.backend.dto import (
    CapabilityLevelDTO,
    DevelopmentPlanDTO,
    DirectReportDTO,
    EmployeeDTO,
    FrameworkLevelDTO,
    LearningRecordDTO,
    RoleProfileDTO,
    SkillDTO,
)
from cfp_ai.schemas.public import ContextGap, ContextSlice, SkillGap

SUPPORTED_SLICES: frozenset[str] = frozenset(
    {
        "subject_profile",
        "role_profile",
        "framework",
        "capabilities",
        "learning_history",
        "development_plans",
        "team",
    }
)


class ContextRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    subject_employee_id: str | None
    role_id: str | None = None  # default: the subject's current role
    role_profile_version: str | None = None
    slices: frozenset[ContextSlice]
    required: frozenset[ContextSlice] = frozenset()  # missing → request fails


class CapabilityContext(BaseModel):
    """Read-only snapshot assembled from backend reads. Every slice may be absent."""

    model_config = ConfigDict(frozen=True)

    tenant_id: str
    subject_employee_id: str | None
    subject_alias: str = "the employee"  # pseudonym used in prompts
    subject: EmployeeDTO | None = None
    role_profile: RoleProfileDTO | None = None
    framework_levels: list[FrameworkLevelDTO] = Field(default_factory=list)
    skills: dict[str, SkillDTO] = Field(default_factory=dict)
    capabilities: list[CapabilityLevelDTO] | None = None
    learning_history: list[LearningRecordDTO] | None = None
    development_plans: list[DevelopmentPlanDTO] | None = None
    team: list[DirectReportDTO] | None = None
    skill_gaps: list[SkillGap] = Field(default_factory=list)
    gaps_in_context: list[ContextGap] = Field(default_factory=list)
    as_of: datetime

    def has(self, slice_name: ContextSlice) -> bool:
        return all(gap.slice != slice_name for gap in self.gaps_in_context)
