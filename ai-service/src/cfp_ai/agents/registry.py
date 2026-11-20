"""Capability registration, availability and authorisation (AI_TECHNICAL_SPEC.md §2.1, §2.6, §10.3).

Availability, per principal:
    unavailable  role not permitted · not entitled · not implemented
                 · a required backend endpoint not callable · an LLM route unusable
    degraded     an optional backend endpoint not callable
    available    otherwise
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass

from cfp_ai.agents.base import AccessRule, AgentDeps, Capability, CapabilitySpec
from cfp_ai.auth.principal import ALL_ENTITLEMENTS, Principal
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.llm.gateway import LlmGateway
from cfp_ai.schemas.public import AvailabilityReason, CapabilityStatus

_TENANT_WIDE = ("hr_ld_admin", "organisation_admin", "platform_super_admin")
CapabilityFactory = Callable[[AgentDeps], Capability]  # type: ignore[type-arg]


def _rule_matches_role(rule: AccessRule, principal: Principal) -> bool:
    if principal.type == "candidate":
        return "candidate" in rule.roles
    if principal.type != "user":
        return False
    return any(role in principal.roles for role in rule.roles)


@dataclass
class _Entry:
    spec: CapabilitySpec
    factory: CapabilityFactory | None


class CapabilityRegistry:
    def __init__(
        self,
        *,
        endpoints: BackendEndpointRegistry,
        gateway: LlmGateway,
        default_entitlements: frozenset[str],
    ) -> None:
        self._endpoints = endpoints
        self._gateway = gateway
        self._default_entitlements = default_entitlements
        self._entries: dict[str, _Entry] = {}

    # ── registration ─────────────────────────────────────────────────────

    def declare(self, specs: Iterable[CapabilitySpec]) -> None:
        for spec in specs:
            if spec.capability in self._entries:
                raise ValueError(f"capability {spec.capability} already declared")
            self._entries[spec.capability] = _Entry(spec, None)

    def implement(self, spec: CapabilitySpec, factory: CapabilityFactory) -> None:
        if not spec.implemented:
            raise ValueError(f"{spec.capability}: spec must set implemented=True")
        existing = self._entries.get(spec.capability)
        if existing and existing.factory is not None:
            raise ValueError(f"capability {spec.capability} already implemented")
        self._entries[spec.capability] = _Entry(spec, factory)

    def spec(self, capability: str) -> CapabilitySpec:
        entry = self._entries.get(capability)
        if entry is None:
            raise AppError("not_found", internal_detail=f"unknown capability {capability}")
        return entry.spec

    def implementation(self, capability: str) -> CapabilityFactory | None:
        entry = self._entries.get(capability)
        return entry.factory if entry else None

    def public_specs(self) -> list[CapabilitySpec]:
        return [e.spec for e in self._entries.values() if e.spec.public]

    # ── availability ─────────────────────────────────────────────────────

    def entitlements(self, principal: Principal) -> frozenset[str]:
        return principal.entitlements if principal.entitlements is not None else self._default_entitlements

    def status(
        self, spec: CapabilitySpec, principal: Principal
    ) -> tuple[str, list[AvailabilityReason], list[str]]:
        reasons: list[AvailabilityReason] = []
        if not any(_rule_matches_role(rule, principal) for rule in spec.access):
            reasons.append("role_not_permitted")
        if spec.entitlement is not None and spec.entitlement not in self.entitlements(principal):
            reasons.append("not_entitled")
        entry = self._entries[spec.capability]
        if not spec.implemented or entry.factory is None:
            reasons.append("ai_disabled")
        if any(not self._gateway.route_usable(route) for route in spec.llm_routes):
            if "ai_disabled" not in reasons:
                reasons.append("ai_disabled")
        missing_required = [e for e in spec.required_endpoints if not self._endpoints.is_callable(e)]
        missing_optional = [e for e in spec.optional_endpoints if not self._endpoints.is_callable(e)]
        if missing_required:
            reasons.append("backend_dependency_unconfirmed")
        if reasons:
            availability = "unavailable"
        elif missing_optional:
            availability = "degraded"
        else:
            availability = "available"
        return availability, reasons, missing_required + missing_optional

    def public_status(self, principal: Principal) -> list[CapabilityStatus]:
        result: list[CapabilityStatus] = []
        for spec in self.public_specs():
            availability, reasons, missing = self.status(spec, principal)
            result.append(
                CapabilityStatus.model_validate(
                    {
                        "capability": spec.capability,
                        "agent": spec.agent,
                        "availability": availability,
                        "reasons": reasons,
                        "missing_backend_endpoints": missing,
                    }
                )
            )
        return result

    # ── execution gate ───────────────────────────────────────────────────

    def resolve(self, capability: str, principal: Principal, deps: AgentDeps) -> Capability:  # type: ignore[type-arg]
        """Pre-checks in a fixed order, then instantiates the capability."""
        entry = self._entries.get(capability)
        if entry is None:
            raise AppError("not_found", internal_detail=f"unknown capability {capability}")
        spec = entry.spec
        _, reasons, missing = self.status(spec, principal)
        if "role_not_permitted" in reasons:
            raise AppError("forbidden", internal_detail=f"{capability}: role not permitted")
        if "not_entitled" in reasons:
            raise AppError("entitlement_required", internal_detail=f"{capability}: {spec.entitlement}")
        if "ai_disabled" in reasons or entry.factory is None:
            raise AppError(
                "ai_unavailable",
                "This AI feature isn't available yet.",
                retryable=False,
                internal_detail=f"{capability}: not implemented or no LLM route",
            )
        if "backend_dependency_unconfirmed" in reasons:
            required_missing = [e for e in missing if e in spec.required_endpoints]
            raise AppError("backend_dependency_unconfirmed", backend_endpoint_ids=required_missing)
        return entry.factory(deps)


async def authorize_subject(
    spec: CapabilitySpec, principal: Principal, subject_employee_id: str | None, deps: AgentDeps
) -> None:
    """Relation check for a subject employee (AI pre-check; the backend enforces again)."""
    for rule in spec.access:
        if not _rule_matches_role(rule, principal):
            continue
        if (
            rule.relation == "self"
            and subject_employee_id is not None
            and principal.employee_id == subject_employee_id
        ):
            return
        if rule.relation == "tenant" and principal.has_any_role(*_TENANT_WIDE):
            return
        if rule.relation == "direct_report" and subject_employee_id and principal.employee_id:
            try:
                reports = await deps.backend.get_direct_reports(principal, principal.employee_id)
            except BackendError as exc:
                if exc.kind == "not_callable":
                    raise exc.to_app_error() from exc
                continue
            if any(r.employee_id == subject_employee_id for r in reports):
                return
        if rule.relation == "assessment_scope" and principal.type == "candidate":
            return  # scope matched against the assessment by the capability itself
    raise AppError("forbidden", internal_detail=f"{spec.capability}: subject relation not satisfied")


def default_entitlements(local_env: bool, configured: list[str] | None) -> frozenset[str]:
    if configured is not None:
        return frozenset(e for e in configured if e in ALL_ENTITLEMENTS)
    return ALL_ENTITLEMENTS if local_env else frozenset()
