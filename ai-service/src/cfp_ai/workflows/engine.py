"""Collaborative workflow engine (docs/ai/WORKFLOWS.md).

A workflow is an ordered list of stages. Each stage either runs an agent capability through
the orchestrator (same authorisation, context and validation as any request), reads shared
authorised context, or is a **human checkpoint** that waits for a person to act. The engine:

* runs stages as the person who advances the workflow; a stage whose actor is someone else
  (the subject, an assessor, the manager) waits for them — nothing runs with borrowed rights;
* persists state before and after every stage (write-ahead), so a crash leaves a ``running``
  stage that is re-run on recovery;
* retries retryable failures with exponential backoff, tolerates failures of optional stages
  (``completed_with_warnings``), and lets an authorised person resume a failed workflow;
* prevents duplicates: one active workflow per type and employee, idempotency keys on start,
  a per-workflow lock, and stage references (drafts, executions) that are reused, not recreated;
* records an audit event for every transition and emits metrics and trace spans.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, Literal

from ulid import ULID

from cfp_ai.agents.base import AccessRule, AgentDeps, CapabilitySpec
from cfp_ai.agents.catalogue import HR_TENANT, MANAGER_OF, SELF
from cfp_ai.agents.registry import authorize_subject
from cfp_ai.auth.principal import Principal
from cfp_ai.context.models import CapabilityContext, ContextRequest
from cfp_ai.errors import AppError
from cfp_ai.observability.context import principal_hash
from cfp_ai.observability.metrics import Metrics
from cfp_ai.observability.tracing import tracer
from cfp_ai.orchestrator.engine import Orchestrator
from cfp_ai.orchestrator.models import STEP_SUCCESS, ExecutionRecord, OrchestrationRequest
from cfp_ai.orchestrator.store import ExecutionStore, SuggestionStore
from cfp_ai.schemas.public import ContextSlice
from cfp_ai.workflows.models import (
    TERMINAL,
    Actor,
    Awaiting,
    StageDefinitionView,
    StageError,
    StageRecord,
    StartWorkflowRequest,
    WorkflowDefinitionView,
    WorkflowEvent,
    WorkflowRecord,
    WorkflowType,
)
from cfp_ai.workflows.store import WorkflowStore

if TYPE_CHECKING:
    from cfp_ai.agents.coaching.service import CoachingService

log = logging.getLogger(__name__)

_VIEW = CapabilitySpec(
    "workflows.view",
    "system",
    "WFV",
    "sync",
    None,
    (SELF, MANAGER_OF, HR_TENANT),
    implemented=True,
    public=False,
)
_APPROVER = CapabilitySpec(
    "workflows.approve",
    "system",
    "WFA",
    "sync",
    None,
    (MANAGER_OF, HR_TENANT),
    implemented=True,
    public=False,
)
_ASSESSOR = CapabilitySpec(
    "workflows.assess",
    "system",
    "WFS",
    "sync",
    None,
    (AccessRule(frozenset({"hr_ld_admin"}), "tenant"),),
    implemented=True,
    public=False,
)
_ACTOR_LABEL = {"subject": "the employee", "assessor": "an HR assessor", "approver": "the line manager or HR"}


# ── stage control flow ───────────────────────────────────────────────────────


class Waiting(Exception):
    def __init__(
        self, actor: str, action: str, ref_type: str | None = None, ref_id: str | None = None
    ) -> None:
        super().__init__(action)
        self.actor, self.action, self.ref_type, self.ref_id = actor, action, ref_type, ref_id


class Skip(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class Finish(Exception):
    def __init__(self, outcome: str, summary: str) -> None:
        super().__init__(summary)
        self.outcome, self.summary = outcome, summary


class StageFailed(Exception):
    def __init__(self, code: str, message: str, retry_from: str | None = None) -> None:
        super().__init__(message)
        self.code, self.message, self.retry_from = code, message, retry_from


@dataclass
class StageResult:
    summary: str
    output: dict[str, Any] = field(default_factory=dict)
    refs: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class StageDef:
    key: str
    title: str
    agent: str
    actor: Actor
    run: Callable[[StageContext], Awaitable[StageResult]]
    optional: bool = False
    checkpoint: bool = False


@dataclass(frozen=True)
class WorkflowDefinition:
    type: WorkflowType
    title: str
    description: str
    stages: tuple[StageDef, ...]
    validate: Callable[[StartWorkflowRequest], dict[str, Any]]


@dataclass
class StageContext:
    """What a stage may use: the acting principal, the workflow record and the shared services."""

    service: WorkflowService
    principal: Principal
    record: WorkflowRecord
    stage: StageRecord
    request_id: str

    @property
    def subject(self) -> str:
        return self.record.subject_employee_id

    @property
    def data(self) -> dict[str, Any]:
        return self.record.data

    @property
    def deps(self) -> AgentDeps:
        return self.service.deps

    async def context(
        self, slices: frozenset[ContextSlice], required: frozenset[ContextSlice] = frozenset()
    ) -> CapabilityContext:
        """Shared authorised context: built with the acting principal's own rights (cached per scope)."""
        return await self.deps.context.build(
            self.principal,
            ContextRequest(subject_employee_id=self.subject, slices=slices, required=required),
            deadline=time.monotonic() + 15,
        )

    async def capability(
        self, capability: str, args: dict[str, str] | None = None, *, subject: str | None = "workflow"
    ) -> ExecutionRecord:
        """Run one agent capability through the orchestrator; handoffs are managed by the workflow."""
        ref_key = f"execution:{capability}"
        record = await self.service.orchestrator.run(
            self.principal,
            OrchestrationRequest(
                capability=capability,
                subject_employee_id=self.subject if subject == "workflow" else subject,
                args=args or {},
                allow_handoffs=False,
            ),
            self.request_id,
            workflow_managed=True,
        )
        self.stage.refs[ref_key] = record.execution_id
        step = record.steps[0]
        if step.status in STEP_SUCCESS or step.status == "awaiting_approval":
            return record
        error = step.error
        raise AppError(error.code if error else "internal_error", error.message if error else None)


