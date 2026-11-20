"""Multi-agent orchestrator on LangGraph (docs/ai/ORCHESTRATION.md).

Graph:

    START → route ─┬─(clarification)──────────────────────────────▶ finalize → END
                   └─▶ authorize → load_context → select ─┬─▶ execute ─┬─(retrying)──▶ execute
                          ▲                                │            ├─(approval)──▶ approval ─┬─▶ handoffs
                          │                                │            ├─(succeeded)─▶ handoffs  ├─▶ select
                          │                                │            └─(failed)────▶ select    └─▶ finalize
                          │                                ├─(new planned steps)──▶ authorize
                          └────────────── handoffs ◀───────┘└─(nothing left)──────▶ finalize

Invariants (enforced here, tested in tests/test_orchestrator*.py):
  * every step is authorised against the principal *executing it at that moment*
    (requester, or the approver who resumed the run) — at plan time and again at
    execution time; context is cached per (visibility scope, subject), so one
    principal's context is never handed to another;
  * the orchestrator has no backend write path: approvals produce a commit plan
    for the frontend; capabilities' ``run_step``/``apply_review`` are read-only;
  * graph state is JSON only and never contains tokens (the principal travels in
    LangGraph's run-scoped ``context``).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, TypedDict, cast

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.types import Command, interrupt
from pydantic import ValidationError
from ulid import ULID

from cfp_ai.agents.base import AgentDeps, Capability, RunContext
from cfp_ai.agents.registry import CapabilityRegistry, authorize_subject
from cfp_ai.agents.steps import ApprovalDecisionInput, HandoffRequest, StepInput, StepOutput, UpstreamResult
from cfp_ai.auth.principal import Principal
from cfp_ai.context.models import CapabilityContext, ContextRequest
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.observability.context import capability_var, principal_hash
from cfp_ai.observability.metrics import Metrics
from cfp_ai.orchestrator.models import (
    STEP_SUCCESS,
    TERMINAL_EXECUTION,
    ApprovalView,
    ExecutionEvent,
    ExecutionRecord,
    OrchestrationRequest,
    PendingApproval,
    RoutingInfo,
    StepCondition,
    StepError,
    StepRecord,
)
from cfp_ai.orchestrator.router import Router
from cfp_ai.orchestrator.store import ExecutionStore, SuggestionStore
from cfp_ai.schemas.public import ContextGapReason, ErrorCode, Suggestion

log = logging.getLogger(__name__)

MAX_HANDOFF_DEPTH = 2
MAX_STEPS = 6
RECURSION_LIMIT = 150

_GAP_TO_CODE: dict[ContextGapReason, ErrorCode] = {
    "backend_unconfirmed": "backend_dependency_unconfirmed",
    "forbidden": "forbidden",
    "not_found": "not_found",
    "upstream_error": "upstream_unavailable",
}
_HANDOFF_KIND = {
    "dev_plan.practice_needed": "practice_scenario",
    "coaching.session_evaluated": "plan_review",
    "talent.assessment_reported": "plan_draft",
}


@dataclass(frozen=True)
class OrchestratorRuntime:
    """LangGraph run-scoped context: who is executing *this* invocation. Not checkpointed."""

    principal: Principal
    request_id: str
    deadline: float


class OrchestratorState(TypedDict, total=False):
    execution_id: str
    tenant_id: str
    requested_by_hash: str
    created_at: str
    request: dict[str, Any]
    routing: dict[str, Any] | None
    clarification: str | None
    steps: list[dict[str, Any]]
    contexts: dict[str, dict[str, Any]]
    handoffs: dict[str, list[dict[str, Any]]]
    current: str | None
    suggestions: list[dict[str, Any]]
    events: list[dict[str, Any]]
    status: str
    cancelled: bool
    workflow_managed: bool  # a workflow sequences the agents: handoffs are dropped (audited)


def _now() -> datetime:
    return datetime.now(UTC)


def _event(
    events: list[dict[str, Any]], type_: str, step_id: str | None = None, detail: str | None = None
) -> list[dict[str, Any]]:
    event = ExecutionEvent(at=_now(), type=type_, step_id=step_id, detail=detail)
    return [*events, event.model_dump(mode="json")]


def _error(exc: AppError) -> dict[str, Any]:
    return StepError(code=exc.code, message=exc.message, retryable=exc.retryable).model_dump(mode="json")


class Orchestrator:
    def __init__(
        self,
        *,
        registry: CapabilityRegistry,
        router: Router,
        deps: AgentDeps,
        endpoints: BackendEndpointRegistry,
        store: ExecutionStore,
        suggestions: SuggestionStore,
        metrics: Metrics,
        checkpointer: Any | None = None,
        run_deadline_s: float = 120.0,
        retry_backoff_s: float = 0.5,
    ) -> None:
        self._registry = registry
        self._router = router
        self._deps = deps
        self._endpoints = endpoints
        self._store = store
        self._suggestions = suggestions
        self._metrics = metrics
        self._run_deadline_s = run_deadline_s
        self._retry_backoff_s = retry_backoff_s
        self._graph = self._compile(checkpointer or InMemorySaver())

    # ════════════════════════════════════════════════════════════════════
    # Public service API
    # ════════════════════════════════════════════════════════════════════

    async def run(
        self,
        principal: Principal,
        request: OrchestrationRequest,
        request_id: str,
        *,
        workflow_managed: bool = False,
    ) -> ExecutionRecord:
        execution_id = f"exe_{ULID()}"
        state: OrchestratorState = {
            "execution_id": execution_id,
            "tenant_id": principal.tenant_id,
            "requested_by_hash": principal_hash(principal.subject),
            "created_at": _now().isoformat(),
            "request": request.model_dump(mode="json"),
            "routing": None,
            "clarification": None,
            "steps": [],
            "contexts": {},
            "handoffs": {},
            "current": None,
            "suggestions": [],
            "events": _event([], "created"),
            "status": "routing",
            "cancelled": False,
            "workflow_managed": workflow_managed,
        }
        self._persist(state)
        await self._invoke(state, principal, request_id, execution_id)
        return self._get_record(principal.tenant_id, execution_id)

    async def decide(
        self,
        principal: Principal,
        execution_id: str,
        approval_id: str,
        decision: ApprovalDecisionInput,
        request_id: str,
    ) -> ExecutionRecord:
        """Human approval checkpoint; every attempt (allowed, denied, failed) is audited."""
        try:
            record = await self._decide(principal, execution_id, approval_id, decision, request_id)
        except AppError as exc:
            outcome = "denied" if exc.code in ("forbidden", "not_found") else "failed"
            self._audit(principal, "approval_decided", approval_id, outcome, exc.code)
            raise
        approval = next(
            (s.approval for s in record.steps if s.approval and s.approval.approval_id == approval_id), None
        )
        self._audit(
            principal,
            "approval_decided",
            approval_id,
            approval.status if approval else "unknown",
            approval.capability if approval else None,
        )
        return record

    def _audit(
        self, principal: Principal, action: str, resource: str, outcome: str, detail: str | None
    ) -> None:
        if self._deps.audit is not None:
            self._deps.audit.record(
                tenant_id=principal.tenant_id,
                principal=principal,
                action=action,
                resource_type="approval",
                resource=resource,
                outcome=outcome,
                detail=detail,
            )

    async def _decide(
        self,
        principal: Principal,
        execution_id: str,
        approval_id: str,
        decision: ApprovalDecisionInput,
        request_id: str,
    ) -> ExecutionRecord:
        async with self._store.lock(execution_id):
            record = self._get_record(principal.tenant_id, execution_id)
            approval = record.pending_approval()
            if (
                record.status != "awaiting_approval"
                or approval is None
                or approval.approval_id != approval_id
            ):
                raise AppError("conflict", "This approval is not pending.")
            if not principal.has_any_role(*approval.approver_roles):
                raise AppError("forbidden", internal_detail="principal lacks an approver role")
            step = next(s for s in record.steps if s.step_id == approval.step_id)
            # The decider must be allowed to run this capability on this subject (no bypass by approval).
            capability = self._registry.resolve(step.capability, principal, self._deps)
            await authorize_subject(capability.spec, principal, step.subject_employee_id, self._deps)
            # Dry-run the review (pure, no I/O) so invalid decisions fail before the graph resumes.
            capability.apply_review(
                self._run_ctx(principal, capability, request_id, execution_id, step),
                self._step_output(step),
                decision,
            )
            await self._invoke(
                Command(
                    resume={
                        "decision": decision.model_dump(mode="json"),
                        "decider_hash": principal_hash(principal.subject),
                    }
                ),
                principal,
                request_id,
                execution_id,
            )
            return self._get_record(principal.tenant_id, execution_id)

    async def cancel(self, principal: Principal, execution_id: str, request_id: str) -> ExecutionRecord:
        async with self._store.lock(execution_id):
            record = self.get(principal, execution_id)
            if record.requested_by_hash != principal_hash(principal.subject):
                raise AppError("forbidden", "Only the requester can cancel this execution.")
            if record.status != "awaiting_approval":
                raise AppError("conflict", "Only executions awaiting approval can be cancelled.")
            await self._invoke(Command(resume={"cancel": True}), principal, request_id, execution_id)
            return self._get_record(principal.tenant_id, execution_id)

    def get(self, principal: Principal, execution_id: str) -> ExecutionRecord:
        record = self._get_record(principal.tenant_id, execution_id)
        is_requester = record.requested_by_hash == principal_hash(principal.subject)
        approval = record.pending_approval()
        is_approver = approval is not None and principal.has_any_role(*approval.approver_roles)
        if not (is_requester or is_approver):
            raise AppError("not_found")  # do not reveal other users' executions
        if not is_requester and approval is not None:
            # An approver sees only the step under review, not the requester's other results.
            record.steps = [s for s in record.steps if s.step_id == approval.step_id]
            record.suggestions = []
            record.request = record.request.model_copy(
                update={"message": None, "capability": record.steps[0].capability}
            )
        return record

    def list_own(
        self, principal: Principal, status: str | None = None, limit: int = 20
    ) -> list[ExecutionRecord]:
        return self._store.list_for(
            principal.tenant_id, principal_hash(principal.subject), status=status, limit=limit
        )

    def pending_approvals(self, principal: Principal) -> list[PendingApproval]:
        return [
            p
            for p in self._store.pending_approvals(principal.tenant_id)
            if principal.has_any_role(*p.approval.approver_roles)
        ]

    # ════════════════════════════════════════════════════════════════════
    # Invocation & persistence
    # ════════════════════════════════════════════════════════════════════

    async def _invoke(self, payload: Any, principal: Principal, request_id: str, execution_id: str) -> None:
        config = {
            "configurable": {"thread_id": f"{principal.tenant_id}:{execution_id}"},
            "recursion_limit": RECURSION_LIMIT,
        }
        runtime = OrchestratorRuntime(
            principal=principal, request_id=request_id, deadline=time.monotonic() + self._run_deadline_s
        )
        try:
            result = await self._graph.ainvoke(payload, config, context=runtime)
        except Exception as exc:  # the graph itself failed: record it, never leave "running"
            log.exception("orchestration failed", extra={"execution_id": execution_id})
            record = self._store.get(principal.tenant_id, execution_id)
            if record is not None and record.status not in TERMINAL_EXECUTION:
                record.status = "failed"
                record.completed_at = record.updated_at = _now()
                record.events.append(ExecutionEvent(at=_now(), type="completed", detail=type(exc).__name__))
                self._store.save(record)
            self._metrics.orchestrations.labels("failed").inc()
            raise
        if "__interrupt__" in result:
            record = self._get_record(principal.tenant_id, execution_id)
            record.status = "awaiting_approval"
            record.updated_at = _now()
            self._store.save(record)
        else:
            self._metrics.orchestrations.labels(result.get("status", "unknown")).inc()

    def _get_record(self, tenant_id: str, execution_id: str) -> ExecutionRecord:
        record = self._store.get(tenant_id, execution_id)
        if record is None:
            raise AppError("not_found")
        return record

    def _persist(self, state: OrchestratorState) -> None:
        existing = self._store.get(state["tenant_id"], state["execution_id"])
        status = state.get("status", "running")
        record = ExecutionRecord(
            execution_id=state["execution_id"],
            tenant_id=state["tenant_id"],
            requested_by_hash=state["requested_by_hash"],
            status=status,
            request=OrchestrationRequest.model_validate(state["request"]),
            routing=RoutingInfo.model_validate(state["routing"]) if state.get("routing") else None,
            clarification=state.get("clarification"),
            steps=[StepRecord.model_validate(s) for s in state.get("steps", [])],
            suggestions=[Suggestion.model_validate(s) for s in state.get("suggestions", [])],
            events=[ExecutionEvent.model_validate(e) for e in state.get("events", [])],
            created_at=datetime.fromisoformat(state["created_at"]),
            updated_at=_now(),
            completed_at=existing.completed_at if existing else None,
        )
        if status in TERMINAL_EXECUTION and record.completed_at is None:
            record.completed_at = _now()
        self._store.save(record)

    def _merge(self, state: OrchestratorState, update: dict[str, Any]) -> dict[str, Any]:
        self._persist(cast(OrchestratorState, {**state, **update}))
        return update

    # ════════════════════════════════════════════════════════════════════
    # Helpers
    # ════════════════════════════════════════════════════════════════════

    def _run_ctx(
        self,
        principal: Principal,
        capability: Capability[Any, Any],
        request_id: str,
        execution_id: str,
        step: StepRecord,
    ) -> RunContext:
        return RunContext.start(
            principal,
            capability.spec,
            request_id,
            parent_invocation_id=execution_id,
            handoff_depth=step.handoff_depth,
        )

    @staticmethod
    def _step_output(step: StepRecord) -> StepOutput:
        return StepOutput(
            summary=step.summary or "-",
            output_type=step.output_type or "unknown",
            data=step.output or {},
            metadata=step.metadata,
        )

    @staticmethod
    def _context_key(principal: Principal, subject: str) -> str:
        return f"{principal.visibility_scope}:{subject}"

    def _class_attr(self, capability: str, name: str) -> frozenset[str]:
        impl = self._registry.implementation(capability)
        return cast(frozenset[str], getattr(impl, name, frozenset()))

    @staticmethod
    def _steps(state: OrchestratorState) -> list[StepRecord]:
        return [StepRecord.model_validate(s) for s in state.get("steps", [])]

    @staticmethod
    def _dump(steps: list[StepRecord]) -> list[dict[str, Any]]:
        return [s.model_dump(mode="json") for s in steps]

    # ════════════════════════════════════════════════════════════════════
    # Graph nodes
    # ════════════════════════════════════════════════════════════════════

    async def _route(self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]) -> dict[str, Any]:
        if state.get("routing"):
            return {}
        rt = runtime.context
        request = OrchestrationRequest.model_validate(state["request"])
        plan = await self._router.plan(rt.principal, request, deadline=rt.deadline)
        steps: list[StepRecord] = []
        for index, planned in enumerate(plan.steps, start=1):
            try:
                agent = self._registry.spec(planned.capability).agent
            except AppError:
                agent = "unknown"
            previous = f"st_{index - 1}" if index > 1 and planned.depends_on_previous else None
            steps.append(
                StepRecord(
                    step_id=f"st_{index}",
                    capability=planned.capability,
                    agent=agent,
                    origin=planned.origin,
                    subject_employee_id=planned.subject_employee_id,
                    args=planned.args,
                    rationale=planned.rationale,
                    depends_on=[previous] if previous else [],
                    condition=(
                        StepCondition(depends_on_step=previous, output_field=planned.condition_field)
                        if previous and planned.condition_field
                        else None
                    ),
                )
            )
        events = state["events"]
        routing = RoutingInfo(method=plan.method, rationale=plan.rationale, offered_capabilities=plan.offered)
        if plan.clarification:
            events = _event(events, "clarification", detail=plan.clarification)
        else:
            events = _event(events, "routed", detail=", ".join(s.capability for s in steps))
        return self._merge(
            state,
            {
                "routing": routing.model_dump(mode="json"),
                "steps": self._dump(steps),
                "clarification": plan.clarification,
                "events": events,
                "status": "running" if steps else state["status"],
            },
        )

    async def _authorize(
        self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]
    ) -> dict[str, Any]:
        principal = runtime.context.principal
        steps = self._steps(state)
        events = state["events"]
        changed = False
        for step in steps:
            if step.status != "planned":
                continue
            changed = True
            try:
                spec = self._registry.spec(step.capability)
                self._registry.resolve(step.capability, principal, self._deps)
                if spec.subject_mode == "required" and not step.subject_employee_id:
                    raise AppError("invalid_request", "This request needs an employee to be selected.")
                await authorize_subject(spec, principal, step.subject_employee_id, self._deps)
            except AppError as exc:
                step.status, step.error, step.finished_at = "denied", StepError(**_error(exc)), _now()
                events = _event(events, "step_denied", step.step_id, exc.code)
                continue
            step.status = "authorized"
            events = _event(events, "step_authorized", step.step_id)
        if not changed:
            return {}
        return self._merge(state, {"steps": self._dump(steps), "events": events})

    async def _load_context(
        self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]
    ) -> dict[str, Any]:
        rt = runtime.context
        steps = self._steps(state)
        contexts = dict(state.get("contexts", {}))
        events = state["events"]
        needed: dict[str, set[str]] = {}
        for step in steps:
            if step.status == "authorized" and step.subject_employee_id:
                key = self._context_key(rt.principal, step.subject_employee_id)
                slices = set(self._class_attr(step.capability, "context_slices"))
                loaded = set(contexts.get(key, {}).get("slices", []))
                if slices and not slices <= loaded:
                    needed.setdefault(step.subject_employee_id, set()).update(slices | loaded)
        failures: dict[str, AppError] = {}
        for subject, slices in needed.items():
            try:
                context = await self._deps.context.build(
                    rt.principal,
                    ContextRequest(subject_employee_id=subject, slices=frozenset(slices)),
                    deadline=rt.deadline,
                )
            except AppError as exc:
                failures[subject] = exc
                continue
            contexts[self._context_key(rt.principal, subject)] = {
                "slices": sorted(slices),
                "context": context.model_dump(mode="json"),
            }
            events = _event(
                events,
                "context_loaded",
                detail=f"slices={','.join(sorted(slices))}; gaps={len(context.gaps_in_context)}",
            )
        # Steps whose required slices are missing cannot run.
        for step in steps:
            if step.status != "authorized" or not step.subject_employee_id:
                continue
            if step.subject_employee_id in failures:
                failure = failures[step.subject_employee_id]
            else:
                entry = contexts.get(self._context_key(rt.principal, step.subject_employee_id)) or {}
                required = self._class_attr(step.capability, "required_slices")
                gaps = entry.get("context", {}).get("gaps_in_context", [])
                gap = next((g for g in gaps if g["slice"] in required), None)
                if gap is None:
                    continue
                failure = AppError(
                    _GAP_TO_CODE[gap["reason"]],
                    backend_endpoint_ids=[],
                    internal_detail=f"required slice {gap['slice']}",
                )
            step.status, step.error, step.finished_at = "failed", StepError(**_error(failure)), _now()
            events = _event(events, "step_failed", step.step_id, f"context: {failure.code}")
        if not needed and not failures:
            return {}
        return self._merge(state, {"steps": self._dump(steps), "contexts": contexts, "events": events})

    async def _select(
        self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]
    ) -> dict[str, Any]:
        steps = self._steps(state)
        by_id = {s.step_id: s for s in steps}
        events = state["events"]
        current: str | None = None
        for step in steps:
            if step.status != "authorized":
                continue
            blocked = [d for d in step.depends_on if by_id[d].status not in STEP_SUCCESS]
            reason = f"dependency {blocked[0]} did not succeed" if blocked else None
            if reason is None and step.condition is not None:
                source = by_id.get(step.condition.depends_on_step)
                value = (source.output or {}).get(step.condition.output_field) if source else None
                if not value:
                    reason = f"condition not met: {step.condition.output_field} is empty"
            if reason:
                step.status, step.finished_at = "skipped", _now()
                if blocked:  # a failed dependency is a problem; an unmet condition is a normal outcome
                    step.error = StepError(code="precondition_failed", message=reason, retryable=False)
                events = _event(events, "step_skipped", step.step_id, reason)
                continue
            current = step.step_id
            break
        return self._merge(state, {"steps": self._dump(steps), "events": events, "current": current})

    async def _execute(
        self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]
    ) -> dict[str, Any]:
        rt = runtime.context
        steps = self._steps(state)
        step = next(s for s in steps if s.step_id == state["current"])
        events = state["events"]
        if step.status == "retrying":
            await asyncio.sleep(self._retry_backoff_s * step.attempts)
        step.attempts += 1
        step.status = "running"
        step.started_at = step.started_at or _now()
        events = _event(events, "step_started", step.step_id, f"attempt {step.attempts}")
        handoffs = dict(state.get("handoffs", {}))
        capability_var.set(step.capability)
        try:
            # Re-check permissions at execution time, for the principal executing now.
            capability = self._registry.resolve(step.capability, rt.principal, self._deps)
            await authorize_subject(capability.spec, rt.principal, step.subject_employee_id, self._deps)
            context = None
            if step.subject_employee_id:
                entry = state.get("contexts", {}).get(
                    self._context_key(rt.principal, step.subject_employee_id)
                )
                context = CapabilityContext.model_validate(entry["context"]) if entry else None
            upstream = [
                UpstreamResult(
                    step_id=s.step_id,
                    capability=s.capability,
                    output_type=s.output_type or "",
                    data=s.output or {},
                )
                for s in steps
                if s.status in STEP_SUCCESS
                and s.output is not None
                and (s.step_id in step.depends_on or s.subject_employee_id == step.subject_employee_id)
            ]
            step_input = StepInput(
                subject_employee_id=step.subject_employee_id,
                message=state["request"].get("message"),
                args=step.args,
                upstream=upstream,
                handoff_payload=step.handoff_payload,
            )
            run_ctx = self._run_ctx(rt.principal, capability, rt.request_id, state["execution_id"], step)
            timeout = max(0.1, min(capability.spec.deadline_s(), rt.deadline - time.monotonic()))
            try:
                async with asyncio.timeout(timeout):
                    output = await capability.run_step(run_ctx, step_input, context)
            except TimeoutError as exc:
                raise AppError("deadline_exceeded", internal_detail=f"step {step.step_id} timed out") from exc
            if capability.output_model is not None:
                try:
                    capability.output_model.model_validate(output.data)
                except ValidationError as exc:
                    raise AppError(
                        "ai_output_invalid", internal_detail=f"{step.capability} output failed its schema"
                    ) from exc
        except AppError as exc:
            step.error = StepError(**_error(exc))
            if exc.retryable and step.attempts < step.max_attempts:
                step.status = "retrying"
                events = _event(events, "step_retry", step.step_id, exc.code)
            else:
                step.status, step.finished_at = "failed", _now()
                events = _event(events, "step_failed", step.step_id, exc.code)
            self._metrics.orchestration_steps.labels(step.capability, step.status).inc()
            return self._merge(state, {"steps": self._dump(steps), "events": events})
        except Exception as exc:
            log.exception("step crashed", extra={"step": step.step_id, "capability": step.capability})
            step.status, step.finished_at = "failed", _now()
            step.error = StepError(code="internal_error", message="Something went wrong.", retryable=False)
            events = _event(events, "step_failed", step.step_id, type(exc).__name__)
            return self._merge(state, {"steps": self._dump(steps), "events": events})

        step.error = None
        step.summary, step.output_type, step.output = output.summary, output.output_type, output.data
        step.metadata = output.metadata
        handoffs[step.step_id] = [h.model_dump(mode="json") for h in output.handoffs]
        if output.approval is not None and output.approval.mode != "none":
            step.status = "awaiting_approval"
            step.approval = ApprovalView(
                approval_id=f"apr_{ULID()}",
                step_id=step.step_id,
                capability=step.capability,
                mode=output.approval.mode,
                approver_roles=output.approval.approver_roles,
                summary=output.approval.summary,
                items=output.approval.items,
                status="pending",
                commit_endpoint_id=output.approval.commit_endpoint_id,
            )
            events = _event(events, "approval_requested", step.step_id, step.approval.approval_id)
        else:
            step.status, step.finished_at = "succeeded", _now()
            events = _event(events, "step_succeeded", step.step_id)
        self._metrics.orchestration_steps.labels(step.capability, step.status).inc()
        return self._merge(state, {"steps": self._dump(steps), "events": events, "handoffs": handoffs})

    async def _approval(
        self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]
    ) -> dict[str, Any]:
        steps = self._steps(state)
        step = next(s for s in steps if s.step_id == state["current"])
        assert step.approval is not None
        self._merge(state, {"status": "awaiting_approval"})
        # ── pause: everything above runs again on resume, so it must stay side-effect free ──
        resume = interrupt(
            {
                "execution_id": state["execution_id"],
                "approval_id": step.approval.approval_id,
                "step_id": step.step_id,
            }
        )
        rt = runtime.context
        events = state["events"]
        if resume.get("cancel"):
            step.status, step.finished_at = "cancelled", _now()
            step.approval.status = "cancelled"
            events = _event(events, "cancelled", step.step_id)
            return self._merge(
                state, {"steps": self._dump(steps), "events": events, "cancelled": True, "status": "running"}
            )
        decision = ApprovalDecisionInput.model_validate(resume["decision"])
        capability = self._registry.resolve(step.capability, rt.principal, self._deps)
        outcome = capability.apply_review(
            self._run_ctx(rt.principal, capability, rt.request_id, state["execution_id"], step),
            self._step_output(step),
            decision,
        )
        commit_plan = [
            c.model_copy(update={"endpoint_status": self._endpoints.status(c.endpoint_id) or "unknown"})
            for c in outcome.commit_plan
        ]
        step.approval = step.approval.model_copy(
            update={
                "status": outcome.status,
                "decided_by_hash": resume["decider_hash"],
                "decided_at": _now(),
                "decision": decision.model_dump(mode="json"),
                "reviewed_output": outcome.data,
                "commit_plan": commit_plan,
            }
        )
        step.status, step.finished_at = outcome.status, _now()
        events = _event(events, "approval_decided", step.step_id, outcome.status)
        handoffs = dict(state.get("handoffs", {}))
        if outcome.handoffs:  # follow-ups that depend on the human decision
            handoffs[step.step_id] = [
                *handoffs.get(step.step_id, []),
                *(h.model_dump(mode="json") for h in outcome.handoffs),
            ]
        return self._merge(
            state, {"steps": self._dump(steps), "events": events, "status": "running", "handoffs": handoffs}
        )

    async def _handoffs(
        self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]
    ) -> dict[str, Any]:
        principal = runtime.context.principal
        steps = self._steps(state)
        source = next(s for s in steps if s.step_id == state["current"])
        pending = dict(state.get("handoffs", {}))
        requests = [HandoffRequest.model_validate(h) for h in pending.pop(source.step_id, [])]
        if not requests:
            return {"handoffs": pending}
        allow = bool(state["request"].get("allow_handoffs", True))
        events = state["events"]
        suggestions = list(state.get("suggestions", []))
        if state.get("workflow_managed"):
            for handoff in requests:  # the workflow runs the next agent itself, with its own checkpoints
                events = _event(
                    events,
                    "handoff_dropped",
                    source.step_id,
                    f"{handoff.target_capability}: workflow-managed",
                )
            return self._merge(state, {"events": events, "handoffs": pending})
        for handoff in requests:
            reason = await self._handoff_block_reason(handoff, source, steps, principal, allow)
            if reason is None:
                steps.append(
                    StepRecord(
                        step_id=f"st_{len(steps) + 1}",
                        capability=handoff.target_capability,
                        agent=self._registry.spec(handoff.target_capability).agent,
                        origin="handoff",
                        subject_employee_id=handoff.subject_employee_id,
                        depends_on=[source.step_id],
                        handoff_depth=source.handoff_depth + 1,
                        handoff_payload=handoff.payload,
                        rationale=f"handoff {handoff.type} from {source.step_id}",
                    )
                )
                events = _event(events, "handoff_executed", source.step_id, handoff.target_capability)
            elif handoff.subject_employee_id is not None:
                suggestion = Suggestion.model_validate(
                    {
                        "suggestion_id": f"sug_{ULID()}",
                        "kind": (
                            "practice_scenario"
                            if handoff.target_capability.startswith("coaching.")
                            else _HANDOFF_KIND[handoff.type]
                        ),
                        "subject_employee_id": handoff.subject_employee_id,
                        "title": handoff.title,
                        "detail": handoff.detail,
                        "source_handoff": handoff.type,
                        "ref_id": state["execution_id"],
                        "status": "pending",
                        "created_at": _now(),
                    }
                )
                stored = self._suggestions.add(state["tenant_id"], suggestion)
                suggestions.append(stored.model_dump(mode="json"))
                events = _event(
                    events, "handoff_suggested", source.step_id, f"{handoff.target_capability}: {reason}"
                )
            else:  # nothing to attach a suggestion to: still leave an audit trail
                events = _event(
                    events, "handoff_dropped", source.step_id, f"{handoff.target_capability}: {reason}"
                )
        return self._merge(
            state,
            {"steps": self._dump(steps), "events": events, "suggestions": suggestions, "handoffs": pending},
        )

    async def _handoff_block_reason(
        self,
        handoff: HandoffRequest,
        source: StepRecord,
        steps: list[StepRecord],
        principal: Principal,
        allow: bool,
    ) -> str | None:
        if not allow:
            return "handoffs disabled for this request"
        if source.handoff_depth + 1 > MAX_HANDOFF_DEPTH:
            return "maximum handoff depth reached"
        if len(steps) >= MAX_STEPS:
            return "maximum steps reached"
        if any(
            s.capability == handoff.target_capability and s.subject_employee_id == handoff.subject_employee_id
            for s in steps
        ):
            return "already part of this execution"
        try:
            spec = self._registry.spec(handoff.target_capability)
        except AppError:
            return "unknown capability"
        if not spec.orchestratable:
            return "interactive capability (started by the user)"
        availability, reasons, _ = self._registry.status(spec, principal)
        if availability == "unavailable":
            return "not available: " + ",".join(reasons)
        if spec.subject_mode == "required" and not handoff.subject_employee_id:
            return "no subject"
        try:  # don't create a step the subject check would deny
            await authorize_subject(spec, principal, handoff.subject_employee_id, self._deps)
        except AppError as exc:
            return f"not permitted for this subject ({exc.code})"
        return None

    async def _finalize(
        self, state: OrchestratorState, runtime: Runtime[OrchestratorRuntime]
    ) -> dict[str, Any]:
        steps = self._steps(state)
        # Human rejections and condition-based skips are expected outcomes, not failures.
        statuses = [
            s.status if not (s.status == "skipped" and s.error is None) else "succeeded" for s in steps
        ]
        ok = STEP_SUCCESS | {"rejected"}
        if state.get("cancelled"):
            status = "cancelled"
        elif not steps:
            status = "needs_clarification" if state.get("clarification") else "failed"
        elif all(s in ok for s in statuses):
            status = "succeeded"
        elif any(s in ok for s in statuses):
            status = "partially_succeeded"
        else:
            status = "failed"
        events = _event(state["events"], "completed", detail=status)
        return self._merge(state, {"status": status, "events": events, "current": None})

    # ════════════════════════════════════════════════════════════════════
    # Graph wiring
    # ════════════════════════════════════════════════════════════════════

    def _compile(self, checkpointer: Any) -> Any:
        graph: StateGraph[OrchestratorState, OrchestratorRuntime, OrchestratorState, OrchestratorState] = (
            StateGraph(OrchestratorState, context_schema=OrchestratorRuntime)
        )
        for name, fn in (
            ("route", self._route),
            ("authorize", self._authorize),
            ("load_context", self._load_context),
            ("select", self._select),
            ("execute", self._execute),
            ("approval", self._approval),
            ("handoffs", self._handoffs),
            ("finalize", self._finalize),
        ):
            graph.add_node(name, cast(Any, fn))

        def after_route(state: OrchestratorState) -> str:
            return "authorize" if state.get("steps") else "finalize"

        def after_select(state: OrchestratorState) -> str:
            if state.get("current"):
                return "execute"
            if any(s["status"] == "planned" for s in state.get("steps", [])):
                return "authorize"
            return "finalize"

        def after_execute(state: OrchestratorState) -> str:
            step = next(s for s in state["steps"] if s["step_id"] == state["current"])
            return {"retrying": "execute", "awaiting_approval": "approval", "succeeded": "handoffs"}.get(
                step["status"], "select"
            )

        def after_approval(state: OrchestratorState) -> str:
            if state.get("cancelled"):
                return "finalize"
            step = next(s for s in state["steps"] if s["step_id"] == state["current"])
            return "handoffs" if step["status"] in STEP_SUCCESS else "select"

        graph.add_edge(START, "route")
        graph.add_conditional_edges("route", after_route, ["authorize", "finalize"])
        graph.add_edge("authorize", "load_context")
        graph.add_edge("load_context", "select")
        graph.add_conditional_edges("select", after_select, ["execute", "authorize", "finalize"])
        graph.add_conditional_edges("execute", after_execute, ["execute", "approval", "handoffs", "select"])
        graph.add_conditional_edges("approval", after_approval, ["handoffs", "select", "finalize"])
        graph.add_edge("handoffs", "authorize")
        graph.add_edge("finalize", END)
        return graph.compile(checkpointer=checkpointer, name="orchestrator")
