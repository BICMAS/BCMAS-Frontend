"""Agent base architecture (AI_TECHNICAL_SPEC.md §2–§3).

* ``CapabilitySpec`` — static declaration of one agent capability (who may call
  it, what backend endpoints and LLM routes it needs, how its output is approved).
* ``RunContext`` — immutable per-invocation context. Passed to LangGraph as
  run-scoped ``context`` (never written to graph state or checkpoints, because it
  carries the principal and its token).
* ``AgentDeps`` — the injected ports a capability may use.
* ``Capability`` — base class for implementations.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, ClassVar, Generic, Literal, TypeVar

from pydantic import BaseModel
from ulid import ULID

from cfp_ai.auth.principal import Principal
from cfp_ai.errors import AppError
from cfp_ai.schemas.public import ApprovalMode, Entitlement

if TYPE_CHECKING:
    from cfp_ai.agents.coaching.scenarios import ScenarioStore
    from cfp_ai.agents.coaching.store import CoachingStore
    from cfp_ai.agents.steps import ApprovalDecisionInput, ReviewOutcome, StepInput, StepOutput
    from cfp_ai.agents.talent.store import TalentResultStore
    from cfp_ai.context.builder import ContextBuilder
    from cfp_ai.context.models import CapabilityContext
    from cfp_ai.drafts.service import DraftService
    from cfp_ai.integrations.backend.client import BackendClient
    from cfp_ai.llm.gateway import LlmGateway
    from cfp_ai.memory.interfaces import LearnerMemory, MessageStore
    from cfp_ai.observability.metrics import Metrics
    from cfp_ai.security.audit import AuditLog
    from cfp_ai.tools.registry import ToolRegistry

InT = TypeVar("InT", bound=BaseModel)
OutT = TypeVar("OutT", bound=BaseModel)

RunMode = Literal["sync", "stream", "job"]
Relation = Literal["self", "direct_report", "tenant", "assessment_scope"]
SubjectMode = Literal["required", "optional", "none"]  # optional: checked when given


@dataclass(frozen=True)
class AccessRule:
    """``roles`` may include ``"candidate"`` (matches candidate principals)."""

    roles: frozenset[str]
    relation: Relation


@dataclass(frozen=True)
class CapabilitySpec:
    capability: str  # public CapabilityId, or "system.*" for internal capabilities
    agent: str
    code: str  # "C1", "D3", "SYS1"…
    mode: RunMode
    entitlement: Entitlement | None
    access: tuple[AccessRule, ...]
    required_endpoints: tuple[str, ...] = ()
    optional_endpoints: tuple[str, ...] = ()
    commit_endpoints: tuple[str, ...] = ()
    llm_routes: tuple[str, ...] = ()
    approval: ApprovalMode = "none"
    implemented: bool = False
    public: bool = True  # listed by GET /v1/capabilities
    sync_deadline_s: float = 10.0
    job_deadline_s: float = 300.0
    # Orchestrator routing metadata
    summary: str = ""  # one line, shown to the router model
    subject_mode: SubjectMode = "required"  # whether the capability is about an employee
    required_args: tuple[str, ...] = ()  # e.g. ("assessment_id",)
    orchestratable: bool = True  # False for stateful/interactive capabilities (own endpoints)

    def deadline_s(self) -> float:
        return self.sync_deadline_s if self.mode in ("sync", "stream") else self.job_deadline_s


@dataclass(frozen=True)
class RunContext:
    principal: Principal
    capability: str
    request_id: str
    deadline: float  # time.monotonic() based
    invocation_id: str = field(default_factory=lambda: f"inv_{ULID()}")
    parent_invocation_id: str | None = None
    idempotency_key: str | None = None
    handoff_depth: int = 0

    @classmethod
    def start(cls, principal: Principal, spec: CapabilitySpec, request_id: str, **kw: Any) -> RunContext:
        return cls(
            principal=principal,
            capability=spec.capability,
            request_id=request_id,
            deadline=time.monotonic() + spec.deadline_s(),
            **kw,
        )

    def remaining_s(self) -> float:
        return max(0.0, self.deadline - time.monotonic())


@dataclass(frozen=True)
class AgentDeps:
    backend: BackendClient
    context: ContextBuilder
    gateway: LlmGateway
    tools: ToolRegistry
    messages: MessageStore
    learner_memory: LearnerMemory
    metrics: Metrics
    # Agent-owned resources (AI-owned data), set by the container.
    scenarios: ScenarioStore | None = None
    coaching_store: CoachingStore | None = None
    drafts: DraftService | None = None
    talent_results: TalentResultStore | None = None
    audit: AuditLog | None = None
    dev_plan_approval_mode: Literal["role_approval", "user_accept"] = "role_approval"
    dev_plan_max_goals: int = 6


@dataclass(frozen=True)
class GraphContext:
    """LangGraph run-scoped context (``context_schema``) — not checkpointed."""

    run: RunContext
    deps: AgentDeps


class Capability(Generic[InT, OutT]):
    """Base class for capability implementations.

    Subclasses set ``spec`` and implement ``run`` (sync/job) and/or ``stream``.
    Authorisation pre-checks happen in the registry before ``run`` is called;
    subject-relation checks happen inside via ``authorize_subject``.
    """

    spec: ClassVar[CapabilitySpec]

    # Orchestration hooks (see agents/steps.py and orchestrator/). A capability that can be
    # delegated to by the orchestrator sets these and implements ``run_step``.
    output_model: ClassVar[type[BaseModel] | None] = None
    context_slices: ClassVar[frozenset[str]] = frozenset()
    required_slices: ClassVar[frozenset[str]] = frozenset()

    def __init__(self, deps: AgentDeps) -> None:
        self.deps = deps

    async def run(self, ctx: RunContext, payload: InT) -> OutT:
        raise NotImplementedError

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        """Execute as one orchestrated step. Must not write to the backend."""
        raise AppError("ai_unavailable", internal_detail=f"{self.spec.capability} is not orchestratable")

    def apply_review(
        self, ctx: RunContext, output: StepOutput, decision: ApprovalDecisionInput
    ) -> ReviewOutcome:
        """Apply a human decision to an output that requested approval (no backend writes)."""
        raise AppError("conflict", internal_detail=f"{self.spec.capability} does not support review")

    def stream(self, ctx: RunContext, payload: InT) -> AsyncIterator[Any]:
        raise NotImplementedError
