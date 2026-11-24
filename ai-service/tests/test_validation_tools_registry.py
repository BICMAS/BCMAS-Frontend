"""Structured-output repair loop, tool registry gating, capability registry availability."""

from __future__ import annotations

import time
from typing import Any

import pytest
from pydantic import BaseModel

from cfp_ai.agents.base import AgentDeps, RunContext
from cfp_ai.agents.catalogue import PUBLIC_CAPABILITIES
from cfp_ai.agents.registry import CapabilityRegistry, authorize_subject
from cfp_ai.container import Container
from cfp_ai.errors import AppError
from cfp_ai.llm.gateway import LlmGateway
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.llm.routes import RouteTable
from cfp_ai.llm.types import LlmMessage, LlmRequest, LlmRoute
from cfp_ai.observability.metrics import Metrics
from cfp_ai.schemas.public import ValidationIssue
from cfp_ai.tools.backend_tools import register_backend_tools
from cfp_ai.tools.registry import ToolRegistry
from cfp_ai.validation.structured import generate_validated, ids_exist, levels_in_scale, quotes_in_source
from tests.conftest import make_principal
from tests.test_backend import registry


class Pick(BaseModel):
    skill_id: str
    level: int


def _gateway(fake: FakeLlmProvider) -> LlmGateway:
    route = LlmRoute(route_id="r", provider="fake", model="m", effort="low", max_tokens=10, timeout_s=5)
    return LlmGateway(routes=RouteTable({"r": route}, {}, {}), providers={"fake": fake}, metrics=Metrics())


REQ = LlmRequest(route_id="r", system_blocks=("s",), messages=(LlmMessage("user", "go"),))
VALIDATORS = [
    ids_exist(lambda o: [("skill_id", o.skill_id)], {"skl-a", "skl-b"}),
    levels_in_scale(lambda o: [("level", o.level)], range(1, 6)),
]


async def test_repair_loop_fixes_invalid_output() -> None:
    fake = FakeLlmProvider(queue=[{"skill_id": "invented", "level": 9}, {"skill_id": "skl-a", "level": 3}])
    metrics = Metrics()
    out = await generate_validated(_gateway(fake), "r", REQ, Pick, VALIDATORS, metrics=metrics)
    assert out.output == Pick(skill_id="skl-a", level=3)
    assert out.report.passed and out.report.repaired and out.attempts == 2
    repair_prompt = fake.calls[1].request.messages[-1].content
    assert "unknown_id" in repair_prompt and "level_out_of_scale" in repair_prompt
    assert fake.calls[1].request.messages[-1].role == "user"  # never ends on an assistant turn


async def test_repair_loop_gives_up_or_returns_partial() -> None:
    bad = {"skill_id": "invented", "level": 3}
    with pytest.raises(AppError) as err:
        await generate_validated(_gateway(FakeLlmProvider(queue=[bad] * 3)), "r", REQ, Pick, VALIDATORS)
    assert err.value.code == "ai_output_invalid"
    out = await generate_validated(
        _gateway(FakeLlmProvider(queue=[bad] * 2)),
        "r",
        REQ,
        Pick,
        VALIDATORS,
        max_repairs=1,
        allow_partial=True,
    )
    assert not out.report.passed and out.report.issues[0].code == "unknown_id"


def test_quotes_validator() -> None:
    sources = {"msg-1": "I would keep the retention window at 24 hours."}
    check = quotes_in_source(lambda o: o, sources.get)
    assert check([("msg-1", "retention window at 24 hours")]) == []  # type: ignore[arg-type]
    issues: list[ValidationIssue] = check([("msg-1", "made-up quote")])  # type: ignore[arg-type]
    assert issues[0].code == "quote_not_in_source"


# ── tool registry ────────────────────────────────────────────────────────────


def _ctx(persona: str, capability: str) -> RunContext:
    return RunContext(
        principal=make_principal(persona),
        capability=capability,
        request_id="req-t",
        deadline=time.monotonic() + 10,
    )


def _tools(**overrides: str) -> ToolRegistry:
    from cfp_ai.integrations.backend.mock.client import MockBackendClient
    from cfp_ai.settings import Environment

    reg = registry(**overrides)
    tools = ToolRegistry(endpoints=reg, metrics=Metrics())
    register_backend_tools(tools, MockBackendClient(registry=reg, environment=Environment.TEST))
    return tools


def test_tools_gated_by_capability_and_endpoint_status() -> None:
    names = [t.name for t in _tools().tools_for("dev_plan.draft_plan")]
    assert names == sorted(names) and "get_capability_levels" in names
    assert "get_capability_levels" not in [
        t.name for t in _tools(**{"BE-030": "proposed"}).tools_for("dev_plan.draft_plan")
    ]
    assert _tools().tools_for("talent.insights_turn") == []


