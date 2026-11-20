from __future__ import annotations

import pytest

from cfp_ai.context.builder import ContextBuilder
from cfp_ai.context.cache import TtlCache
from cfp_ai.context.gaps import compute_gaps
from cfp_ai.context.models import ContextRequest
from cfp_ai.context.render import render_context
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.dto import CapabilityLevelDTO, RoleRequirementDTO
from cfp_ai.integrations.backend.mock.client import MockBackendClient
from cfp_ai.settings import Environment
from tests.conftest import make_principal
from tests.test_backend import registry

ALL = frozenset({"subject_profile", "role_profile", "framework", "capabilities", "learning_history"})


def _req(
    skill: str, level: int, category: str = "technical", weight: float | None = None
) -> RoleRequirementDTO:
    return RoleRequirementDTO(skill_id=skill, required_level=level, category=category, weight=weight)


def _cap(skill: str, verified: int | None, self_assessed: int | None = None) -> CapabilityLevelDTO:
    return CapabilityLevelDTO(
        skill_id=skill,
        verified_level=verified,
        verified_at=None,
        verified_by=None,
        self_assessed_level=self_assessed,
        self_assessed_at=None,
    )


def test_gap_rules_and_ordering() -> None:
    gaps = compute_gaps(
        [
            _req("a", 4),
            _req("b", 4, weight=1.5),
            _req("c", 3),
            _req("d", 3, "behavioural"),
            _req("e", 3),
            _req("f", 3),
        ],
        [_cap("a", 2), _cap("b", 3), _cap("c", 2), _cap("d", None), _cap("e", 3, 2), _cap("f", 4)],
        {},
    )
    by_id = {g.skill_id: g for g in gaps}
    assert by_id["a"].priority == "critical" and by_id["a"].gap == 2
    assert by_id["b"].priority == "high"  # gap 1, weight 1.5
    assert by_id["c"].priority == "medium"  # gap 1, verified, normal weight
    assert by_id["d"].priority == "critical"  # never verified → gap = required
    assert by_id["e"].priority == "low"  # met, but self-assessed below
    assert "f" not in by_id  # met and no self-assessment concern
    # critical: technical before behavioural; then high, medium, low
    assert [g.skill_id for g in gaps] == ["a", "d", "b", "c", "e"]


@pytest.fixture
def builder() -> ContextBuilder:
    return ContextBuilder(
        backend=MockBackendClient(registry=registry(), environment=Environment.TEST), cache=TtlCache()
    )


async def test_builds_full_context_for_self(builder: ContextBuilder) -> None:
    ctx = await builder.build(
        make_principal("james"), ContextRequest(subject_employee_id="emp-8721", slices=ALL)
    )
    assert ctx.gaps_in_context == []
    assert ctx.role_profile is not None and ctx.role_profile.role_id == "role-ssa"
    assert set(ctx.skills) == {"skl-cloud", "skl-api-gov", "skl-microservices", "skl-influence"}
    assert ctx.skill_gaps[0].skill_id == "skl-api-gov"  # never verified, required 4 → critical
    rendered = render_context(ctx)
    assert "James Miller" not in rendered  # pseudonymised
    assert "the employee" in rendered
    assert render_context(ctx) == rendered  # deterministic


async def test_optional_slice_failure_becomes_context_gap(builder: ContextBuilder) -> None:
    ctx = await builder.build(
        make_principal("michael"), ContextRequest(subject_employee_id="emp-7310", slices=ALL)
    )
    reasons = {g.slice: g.reason for g in ctx.gaps_in_context}
    assert reasons["subject_profile"] == "forbidden"
    assert reasons["capabilities"] == "forbidden"
    assert ctx.skill_gaps == []


async def test_required_slice_failure_raises(builder: ContextBuilder) -> None:
    with pytest.raises(AppError) as err:
        await builder.build(
            make_principal("james"),
            ContextRequest(subject_employee_id="emp-9042", slices=ALL, required=frozenset({"capabilities"})),
        )
    assert err.value.code == "forbidden"


async def test_unconfirmed_endpoint_recorded_as_backend_unconfirmed() -> None:
    builder = ContextBuilder(
        backend=MockBackendClient(registry=registry(**{"BE-042": "proposed"}), environment=Environment.TEST),
        cache=TtlCache(),
    )
    ctx = await builder.build(
        make_principal("james"), ContextRequest(subject_employee_id="emp-8721", slices=ALL)
    )
    assert [(g.slice, g.reason) for g in ctx.gaps_in_context] == [("learning_history", "backend_unconfirmed")]


async def test_cache_is_scoped_by_principal_visibility() -> None:
    backend = MockBackendClient(registry=registry(), environment=Environment.TEST)
    builder = ContextBuilder(backend=backend, cache=TtlCache())
    request = ContextRequest(subject_employee_id="emp-8721", slices=frozenset({"capabilities"}))
    await builder.build(make_principal("james"), request)
    await builder.build(make_principal("james"), request)
    assert [c for c in backend.calls if c[0] == "BE-030"] == [("BE-030", "user-james")]  # cached
    await builder.build(make_principal("michael"), request)  # different visibility → fresh call
    assert ("BE-030", "user-michael") in backend.calls
    assert builder.invalidate_subject("org-gec", "emp-8721") == 2
    await builder.build(make_principal("james"), request)
    assert len([c for c in backend.calls if c == ("BE-030", "user-james")]) == 2


async def test_unauthorized_backend_response_always_raises() -> None:
    backend = MockBackendClient(
        registry=registry(), environment=Environment.TEST, faults={"BE-042": "unauthorized"}
    )
    with pytest.raises(AppError) as err:
        await ContextBuilder(backend=backend, cache=TtlCache()).build(
            make_principal("james"), ContextRequest(subject_employee_id="emp-8721", slices=ALL)
        )
    assert err.value.code == "unauthenticated"


async def test_unsupported_slice_is_a_programming_error(builder: ContextBuilder) -> None:
    with pytest.raises(ValueError, match="unsupported"):
        await builder.build(
            make_principal("james"),
            ContextRequest(subject_employee_id="emp-8721", slices=frozenset({"evidence"})),
        )
