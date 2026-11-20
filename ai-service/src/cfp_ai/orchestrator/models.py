"""Orchestrator API models and status vocabularies (docs/ai/ORCHESTRATION.md §3, §6).

Execution status
    routing → running → (awaiting_approval ⇄ running)* →
        succeeded | partially_succeeded | failed | needs_clarification | cancelled

Step status
    planned → authorized → running → (retrying → running)* →
        succeeded | awaiting_approval → approved | modified | rejected
    planned → denied            (permission / entitlement / dependency check failed)
    authorized → failed         (context or execution failed after retries)
    authorized → skipped        (a dependency did not succeed, or its condition was not met)
    awaiting_approval → cancelled
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from cfp_ai.agents.steps import ApprovalItem, CommitInstruction
from cfp_ai.schemas.public import ApprovalMode, ErrorCode, Role, Suggestion

ExecutionStatus = Literal[
    "routing",
    "running",
    "awaiting_approval",
    "succeeded",
    "partially_succeeded",
    "failed",
    "needs_clarification",
    "cancelled",
]
TERMINAL_EXECUTION: frozenset[str] = frozenset(
    {"succeeded", "partially_succeeded", "failed", "needs_clarification", "cancelled"}
)

StepStatus = Literal[
    "planned",
    "authorized",
    "running",
    "retrying",
    "awaiting_approval",
    "succeeded",
    "approved",
    "modified",
    "rejected",
    "failed",
    "denied",
    "skipped",
    "cancelled",
]
STEP_SUCCESS: frozenset[str] = frozenset({"succeeded", "approved", "modified"})
STEP_TERMINAL: frozenset[str] = frozenset(
    {"succeeded", "approved", "modified", "rejected", "failed", "denied", "skipped", "cancelled"}
)
StepOrigin = Literal["explicit", "router", "keyword_router", "handoff"]
RoutingMethod = Literal["explicit", "llm", "keyword_fallback"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OrchestrationRequest(Strict):
    """Either a natural-language ``message`` (routed) or an explicit ``capability``."""

    message: str | None = Field(default=None, min_length=1, max_length=2000)
    capability: str | None = None
    subject_employee_id: str | None = Field(default=None, min_length=1, max_length=128)
    args: dict[str, str] = Field(default_factory=dict, max_length=10)
    allow_handoffs: bool = True

    @model_validator(mode="after")
    def _message_or_capability(self) -> OrchestrationRequest:
        if not self.message and not self.capability:
            raise ValueError("either message or capability is required")
        return self


class StepCondition(Strict):
    """Run only if the dependency's output field is non-empty (conditional execution)."""

    depends_on_step: str
    output_field: str


class StepError(Strict):
    code: ErrorCode
    message: str
    retryable: bool


class ApprovalView(Strict):
    approval_id: str
    step_id: str
    capability: str
    mode: ApprovalMode
    approver_roles: list[Role]
    summary: str
    items: list[ApprovalItem]
    status: Literal["pending", "approved", "modified", "rejected", "cancelled"]
    commit_endpoint_id: str | None
    decided_by_hash: str | None = None
    decided_at: datetime | None = None
    decision: dict[str, Any] | None = None
    reviewed_output: dict[str, Any] | None = None
    commit_plan: list[CommitInstruction] = Field(default_factory=list)


class StepRecord(Strict):
    step_id: str
    capability: str
    agent: str
    origin: StepOrigin
    subject_employee_id: str | None
    args: dict[str, str] = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list)
    condition: StepCondition | None = None
    handoff_depth: int = 0
    handoff_payload: dict[str, Any] | None = None
    rationale: str | None = None
    status: StepStatus = "planned"
    attempts: int = 0
    max_attempts: int = 2
    error: StepError | None = None
    summary: str | None = None
    output_type: str | None = None
    output: dict[str, Any] | None = None
    approval: ApprovalView | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None


class RoutingInfo(Strict):
    method: RoutingMethod
    rationale: str | None = None
    offered_capabilities: list[str] = Field(default_factory=list)


class ExecutionEvent(Strict):
    at: datetime
    type: Literal[
        "created",
        "routed",
        "clarification",
        "step_authorized",
        "step_denied",
        "context_loaded",
        "step_started",
        "step_retry",
        "step_succeeded",
        "step_failed",
        "step_skipped",
        "approval_requested",
        "approval_decided",
        "handoff_executed",
        "handoff_suggested",
        "handoff_dropped",
        "cancelled",
        "completed",
    ]
    step_id: str | None = None
    detail: str | None = None


class ExecutionRecord(Strict):
    execution_id: str
    tenant_id: str
    requested_by_hash: str
    status: ExecutionStatus
    request: OrchestrationRequest
    routing: RoutingInfo | None = None
    clarification: str | None = None
    steps: list[StepRecord] = Field(default_factory=list)
    suggestions: list[Suggestion] = Field(default_factory=list)
    events: list[ExecutionEvent] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    def pending_approval(self) -> ApprovalView | None:
        for step in self.steps:
            if step.approval is not None and step.approval.status == "pending":
                return step.approval
        return None


class PendingApproval(Strict):
    execution_id: str
    approval: ApprovalView
    requested_by_hash: str
    created_at: datetime