def test_llm_tool_definitions_are_strict() -> None:
    definition = next(
        d for d in _tools().llm_definitions("dev_plan.draft_plan") if d["name"] == "get_skill_levels"
    )
    assert definition["strict"] is True
    assert definition["input_schema"]["additionalProperties"] is False
    assert "tenant_id" not in definition["input_schema"]["properties"]


async def test_tool_invocation_paths() -> None:
    tools = _tools()
    ok = await tools.invoke(
        _ctx("james", "dev_plan.draft_plan"), "get_capability_levels", '{"employee_id": "emp-8721"}'
    )
    assert not ok.is_error and "skl-api-gov" in ok.content
    denied = await tools.invoke(
        _ctx("james", "dev_plan.draft_plan"), "get_capability_levels", {"employee_id": "emp-9042"}
    )
    assert denied.is_error and "no access" in denied.content  # backend 403 surfaces as tool error
    bad_args = await tools.invoke(
        _ctx("james", "dev_plan.draft_plan"),
        "get_capability_levels",
        {"employee_id": "emp-8721", "tenant_id": "org-ths"},
    )
    assert bad_args.is_error and "Invalid arguments" in bad_args.content
    wrong_cap = await tools.invoke(
        _ctx("james", "talent.insights_turn"), "get_capability_levels", {"employee_id": "emp-8721"}
    )
    assert wrong_cap.is_error


def test_backend_write_tools_cannot_be_exposed_to_llm() -> None:
    from cfp_ai.tools.registry import ToolSpec

    tools = ToolRegistry(endpoints=registry(), metrics=Metrics())

    async def fn(ctx: Any, args: Any) -> BaseModel:
        return Pick(skill_id="x", level=1)

    with pytest.raises(ValueError, match="must not be exposed"):
        tools.register(
            ToolSpec("submit", "d", "backend_write", Pick, Pick, ("BE-062",), frozenset({"x"})), fn
        )
    with pytest.raises(ValueError, match="unknown backend endpoints"):
        tools.register(ToolSpec("t", "d", "backend_read", Pick, Pick, ("BE-999",), frozenset({"x"})), fn)


# ── capability registry ──────────────────────────────────────────────────────


def test_catalogue_declares_all_twenty_capabilities() -> None:
    codes = [spec.code for spec in PUBLIC_CAPABILITIES]
    assert codes == [f"C{i}" for i in range(1, 7)] + [f"D{i}" for i in range(1, 7)] + [
        f"T{i}"
        for i in range(1, 9)  # T7 analyze_cv, T8 score_interview (external recruitment)
    ]


def test_capability_resolution_order(container: Container) -> None:
    reg: CapabilityRegistry = container.capabilities
    deps: AgentDeps = container.deps
    with pytest.raises(AppError) as err:
        reg.resolve("talent.recommend_scores", make_principal("james"), deps)
    assert err.value.code == "forbidden"
    with pytest.raises(AppError) as err:
        reg.resolve("coaching.roleplay_turn", make_principal("james", entitlements=frozenset()), deps)
    assert err.value.code == "entitlement_required"
    with pytest.raises(AppError) as err:
        reg.resolve("dev_plan.draft_cohort_pathway", make_principal("priya"), deps)
    assert err.value.code == "ai_unavailable"  # declared, not implemented yet
    assert reg.resolve("system.diagnostics", make_principal("james"), deps) is not None


def test_candidate_principal_only_matches_candidate_rules(container: Container) -> None:
    candidate = make_principal(
        "james",
        type="candidate",
        subject="candidate:c-1",
        roles=frozenset(),
        employee_id=None,
        scopes=frozenset({"assessment:recruit-12"}),
    )
    statuses = {s.capability: s for s in container.capabilities.public_status(candidate)}
    assert "role_not_permitted" not in statuses["talent.roleplay_turn"].reasons
    assert "role_not_permitted" in statuses["coaching.roleplay_turn"].reasons


async def test_authorize_subject_relations(container: Container) -> None:
    from cfp_ai.agents.system.diagnostics import SPEC

    deps = container.deps
    await authorize_subject(SPEC, make_principal("james"), "emp-8721", deps)  # self
    await authorize_subject(SPEC, make_principal("michael"), "emp-8721", deps)  # direct report
    await authorize_subject(SPEC, make_principal("priya"), "emp-9042", deps)  # tenant (HR)
    for persona, subject in (("james", "emp-9042"), ("michael", "emp-7310")):
        with pytest.raises(AppError) as err:
            await authorize_subject(SPEC, make_principal(persona), subject, deps)
        assert err.value.code == "forbidden"