# ── service ──────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(UTC)


class WorkflowService:
    def __init__(
        self,
        *,
        deps: AgentDeps,
        orchestrator: Orchestrator,
        executions: ExecutionStore,
        suggestions: SuggestionStore,
        coaching: CoachingService | None,
        store: WorkflowStore,
        metrics: Metrics,
        definitions: dict[str, WorkflowDefinition],
        retry_attempts: int = 3,
        retry_backoff_s: float = 0.5,
    ) -> None:
        self.deps = deps
        self.orchestrator = orchestrator
        self.executions = executions
        self.suggestions = suggestions
        self.coaching = coaching
        self._store = store
        self._metrics = metrics
        self._definitions = definitions
        self._attempts = retry_attempts
        self._backoff = retry_backoff_s
        self._locks: dict[str, asyncio.Lock] = {}

    # ── queries ──────────────────────────────────────────────────────────

    def definitions(self) -> list[WorkflowDefinitionView]:
        return [
            WorkflowDefinitionView(
                type=d.type,
                title=d.title,
                description=d.description,
                stages=[
                    StageDefinitionView(
                        key=s.key,
                        title=s.title,
                        agent=s.agent,
                        actor=s.actor,
                        optional=s.optional,
                        checkpoint=s.checkpoint,
                    )
                    for s in d.stages
                ],
            )
            for d in self._definitions.values()
        ]

    async def _visible(self, principal: Principal, record: WorkflowRecord) -> bool:
        if record.initiated_by_hash == principal_hash(principal.subject):
            return True
        try:
            await authorize_subject(_VIEW, principal, record.subject_employee_id, self.deps)
            return True
        except AppError:
            return False

    async def get(self, principal: Principal, workflow_id: str) -> WorkflowRecord:
        record = self._store.get(principal.tenant_id, workflow_id)
        if record is None or not await self._visible(principal, record):
            raise AppError("not_found")
        return record

    async def list_workflows(
        self, principal: Principal, *, subject_employee_id: str | None = None, status: str | None = None
    ) -> list[WorkflowRecord]:
        rows = self._store.list_records(
            principal.tenant_id, subject_employee_id=subject_employee_id, status=status
        )
        return [r for r in rows if await self._visible(principal, r)]

    # ── lifecycle ────────────────────────────────────────────────────────

    async def start(
        self,
        principal: Principal,
        request: StartWorkflowRequest,
        request_id: str,
        *,
        idempotency_key: str | None = None,
    ) -> tuple[WorkflowRecord, bool]:
        """Returns (record, created). Duplicates return the existing workflow instead of a new one."""
        definition = self._definitions[request.type]
        subject = request.subject_employee_id or principal.employee_id
        if subject is None:
            raise AppError("invalid_request", "subject_employee_id is required.")
        await authorize_subject(_VIEW, principal, subject, self.deps)  # self, manager of, or HR
        if idempotency_key and (existing_id := self._store.idempotent(principal.tenant_id, idempotency_key)):
            existing = self._store.get(principal.tenant_id, existing_id)
            if existing is not None:
                if existing.type != request.type or existing.subject_employee_id != subject:
                    raise AppError("idempotency_conflict")
                return existing, False
        active = self._store.find_active(principal.tenant_id, request.type, subject)
        if active is not None:
            self._event(
                active, "duplicate_start_prevented", None, principal, "an active workflow already exists"
            )
            self._save(active)
            return active, False
        inputs = definition.validate(request)
        now = _now()
        record = WorkflowRecord(
            workflow_id=f"wf_{ULID()}",
            type=request.type,
            title=definition.title,
            tenant_id=principal.tenant_id,
            subject_employee_id=subject,
            initiated_by_hash=principal_hash(principal.subject),
            inputs=inputs,
            stages=[
                StageRecord(key=s.key, title=s.title, agent=s.agent, actor=s.actor, optional=s.optional)
                for s in definition.stages
            ],
            created_at=now,
            updated_at=now,
        )
        self._event(record, "started", None, principal, request.type)
        self._metrics.workflows.labels(request.type, "started").inc()
        self._save(record)
        if idempotency_key:
            self._store.remember(principal.tenant_id, idempotency_key, record.workflow_id)
        return await self.advance(principal, record.workflow_id, request_id), True

    async def advance(
        self, principal: Principal, workflow_id: str, request_id: str, *, retry: bool = False
    ) -> WorkflowRecord:
        lock = self._locks.setdefault(workflow_id, asyncio.Lock())
        async with lock:  # one advance at a time: concurrent calls cannot run a stage twice
            record = await self.get(principal, workflow_id)
            if record.status in TERMINAL:
                return record
            if record.status == "failed":
                if not retry:
                    return record
                self._prepare_retry(record, principal)
            definition = self._definitions[record.type]
            record.status, record.awaiting = "running", None
            for stage_def in definition.stages:
                stage = record.stage(stage_def.key)
                if stage.status in ("succeeded", "skipped") or (stage.status == "failed" and stage.optional):
                    continue
                if stage.status == "running":  # a previous process stopped mid-stage
                    self._event(
                        record, "stage_recovered", stage.key, principal, "re-running an interrupted stage"
                    )
                outcome = await self._run_stage(stage_def, stage, record, principal, request_id)
                if outcome == "waiting":
                    record.status = "awaiting_input"
                    self._save(record)
                    return record
                if outcome == "failed" and not stage.optional:
                    record.status = "failed"
                    self._metrics.workflows.labels(record.type, "failed").inc()
                    self._event(
                        record,
                        "workflow_failed",
                        stage.key,
                        principal,
                        stage.error.message if stage.error else None,
                    )
                    self._save(record)
                    return record
                if outcome == "finished":
                    for rest in record.stages:
                        if rest.status == "pending":
                            rest.status = "skipped"
                    break
            warnings = any(s.status == "failed" for s in record.stages)
            record.status = "completed_with_warnings" if warnings else "completed"
            record.outcome = record.outcome or ("completed_with_warnings" if warnings else "completed")
            record.completed_at = _now()
            self._metrics.workflows.labels(record.type, record.status).inc()
            self._event(record, "workflow_completed", None, principal, record.outcome)
            self._save(record)
            return record

    def _prepare_retry(self, record: WorkflowRecord, principal: Principal) -> None:
        """Recovery: reset the failed stage (or its declared restart point) and everything after it."""
        failed = next(s for s in record.stages if s.status == "failed" and not s.optional)
        start = failed.error.retry_from if failed.error and failed.error.retry_from else failed.key
        keys = [s.key for s in record.stages]
        for stage in record.stages[keys.index(start) :]:
            stage.status, stage.error, stage.attempts = "pending", None, 0
            stage.started_at = stage.finished_at = None
            if stage.key == start and start != failed.key:
                stage.refs = {}  # e.g. regenerate a rejected plan: a new draft is wanted
        self._event(record, "retry_requested", start, principal, f"resuming from {start}")

    async def cancel(self, principal: Principal, workflow_id: str) -> WorkflowRecord:
        lock = self._locks.setdefault(workflow_id, asyncio.Lock())
        async with lock:
            record = await self.get(principal, workflow_id)
            if record.status in TERMINAL:
                raise AppError("conflict", "The workflow has already ended.")
            if record.initiated_by_hash != principal_hash(principal.subject):
                await authorize_subject(_APPROVER, principal, record.subject_employee_id, self.deps)
            record.status, record.awaiting, record.outcome = "cancelled", None, "cancelled"
            record.completed_at = _now()
            self._metrics.workflows.labels(record.type, "cancelled").inc()
            self._event(record, "cancelled", None, principal, None)
            self._save(record)
            return record

    async def notify(self, principal: Principal, ref_type: str, ref_id: str, request_id: str) -> list[str]:
        """A human acted on a draft or scoring set: advance the workflows waiting on it, as that person."""
        advanced = []
        for record in self._store.find_waiting(principal.tenant_id, ref_type, ref_id):
            try:
                await self.advance(principal, record.workflow_id, request_id)
                advanced.append(record.workflow_id)
            except AppError as exc:  # the action itself succeeded; the workflow can be advanced later
                log.info(
                    "workflow auto-advance skipped",
                    extra={"workflow_id": record.workflow_id, "code": exc.code},
                )
        return advanced

    def erase_subject(self, tenant_id: str, employee_id: str) -> int:
        return self._store.erase_subject(tenant_id, employee_id)

    # ── stage execution ──────────────────────────────────────────────────

    async def _actor_ok(self, actor: Actor, principal: Principal, record: WorkflowRecord) -> bool:
        if actor == "any":
            return True
        if actor == "subject":
            return principal.employee_id == record.subject_employee_id
        spec = _ASSESSOR if actor == "assessor" else _APPROVER
        if actor == "approver" and principal.employee_id == record.subject_employee_id:
            return False  # nobody approves their own development
        try:
            await authorize_subject(spec, principal, record.subject_employee_id, self.deps)
            return True
        except AppError:
            return False

    async def _run_stage(
        self,
        stage_def: StageDef,
        stage: StageRecord,
        record: WorkflowRecord,
        principal: Principal,
        request_id: str,
    ) -> Literal["succeeded", "waiting", "failed", "skipped", "finished"]:
        if not await self._actor_ok(stage_def.actor, principal, record):
            label = _ACTOR_LABEL[stage_def.actor]
            return self._wait(
                record, stage, principal, Waiting(stage_def.actor, f"{stage_def.title} — needs {label}")
            )
        ctx = StageContext(self, principal, record, stage, request_id)
        started = time.monotonic()
        while True:
            stage.status, stage.attempts = "running", stage.attempts + 1
            stage.started_at = stage.started_at or _now()
            self._event(record, "stage_started", stage.key, principal, f"attempt {stage.attempts}")
            self._save(record)  # write-ahead: a crash leaves a recoverable 'running' stage
            with tracer().start_as_current_span("workflow.stage") as span:
                span.set_attribute("workflow.type", record.type)
                span.set_attribute("workflow.stage", stage.key)
                span.set_attribute("workflow.attempt", stage.attempts)
                try:
                    result = await stage_def.run(ctx)
                except Waiting as wait:
                    return self._wait(record, stage, principal, wait)
                except Skip as skip:
                    return self._finish_stage(record, stage, principal, "skipped", skip.reason, started)
                except Finish as fin:
                    record.outcome = fin.outcome
                    self._finish_stage(record, stage, principal, "succeeded", fin.summary, started)
                    return "finished"
                except StageFailed as failure:
                    stage.error = StageError(
                        code=failure.code,
                        message=failure.message,
                        retryable=False,
                        retry_from=failure.retry_from,
                    )
                    return self._finish_stage(record, stage, principal, "failed", failure.message, started)
                except AppError as exc:
                    span.set_attribute("workflow.error", exc.code)
                    if exc.retryable and stage.attempts < self._attempts:
                        self._metrics.workflow_retries.labels(record.type, stage.key).inc()
                        delay = self._backoff * (2 ** (stage.attempts - 1))
                        self._event(
                            record,
                            "stage_retry_scheduled",
                            stage.key,
                            principal,
                            f"{exc.code}; in {delay:.2f}s",
                        )
                        self._save(record)
                        await asyncio.sleep(delay)
                        continue
                    stage.error = StageError(code=exc.code, message=exc.message, retryable=exc.retryable)
                    return self._finish_stage(
                        record, stage, principal, "failed", f"{exc.code}: {exc.message}", started
                    )
            stage.output, stage.summary = result.output, result.summary
            stage.refs.update(result.refs)
            return self._finish_stage(record, stage, principal, "succeeded", result.summary, started)

    def _wait(
        self, record: WorkflowRecord, stage: StageRecord, principal: Principal, wait: Waiting
    ) -> Literal["waiting"]:
        stage.status = "awaiting"
        record.awaiting = Awaiting(
            stage=stage.key, actor=wait.actor, action=wait.action, ref_type=wait.ref_type, ref_id=wait.ref_id
        )
        self._event(record, "checkpoint_waiting", stage.key, principal, f"{wait.actor}: {wait.action}")
        return "waiting"

    def _finish_stage(
        self,
        record: WorkflowRecord,
        stage: StageRecord,
        principal: Principal,
        status: Literal["succeeded", "failed", "skipped"],
        summary: str,
        started: float,
    ) -> Literal["succeeded", "failed", "skipped"]:
        stage.status, stage.finished_at = status, _now()
        if status != "failed":
            stage.summary = summary
        self._metrics.workflow_stages.labels(record.type, stage.key, status).inc()
        self._metrics.workflow_stage_duration.labels(record.type, stage.key).observe(
            time.monotonic() - started
        )
        self._event(record, f"stage_{status}", stage.key, principal, summary[:300])
        log.info(
            "workflow stage",
            extra={
                "workflow_id": record.workflow_id,
                "workflow": record.type,
                "stage": stage.key,
                "status": status,
            },
        )
        self._save(record)
        return status

    # ── persistence & audit ──────────────────────────────────────────────

    @staticmethod
    def _event(
        record: WorkflowRecord, type_: str, stage: str | None, principal: Principal | None, detail: str | None
    ) -> None:
        record.events.append(
            WorkflowEvent(
                at=_now(),
                type=type_,
                stage=stage,
                actor_hash=principal_hash(principal.subject) if principal else None,
                detail=detail,
            )
        )

    def _save(self, record: WorkflowRecord) -> None:
        record.version += 1
        record.updated_at = _now()
        self._store.save(record)
