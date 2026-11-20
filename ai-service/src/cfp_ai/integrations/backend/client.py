"""Backend client interface.

Agents and the context builder depend only on ``BackendClient`` and the DTOs in
``dto.py`` (all PROPOSED). Two implementations exist:

* ``HttpBackendClient`` (``http_client.py``) — the conventional backend, or a
  contract-mock server in dev;
* ``MockBackendClient`` (``mock/``) — in-process, dev/test only, never shipped in
  the production image.

Every method is called *as the principal*: the principal's token is forwarded,
so the backend's own authorisation decides what is visible.
"""

from __future__ import annotations

from typing import Protocol

from cfp_ai.auth.principal import Principal
from cfp_ai.integrations.backend.dto import (
    AiOutboundEvent,
    AssessmentHistoryDTO,
    AssessmentItemDTO,
    AssessmentResponseDTO,
    CapabilityLevelDTO,
    CatalogueItemDTO,
    DevelopmentPlanDTO,
    DirectReportDTO,
    EmployeeDTO,
    FrameworkLevelDTO,
    LearningRecordDTO,
    LibraryItemDTO,
    MeDTO,
    OrgUnitDTO,
    PerformanceSummaryDTO,
    RoleDTO,
    RoleProfileDTO,
    SkillDTO,
    TalentAssessmentDTO,
    TenantEntitlementsDTO,
)

# Method → endpoint ID (BACKEND_INTEGRATION_SPEC.md). Used for registry checks and telemetry.
ENDPOINTS: dict[str, str] = {
    "get_me": "BE-004",
    "get_employee": "BE-010",
    "get_direct_reports": "BE-011",
    "get_framework_levels": "BE-020",
    "get_skill": "BE-022",
    "get_role_profile": "BE-023",
    "get_role": "BE-024",
    "get_capabilities": "BE-030",
    "get_assessment_history": "BE-031",
    "list_catalogue": "BE-040",
    "get_catalogue_item": "BE-041",
    "get_learning_records": "BE-042",
    "get_development_plans": "BE-050",
    "get_development_plan": "BE-051",
    "get_assessment": "BE-060",
    "get_assessment_responses": "BE-061",
    "get_assessment_items": "BE-068",
    "list_org_units": "BE-012",
    "search_skills": "BE-026",
    "get_performance_summary": "BE-032",
}

# Service-identity methods (ServiceBackendClient) → endpoint ID.
SERVICE_ENDPOINTS: dict[str, str] = {
    "list_skills_index": "BE-021",
    "list_roles_index": "BE-025",
    "list_library": "BE-064",
    "get_tenant_entitlements": "BE-005",
    "publish_event": "BE-081",
}


class BackendClient(Protocol):
    async def get_me(self, principal: Principal) -> MeDTO: ...

    async def get_employee(self, principal: Principal, employee_id: str) -> EmployeeDTO: ...

    async def get_direct_reports(self, principal: Principal, manager_id: str) -> list[DirectReportDTO]: ...

    async def get_framework_levels(self, principal: Principal) -> list[FrameworkLevelDTO]: ...

    async def get_skill(self, principal: Principal, skill_id: str) -> SkillDTO: ...

    async def get_role_profile(
        self, principal: Principal, role_id: str, version: str | None = None
    ) -> RoleProfileDTO: ...

    async def get_role(self, principal: Principal, role_id: str) -> RoleDTO: ...

    async def get_capabilities(self, principal: Principal, employee_id: str) -> list[CapabilityLevelDTO]: ...

    async def get_assessment_history(
        self, principal: Principal, employee_id: str
    ) -> list[AssessmentHistoryDTO]: ...

    async def list_catalogue(
        self, principal: Principal, skill_ids: list[str] | None = None
    ) -> list[CatalogueItemDTO]: ...

    async def get_catalogue_item(self, principal: Principal, item_id: str) -> CatalogueItemDTO: ...

    async def get_learning_records(
        self, principal: Principal, employee_id: str
    ) -> list[LearningRecordDTO]: ...

    async def get_development_plans(
        self, principal: Principal, employee_id: str
    ) -> list[DevelopmentPlanDTO]: ...

    async def get_assessment(self, principal: Principal, assessment_id: str) -> TalentAssessmentDTO: ...

    async def get_assessment_responses(
        self, principal: Principal, assessment_id: str
    ) -> list[AssessmentResponseDTO]: ...

    async def get_assessment_items(self, principal: Principal, assessment_id: str) -> list[AssessmentItemDTO]:
        """BE-068 (PROPOSED, v1.4): the instrument pinned to the assessment."""
        ...

    async def get_development_plan(self, principal: Principal, plan_id: str) -> DevelopmentPlanDTO: ...

    # v1.6 interfaces for documented gaps (PROPOSED; not connected until the backend confirms them)
    async def list_org_units(self, principal: Principal, parent_id: str | None = None) -> list[OrgUnitDTO]:
        """BE-012: organisational structure visible to the caller."""
        ...

    async def search_skills(
        self, principal: Principal, query: str | None = None, category: str | None = None
    ) -> list[SkillDTO]:
        """BE-026: competency dictionary with the user's token."""
        ...

    async def get_performance_summary(self, principal: Principal, employee_id: str) -> PerformanceSummaryDTO:
        """BE-032: authorised performance information (field-level permissions applied by the backend)."""
        ...

    async def aclose(self) -> None: ...


class ServiceBackendClient(Protocol):
    """Service-identity calls (BE-003 client credentials). Never given to agents: no user data here."""

    async def list_skills_index(self, tenant_id: str, updated_since: str | None = None) -> list[SkillDTO]: ...

    async def list_roles_index(self, tenant_id: str, updated_since: str | None = None) -> list[RoleDTO]: ...

    async def list_library(
        self, tenant_id: str, updated_since: str | None = None
    ) -> list[LibraryItemDTO]: ...

    async def get_tenant_entitlements(self, tenant_id: str) -> TenantEntitlementsDTO: ...

    async def publish_event(self, event: AiOutboundEvent) -> None: ...
