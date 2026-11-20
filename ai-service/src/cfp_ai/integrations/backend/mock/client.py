"""In-process mock implementation of ``BackendClient`` — DEV/TEST ONLY.

It enforces the authorisation the real backend is expected to enforce
(BACKEND_HANDOVER.md §5.1), so AI code is exercised against realistic 403/404s:
  * other tenants' data → not_found;
  * employees see themselves; line managers see direct reports;
  * hr_ld_admin / organisation_admin / platform_super_admin see the tenant;
  * candidates see no employee data.
It also honours the endpoint registry, and supports fault injection for tests.
"""

from __future__ import annotations

import copy
from collections.abc import Mapping
from typing import Any, TypeVar

from pydantic import BaseModel

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
from cfp_ai.integrations.backend.errors import BackendError, BackendErrorKind
from cfp_ai.integrations.backend.mock import data
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.settings import Environment

DtoT = TypeVar("DtoT", bound=BaseModel)
_TENANT_WIDE_ROLES = ("hr_ld_admin", "organisation_admin", "platform_super_admin")


class MockBackendClient:
    def __init__(
        self,
        *,
        registry: BackendEndpointRegistry,
        environment: Environment,
        faults: Mapping[str, BackendErrorKind] | None = None,
    ) -> None:
        if not environment.is_local:
            raise RuntimeError("MockBackendClient is only allowed in dev/test")
        self._registry = registry
        self.faults: dict[str, BackendErrorKind] = dict(faults or {})
        self.calls: list[tuple[str, str]] = []  # (endpoint_id, principal subject) — for tests
        self.published_events: list[AiOutboundEvent] = []

    async def aclose(self) -> None:
        return None

    # ── helpers ──────────────────────────────────────────────────────────

    def _enter(self, endpoint_id: str, principal: Principal) -> None:
        self.calls.append((endpoint_id, principal.subject))
        if not self._registry.is_callable(endpoint_id):
            raise BackendError(endpoint_id, "not_callable", f"status={self._registry.status(endpoint_id)}")
        if fault := self.faults.get(endpoint_id):
            raise BackendError(endpoint_id, fault, "injected fault")

    @staticmethod
    def _dto(model: type[DtoT], raw: Mapping[str, Any]) -> DtoT:
        return model.model_validate(copy.deepcopy(dict(raw)))

    def _employee_visible(self, endpoint_id: str, principal: Principal, employee_id: str) -> dict[str, Any]:
        employee = data.EMPLOYEES.get(employee_id)
        if employee is None or employee["tenant_id"] != principal.tenant_id:
            raise BackendError(endpoint_id, "not_found", employee_id)
        if principal.type != "user":
            raise BackendError(endpoint_id, "forbidden", "non-user principal")
        if principal.has_any_role(*_TENANT_WIDE_ROLES):
            return employee
        if principal.employee_id == employee_id:
            return employee
        if principal.has_any_role("line_manager") and employee["manager_id"] == principal.employee_id:
            return employee
        raise BackendError(endpoint_id, "forbidden", employee_id)

    def _tenant_reference(self, endpoint_id: str, principal: Principal) -> None:
        if principal.tenant_id not in (data.TENANT, data.OTHER_TENANT):
            raise BackendError(endpoint_id, "forbidden", "unknown tenant")

    def _only_home_tenant(self, endpoint_id: str, principal: Principal, key: str) -> None:
        # Seed framework/catalogue data belongs to org-gec only.
        if principal.tenant_id != data.TENANT:
            raise BackendError(endpoint_id, "not_found", key)

    # ── BackendClient ────────────────────────────────────────────────────

    async def get_me(self, principal: Principal) -> MeDTO:
        self._enter("BE-004", principal)
        return MeDTO(
            user_id=principal.subject,
            employee_id=principal.employee_id,
            tenant_id=principal.tenant_id,
            roles=sorted(principal.roles),
        )

    async def get_employee(self, principal: Principal, employee_id: str) -> EmployeeDTO:
        self._enter("BE-010", principal)
        return self._dto(EmployeeDTO, self._employee_visible("BE-010", principal, employee_id))

    async def get_direct_reports(self, principal: Principal, manager_id: str) -> list[DirectReportDTO]:
        self._enter("BE-011", principal)
        if not (principal.employee_id == manager_id or principal.has_any_role(*_TENANT_WIDE_ROLES)):
            raise BackendError("BE-011", "forbidden", manager_id)
        return [
            DirectReportDTO(employee_id=e["id"], name=e["name"], role_id=e["role_id"])
            for e in data.EMPLOYEES.values()
            if e["manager_id"] == manager_id and e["tenant_id"] == principal.tenant_id
        ]

    async def get_framework_levels(self, principal: Principal) -> list[FrameworkLevelDTO]:
        self._enter("BE-020", principal)
        self._only_home_tenant("BE-020", principal, "levels")
        return [self._dto(FrameworkLevelDTO, lvl) for lvl in data.FRAMEWORK_LEVELS]

    async def get_skill(self, principal: Principal, skill_id: str) -> SkillDTO:
        self._enter("BE-022", principal)
        self._only_home_tenant("BE-022", principal, skill_id)
        if skill_id not in data.SKILLS:
            raise BackendError("BE-022", "not_found", skill_id)
        return self._dto(SkillDTO, data.SKILLS[skill_id])

    async def get_role_profile(
        self, principal: Principal, role_id: str, version: str | None = None
    ) -> RoleProfileDTO:
        self._enter("BE-023", principal)
        self._only_home_tenant("BE-023", principal, role_id)
        profile = data.ROLE_PROFILES.get(role_id)
        if profile is None or (version is not None and profile["version"] != version):
            raise BackendError("BE-023", "not_found", f"{role_id}@{version}")
        return self._dto(RoleProfileDTO, profile)

    async def get_role(self, principal: Principal, role_id: str) -> RoleDTO:
        self._enter("BE-024", principal)
        self._only_home_tenant("BE-024", principal, role_id)
        if role_id not in data.ROLES:
            raise BackendError("BE-024", "not_found", role_id)
        return self._dto(RoleDTO, data.ROLES[role_id])

    async def get_capabilities(self, principal: Principal, employee_id: str) -> list[CapabilityLevelDTO]:
        self._enter("BE-030", principal)
        self._employee_visible("BE-030", principal, employee_id)
        return [self._dto(CapabilityLevelDTO, c) for c in data.CAPABILITIES.get(employee_id, [])]

    async def get_assessment_history(
        self, principal: Principal, employee_id: str
    ) -> list[AssessmentHistoryDTO]:
        self._enter("BE-031", principal)
        self._employee_visible("BE-031", principal, employee_id)
        return [self._dto(AssessmentHistoryDTO, h) for h in data.ASSESSMENT_HISTORY.get(employee_id, [])]

    async def get_catalogue_item(self, principal: Principal, item_id: str) -> CatalogueItemDTO:
        self._enter("BE-041", principal)
        self._only_home_tenant("BE-041", principal, item_id)
        if item_id not in data.CATALOGUE:
            raise BackendError("BE-041", "not_found", item_id)
        return self._dto(CatalogueItemDTO, data.CATALOGUE[item_id])

    async def get_learning_records(self, principal: Principal, employee_id: str) -> list[LearningRecordDTO]:
        self._enter("BE-042", principal)
        self._employee_visible("BE-042", principal, employee_id)
        return [self._dto(LearningRecordDTO, r) for r in data.LEARNING_RECORDS.get(employee_id, [])]

    async def get_development_plans(self, principal: Principal, employee_id: str) -> list[DevelopmentPlanDTO]:
        self._enter("BE-050", principal)
        self._employee_visible("BE-050", principal, employee_id)
        return [self._dto(DevelopmentPlanDTO, p) for p in data.DEVELOPMENT_PLANS.get(employee_id, [])]

    def _assessment_visible(
        self, endpoint_id: str, principal: Principal, assessment_id: str
    ) -> dict[str, Any]:
        assessment = data.TALENT_ASSESSMENTS.get(assessment_id)
        if assessment is None or principal.tenant_id != data.TENANT:
            raise BackendError(endpoint_id, "not_found", assessment_id)
        if principal.type == "candidate":
            if f"assessment:{assessment_id}" in principal.scopes:
                return assessment
            raise BackendError(endpoint_id, "forbidden", assessment_id)
        if principal.has_any_role(*_TENANT_WIDE_ROLES):
            return assessment
        subject = assessment["subject"]
        if (
            assessment["type"] in ("promotion", "development")
            and principal.has_any_role("line_manager")
            and data.EMPLOYEES.get(subject["id"], {}).get("manager_id") == principal.employee_id
        ):
            return assessment
        raise BackendError(endpoint_id, "forbidden", assessment_id)

    async def get_assessment(self, principal: Principal, assessment_id: str) -> TalentAssessmentDTO:
        self._enter("BE-060", principal)
        return self._dto(TalentAssessmentDTO, self._assessment_visible("BE-060", principal, assessment_id))

    async def get_assessment_responses(
        self, principal: Principal, assessment_id: str
    ) -> list[AssessmentResponseDTO]:
        self._enter("BE-061", principal)
        self._assessment_visible("BE-061", principal, assessment_id)
        return [self._dto(AssessmentResponseDTO, r) for r in data.ASSESSMENT_RESPONSES.get(assessment_id, [])]

    async def get_assessment_items(self, principal: Principal, assessment_id: str) -> list[AssessmentItemDTO]:
        self._enter("BE-068", principal)
        assessment = self._assessment_visible("BE-068", principal, assessment_id)
        if principal.type == "candidate":  # participants never see keyed options or marking guides
            raise BackendError("BE-068", "forbidden", assessment_id)
        return [
            self._dto(AssessmentItemDTO, data.ASSESSMENT_ITEMS[i])
            for i in assessment["library_item_ids"]
            if i in data.ASSESSMENT_ITEMS
        ]

    async def list_catalogue(
        self, principal: Principal, skill_ids: list[str] | None = None
    ) -> list[CatalogueItemDTO]:
        self._enter("BE-040", principal)
        if principal.tenant_id != data.TENANT:
            return []
        wanted = set(skill_ids or [])
        return [
            self._dto(CatalogueItemDTO, item)
            for item in data.CATALOGUE.values()
            if item["status"] == "active" and (not wanted or wanted & set(item["skill_ids"]))
        ]

    async def get_development_plan(self, principal: Principal, plan_id: str) -> DevelopmentPlanDTO:
        self._enter("BE-051", principal)
        for employee_id, plans in data.DEVELOPMENT_PLANS.items():
            for plan in plans:
                if plan["id"] == plan_id:
                    self._employee_visible("BE-051", principal, employee_id)
                    return self._dto(DevelopmentPlanDTO, plan)
        raise BackendError("BE-051", "not_found", plan_id)

    # ── v1.6 gap interfaces (dev/test data only) ─────────────────────────

    async def list_org_units(self, principal: Principal, parent_id: str | None = None) -> list[OrgUnitDTO]:
        self._enter("BE-012", principal)
        self._only_home_tenant("BE-012", principal, "org")
        return [
            self._dto(OrgUnitDTO, u)
            for u in data.ORG_UNITS
            if parent_id is None or u["parent_id"] == parent_id
        ]

    async def search_skills(
        self, principal: Principal, query: str | None = None, category: str | None = None
    ) -> list[SkillDTO]:
        self._enter("BE-026", principal)
        self._only_home_tenant("BE-026", principal, "skills")
        needle = (query or "").lower()
        return [
            self._dto(SkillDTO, s)
            for s in data.SKILLS.values()
            if s["status"] == "published"
            and (not needle or needle in s["name"].lower() or needle in s["description"].lower())
            and (category is None or s["category"] == category)
        ]

    async def get_performance_summary(self, principal: Principal, employee_id: str) -> PerformanceSummaryDTO:
        self._enter("BE-032", principal)
        self._employee_visible("BE-032", principal, employee_id)
        raw = data.PERFORMANCE.get(employee_id)
        if raw is None:
            raise BackendError("BE-032", "not_found", employee_id)
        summary = copy.deepcopy(raw)
        if principal.employee_id == employee_id and not principal.has_any_role(*_TENANT_WIDE_ROLES):
            # Field-level permission (illustrative): employees see goal status, not ratings.
            summary.update(
                visibility="summary", overall_rating=None, withheld_fields=["overall_rating", "goals.rating"]
            )
            summary["goals"] = [{**g, "rating": None} for g in summary["goals"]]
        return self._dto(PerformanceSummaryDTO, summary)

    # ── ServiceBackendClient (dev/test) ──────────────────────────────────

    def _service(self, endpoint_id: str, tenant_id: str) -> None:
        self.calls.append((endpoint_id, f"service:{tenant_id}"))
        if not self._registry.is_callable(endpoint_id) or not self._registry.is_callable("BE-003"):
            raise BackendError(endpoint_id, "not_callable", "service identity not available")

    async def list_skills_index(self, tenant_id: str, updated_since: str | None = None) -> list[SkillDTO]:
        self._service("BE-021", tenant_id)
        return [self._dto(SkillDTO, s) for s in data.SKILLS.values()] if tenant_id == data.TENANT else []

    async def list_roles_index(self, tenant_id: str, updated_since: str | None = None) -> list[RoleDTO]:
        self._service("BE-025", tenant_id)
        return [self._dto(RoleDTO, r) for r in data.ROLES.values()] if tenant_id == data.TENANT else []

    async def list_library(self, tenant_id: str, updated_since: str | None = None) -> list[LibraryItemDTO]:
        self._service("BE-064", tenant_id)
        return []

    async def get_tenant_entitlements(self, tenant_id: str) -> TenantEntitlementsDTO:
        self._service("BE-005", tenant_id)
        return TenantEntitlementsDTO(ai_coaching=True, ai_dev_plans=True, ai_talent_assessment=True)

    async def publish_event(self, event: AiOutboundEvent) -> None:
        self._service("BE-081", event.tenant_id)
        self.published_events.append(event)
