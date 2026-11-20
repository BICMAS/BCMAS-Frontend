"""Orchestrator engine unit tests with purpose-built test capabilities and a stub router."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import pytest
from pydantic import BaseModel

from cfp_ai.agents.base import AccessRule, Capability, CapabilitySpec, RunContext
from cfp_ai.agents.catalogue import HR_TENANT, SELF
from cfp_ai.agents.steps import (
    ApprovalDecisionInput,
    ApprovalItem,
    ApprovalRequestSpec,
    CommitInstruction,
    HandoffRequest,
    ItemDecision,
    ReviewOutcome,
    StepInput,
    StepOutput,
)
from cfp_ai.container import Container
from cfp_ai.context.models import CapabilityContext
from cfp_ai.errors import AppError
from cfp_ai.orchestrator.engine import Orchestrator
from cfp_ai.orchestrator.models import OrchestrationRequest
from cfp_ai.orchestrator.router import PlannedStep, RoutePlan
from cfp_ai.orchestrator.store import ExecutionStore, SuggestionStore
from tests.conftest import make_principal

Behaviour = Callable[[RunContext, StepInput, CapabilityContext | None], StepOutput]


class Payload(BaseModel):
    value: str
    items: list[str] = []


def ok(summary: str = "done", **extra: Any) -> StepOutput:
    return StepOutput(summary=summary, output_type="Payload", data={"value": summary, **extra})


@dataclass
class Probe:
    calls: list[tuple[str, str | None, StepInput]] = field(default_factory=list)


def make_capability(
    name: str,
    behaviour: Behaviour,
    probe: Probe,
    *,
    access: tuple[AccessRule, ...] = (HR_TENANT,),
    subject_mode: str = "none",
    entitlement: str | None = None,
    context_slices: frozenset[str] = frozenset(),
    output_model: type[BaseModel] | None = Payload,
) -> tuple[CapabilitySpec, type[Capability[Any, Any]]]:
    spec = CapabilitySpec(
        name,
        "coaching",
        name.upper(),
        "sync",
        entitlement,
        access,  # type: ignore[arg-type]
        implemented=True,
        public=False,
        subject_mode=subject_mode,
    )  # type: ignore[arg-type]

    class TestCapability(Capability[Any, Any]):
        async def run_step(
            self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
        ) -> StepOutput:
            probe.calls.append((name, ctx.principal.subject, step))
            return behaviour(ctx, step, context)

        def apply_review(
            self, ctx: RunContext, output: StepOutput, decision: ApprovalDecisionInput
        ) -> ReviewOutcome:
            if decision.decision == "reject":
                return ReviewOutcome(status="rejected", data=output.data)
            if {i.item_id for i in decision.items} != {"a", "b"}:
                raise AppError("invalid_request", "decide every item")
            overridden = any(i.decision == "overridden" for i in decision.items)
            return ReviewOutcome(
                status="modified" if overridden else "approved",
                data={**output.data, "reviewed": True},
                commit_plan=[
                    CommitInstruction(
                        endpoint_id="BE-063",
                        method="PATCH",
                        path="/x/a",
                        body={"by": ctx.principal.subject},
                        endpoint_status="unknown",
                    )
                ],
            )

    TestCapability.spec = spec
    TestCapability.output_model = output_model
    TestCapability.context_slices = context_slices
    return spec, TestCapability


class StubRouter:
    def __init__(self, steps: list[PlannedStep]) -> None:
        self.steps = steps

    async def plan(self, principal: Any, request: Any, *, deadline: float | None = None) -> RoutePlan:
        return RoutePlan(method="llm", steps=self.steps, offered=[s.capability for s in self.steps])


@pytest.fixture
def probe() -> Probe:
    return Probe()


def build(
    container: Container, probe: Probe, caps: dict[str, Any], steps: list[PlannedStep] | None = None
) -> Orchestrator:
    for name, value in caps.items():
        behaviour, options = value if isinstance(value, tuple) else (value, {})
        spec, cls = make_capability(name, behaviour, probe, **options)
        container.capabilities.implement(spec, cls)
    router: Any = StubRouter(steps or []) if steps is not None else container.router
    return Orchestrator(
        registry=container.capabilities,
        router=router,
        deps=container.deps,
        endpoints=container.endpoints,
        store=ExecutionStore(),
        suggestions=SuggestionStore(),
        metrics=container.metrics,
        retry_backoff_s=0,
    )


def explicit(capability: str, **kw: Any) -> OrchestrationRequest:
    return OrchestrationRequest(capability=capability, **kw)


def step(capability: str, **kw: Any) -> PlannedStep:
    return PlannedStep(
        capability=capability,
        subject_employee_id=kw.pop("subject", None),
        args=kw.pop("args", {}),
        origin="router",
        **kw,
    )


PRIYA = make_principal("priya")
JAMES = make_principal("james")


def events(record: Any) -> list[str]:
    return [e.type for e in record.events]


# ── execution, history, status ───────────────────────────────────────────────


async def test_single_step_success_records_history(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.alpha": lambda c, s, x: ok()})
    record = await orch.run(PRIYA, explicit("t.alpha"), "req-1")
    assert record.status == "succeeded"
    assert record.routing is not None and record.routing.method == "explicit"
    assert record.steps[0].status == "succeeded" and record.steps[0].attempts == 1
    assert events(record) == [
        "created",
        "routed",
        "step_authorized",
        "step_started",
        "step_succeeded",
        "completed",
    ]
    assert record.completed_at is not None
    assert [r.execution_id for r in orch.list_own(PRIYA)] == [record.execution_id]
    with pytest.raises(AppError) as err:
        orch.get(JAMES, record.execution_id)  # other users cannot see it
    assert err.value.code == "not_found"


async def test_retry_then_success(container: Container, probe: Probe) -> None:
    attempts = {"n": 0}

    def flaky(c: Any, s: Any, x: Any) -> StepOutput:
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise AppError("upstream_unavailable")
        return ok()

    record = await build(container, probe, {"t.flaky": flaky}).run(PRIYA, explicit("t.flaky"), "r")
    assert record.status == "succeeded"
    assert record.steps[0].attempts == 2 and record.steps[0].error is None
    assert "step_retry" in events(record)


async def test_non_retryable_failure(container: Container, probe: Probe) -> None:
    def broken(c: Any, s: Any, x: Any) -> StepOutput:
        raise AppError("precondition_failed", "nothing to do")

    record = await build(container, probe, {"t.broken": broken}).run(PRIYA, explicit("t.broken"), "r")
    assert record.status == "failed"
    assert record.steps[0].attempts == 1
    assert record.steps[0].error is not None and record.steps[0].error.code == "precondition_failed"


async def test_retries_exhausted(container: Container, probe: Probe) -> None:
    def down(c: Any, s: Any, x: Any) -> StepOutput:
        raise AppError("ai_unavailable")

    record = await build(container, probe, {"t.down": down}).run(PRIYA, explicit("t.down"), "r")
    assert record.status == "failed" and record.steps[0].attempts == 2


async def test_output_schema_violation_is_rejected(container: Container, probe: Probe) -> None:
    def wrong_shape(c: Any, s: Any, x: Any) -> StepOutput:
        return StepOutput(summary="s", output_type="Payload", data={"unexpected": 1})

    record = await build(container, probe, {"t.bad": wrong_shape}).run(PRIYA, explicit("t.bad"), "r")
    assert record.status == "failed"
    assert record.steps[0].error is not None and record.steps[0].error.code == "ai_output_invalid"


async def test_unexpected_exception_is_contained(container: Container, probe: Probe) -> None:
    def crash(c: Any, s: Any, x: Any) -> StepOutput:
        raise RuntimeError("bug")

    record = await build(container, probe, {"t.crash": crash}).run(PRIYA, explicit("t.crash"), "r")
    assert record.status == "failed"
    assert record.steps[0].error is not None and record.steps[0].error.code == "internal_error"


# ── permissions ──────────────────────────────────────────────────────────────


async def test_unauthorised_step_is_denied_and_never_executed(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.hr_only": lambda c, s, x: ok()})
    record = await orch.run(JAMES, explicit("t.hr_only"), "r")
    assert record.status == "failed"
    assert record.steps[0].status == "denied"
    assert record.steps[0].error is not None and record.steps[0].error.code == "forbidden"
    assert probe.calls == []


async def test_subject_relation_enforced(container: Container, probe: Probe) -> None:
    caps = {"t.self": (lambda c, s, x: ok(), {"access": (SELF,), "subject_mode": "required"})}
    orch = build(container, probe, caps)
    mine = await orch.run(JAMES, explicit("t.self"), "r")  # defaults to own employee id
    assert mine.status == "succeeded" and mine.steps[0].subject_employee_id == "emp-8721"
    other = await orch.run(JAMES, explicit("t.self", subject_employee_id="emp-9042"), "r")
    assert other.steps[0].status == "denied"
    assert len(probe.calls) == 1


async def test_unknown_capability_is_denied(container: Container, probe: Probe) -> None:
    record = await build(container, probe, {}).run(PRIYA, explicit("t.nope"), "r")
    assert record.steps[0].status == "denied" and record.steps[0].error is not None
    assert record.steps[0].error.code == "not_found"


async def test_context_is_loaded_as_the_principal(container: Container, probe: Probe) -> None:
    seen: dict[str, Any] = {}

    def capture(c: Any, s: Any, context: CapabilityContext | None) -> StepOutput:
        seen["context"] = context
        return ok()

    caps = {
        "t.ctx": (
            capture,
            {
                "access": (SELF,),
                "subject_mode": "required",
                "context_slices": frozenset({"capabilities", "role_profile"}),
            },
        )
    }
    record = await build(container, probe, caps).run(JAMES, explicit("t.ctx"), "r")
    assert record.status == "succeeded"
    context = seen["context"]
    assert isinstance(context, CapabilityContext) and context.skill_gaps
    assert "context_loaded" in events(record)


# ── coordination: dependencies, conditions, handoffs ─────────────────────────


async def test_dependency_failure_skips_dependent(container: Container, probe: Probe) -> None:
    def fail(c: Any, s: Any, x: Any) -> StepOutput:
        raise AppError("not_found")

    orch = build(
        container,
        probe,
        {"t.first": fail, "t.second": lambda c, s, x: ok()},
        steps=[step("t.first"), step("t.second", depends_on_previous=True)],
    )
    record = await orch.run(PRIYA, OrchestrationRequest(message="go"), "r")
    assert [s.status for s in record.steps] == ["failed", "skipped"]
    assert record.steps[1].error is not None
    assert record.status == "failed"
    assert [c[0] for c in probe.calls] == ["t.first"]


async def test_condition_not_met_is_a_normal_outcome(container: Container, probe: Probe) -> None:
    orch = build(
        container,
        probe,
        {"t.first": lambda c, s, x: ok(items=[]), "t.second": lambda c, s, x: ok()},
        steps=[step("t.first"), step("t.second", depends_on_previous=True, condition_field="items")],
    )
    record = await orch.run(PRIYA, OrchestrationRequest(message="go"), "r")
    assert [s.status for s in record.steps] == ["succeeded", "skipped"]
    assert record.steps[1].error is None
    assert record.status == "succeeded"


async def test_upstream_results_are_shared(container: Container, probe: Probe) -> None:
    orch = build(
        container,
        probe,
        {"t.first": lambda c, s, x: ok(items=["x"]), "t.second": lambda c, s, x: ok()},
        steps=[step("t.first"), step("t.second", depends_on_previous=True, condition_field="items")],
    )
    record = await orch.run(PRIYA, OrchestrationRequest(message="go"), "r")
    assert record.status == "succeeded"
    second_input = probe.calls[1][2]
    assert second_input.upstream[0].step_id == "st_1" and second_input.upstream[0].data["items"] == ["x"]


def _with_handoff(target: str, subject: str | None = "emp-9042") -> Behaviour:
    def behaviour(c: Any, s: Any, x: Any) -> StepOutput:
        return StepOutput(
            summary="s",
            output_type="Payload",
            data={"value": "v"},
            handoffs=[
                HandoffRequest(
                    type="dev_plan.practice_needed",
                    target_capability=target,
                    subject_employee_id=subject,
                    title="Practise",
                    detail="detail",
                    payload={"skill_ids": ["skl-api-gov"]},
                )
            ],
        )

    return behaviour


async def test_handoff_executes_permitted_target(container: Container, probe: Probe) -> None:
    orch = build(
        container,
        probe,
        {"t.source": _with_handoff("t.target", None), "t.target": lambda c, s, x: ok("followed up")},
    )
    record = await orch.run(PRIYA, explicit("t.source"), "r")
    assert record.status == "succeeded"
    target = record.steps[1]
    assert (target.origin, target.depends_on, target.handoff_depth) == ("handoff", ["st_1"], 1)
    assert probe.calls[1][2].handoff_payload == {"skill_ids": ["skl-api-gov"]}
    assert "handoff_executed" in events(record)


async def test_handoff_to_unavailable_target_becomes_suggestion(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.source": _with_handoff("coaching.recommend_scenarios")})
    record = await orch.run(PRIYA, explicit("t.source"), "r")
    assert record.status == "succeeded" and len(record.steps) == 1
    assert record.suggestions[0].kind == "practice_scenario"
    assert record.suggestions[0].subject_employee_id == "emp-9042"
    assert "handoff_suggested" in events(record)


async def test_handoffs_can_be_disabled(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.source": _with_handoff("t.target"), "t.target": lambda c, s, x: ok()})
    record = await orch.run(PRIYA, explicit("t.source", allow_handoffs=False), "r")
    assert len(record.steps) == 1 and len(record.suggestions) == 1


async def test_handoff_depth_is_limited(container: Container, probe: Probe) -> None:
    orch = build(
        container,
        probe,
        {
            "t.a": _with_handoff("t.b", None),
            "t.b": _with_handoff("t.c", None),
            "t.c": _with_handoff("t.d", None),
            "t.d": lambda c, s, x: ok(),
        },
    )
    record = await orch.run(PRIYA, explicit("t.a"), "r")
    assert [s.capability for s in record.steps] == ["t.a", "t.b", "t.c"]
    assert any("maximum handoff depth" in (e.detail or "") for e in record.events)


# ── human-in-the-loop ────────────────────────────────────────────────────────


def _needs_approval(c: Any, s: Any, x: Any) -> StepOutput:
    return StepOutput(
        summary="review me",
        output_type="Payload",
        data={"value": "proposal"},
        approval=ApprovalRequestSpec(
            mode="per_item_review",
            approver_roles=["hr_ld_admin"],
            summary="Review two items",
            items=[
                ApprovalItem(item_id="a", label="A", proposal={"score": 3}),
                ApprovalItem(item_id="b", label="B", proposal={"score": 4}),
            ],
            commit_endpoint_id="BE-063",
        ),
    )


APPROVE_ALL = ApprovalDecisionInput(
    decision="approve",
    items=[ItemDecision(item_id="a", decision="accepted"), ItemDecision(item_id="b", decision="accepted")],
)


async def test_approval_pauses_then_resumes_on_approve(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.review": _needs_approval})
    record = await orch.run(PRIYA, explicit("t.review"), "r")
    assert record.status == "awaiting_approval"
    approval = record.steps[0].approval
    assert approval is not None and approval.status == "pending"
    assert [p.execution_id for p in orch.pending_approvals(PRIYA)] == [record.execution_id]
    assert orch.pending_approvals(JAMES) == []

    done = await orch.decide(PRIYA, record.execution_id, approval.approval_id, APPROVE_ALL, "r2")
    assert done.status == "succeeded"
    step = done.steps[0]
    assert step.status == "approved" and step.approval is not None
    assert step.approval.reviewed_output == {"value": "proposal", "reviewed": True}
    assert step.approval.commit_plan[0].endpoint_status == "mocked"  # registry status, not executed
    assert len(probe.calls) == 1  # the capability did not run again on resume
    assert events(done)[-3:] == ["approval_requested", "approval_decided", "completed"]


async def test_reject_is_a_completed_outcome(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.review": _needs_approval})
    record = await orch.run(PRIYA, explicit("t.review"), "r")
    assert record.steps[0].approval is not None
    done = await orch.decide(
        PRIYA,
        record.execution_id,
        record.steps[0].approval.approval_id,
        ApprovalDecisionInput(decision="reject", comment="not convinced"),
        "r2",
    )
    assert done.status == "succeeded" and done.steps[0].status == "rejected"
    assert done.steps[0].approval is not None and done.steps[0].approval.commit_plan == []


async def test_approver_must_hold_role_and_permissions(container: Container, probe: Probe) -> None:
    caps = {"t.review": (_needs_approval, {"entitlement": "ai_talent_assessment"})}
    orch = build(container, probe, caps)
    record = await orch.run(PRIYA, explicit("t.review"), "r")
    assert record.steps[0].approval is not None
    approval_id = record.steps[0].approval.approval_id
    for decider, code in (
        (JAMES, "forbidden"),
        (make_principal("priya", entitlements=frozenset()), "entitlement_required"),
    ):
        with pytest.raises(AppError) as err:
            await orch.decide(decider, record.execution_id, approval_id, APPROVE_ALL, "r")
        assert err.value.code == code
    assert orch.get(PRIYA, record.execution_id).status == "awaiting_approval"


async def test_invalid_decision_does_not_resume(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.review": _needs_approval})
    record = await orch.run(PRIYA, explicit("t.review"), "r")
    assert record.steps[0].approval is not None
    approval_id = record.steps[0].approval.approval_id
    partial = ApprovalDecisionInput(
        decision="approve", items=[ItemDecision(item_id="a", decision="accepted")]
    )
    with pytest.raises(AppError) as err:
        await orch.decide(PRIYA, record.execution_id, approval_id, partial, "r")
    assert err.value.code == "invalid_request"
    assert orch.get(PRIYA, record.execution_id).status == "awaiting_approval"
    assert (
        await orch.decide(PRIYA, record.execution_id, approval_id, APPROVE_ALL, "r")
    ).status == "succeeded"
    with pytest.raises(AppError) as err:  # cannot decide twice
        await orch.decide(PRIYA, record.execution_id, approval_id, APPROVE_ALL, "r")
    assert err.value.code == "conflict"


async def test_second_approver_sees_only_the_step_under_review(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.review": _needs_approval})
    record = await orch.run(PRIYA, explicit("t.review"), "r")
    other_hr = make_principal("priya", subject="user-hr-2", employee_id="emp-7310")
    view = orch.get(other_hr, record.execution_id)
    assert len(view.steps) == 1 and view.request.message is None
    assert record.steps[0].approval is not None
    done = await orch.decide(
        other_hr, record.execution_id, record.steps[0].approval.approval_id, APPROVE_ALL, "r2"
    )
    assert done.status == "succeeded"
    assert done.steps[0].approval is not None
    assert done.steps[0].approval.commit_plan[0].body == {"by": "user-hr-2"}  # resumed as the approver


async def test_cancel_awaiting_execution(container: Container, probe: Probe) -> None:
    orch = build(container, probe, {"t.review": _needs_approval, "t.alpha": lambda c, s, x: ok()})
    record = await orch.run(PRIYA, explicit("t.review"), "r")
    other_hr = make_principal("priya", subject="user-hr-2")
    with pytest.raises(AppError) as err:
        await orch.cancel(other_hr, record.execution_id, "r")
    assert err.value.code == "forbidden"
    cancelled = await orch.cancel(PRIYA, record.execution_id, "r")
    assert cancelled.status == "cancelled" and cancelled.steps[0].status == "cancelled"
    finished = await orch.run(PRIYA, explicit("t.alpha"), "r")
    with pytest.raises(AppError) as err:
        await orch.cancel(PRIYA, finished.execution_id, "r")
    assert err.value.code == "conflict"


async def test_orchestrator_never_writes_to_the_backend(container: Container, probe: Probe) -> None:
    """All backend traffic is reads; approvals yield a commit plan instead of a write."""
    from cfp_ai.integrations.backend.client import ENDPOINTS

    orch = build(container, probe, {"t.review": _needs_approval})
    record = await orch.run(PRIYA, explicit("t.review"), "r")
    assert record.steps[0].approval is not None
    await orch.decide(PRIYA, record.execution_id, record.steps[0].approval.approval_id, APPROVE_ALL, "r")
    backend: Any = container.backend
    read_endpoints = set(ENDPOINTS.values())
    assert {endpoint for endpoint, _ in backend.calls} <= read_endpoints
    assert not hasattr(orch, "commit") and not any(
        name.startswith(("post_", "patch_", "put_", "create_", "update_", "delete_")) for name in dir(backend)
    )
