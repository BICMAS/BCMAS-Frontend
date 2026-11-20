"""Contract between the orchestrator and agent capabilities (ORCHESTRATION.md §4).

A capability that can be delegated to implements ``Capability.run_step`` and
returns a ``StepOutput``. It never writes to the backend: anything that should
change an official record is expressed as an ``ApprovalRequestSpec`` whose
reviewed result is a *commit plan* for the frontend to execute after a human
decision.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from cfp_ai.schemas.public import ApprovalMode, HandoffType, Role


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UpstreamResult(Strict):
    """Output of a step this step depends on (shared state passed downstream)."""

    step_id: str
    capability: str
    output_type: str
    data: dict[str, Any]


class StepInput(Strict):
    subject_employee_id: str | None
    message: str | None
    args: dict[str, str] = Field(default_factory=dict)
    upstream: list[UpstreamResult] = Field(default_factory=list)
    handoff_payload: dict[str, Any] | None = None  # set when the step was created by a handoff


class HandoffRequest(Strict):
    """Ask the orchestrator to run (or suggest) a follow-up capability."""

    type: HandoffType
    target_capability: str
    subject_employee_id: str | None
    title: str = Field(max_length=200)
    detail: str = Field(max_length=1000)
    payload: dict[str, Any] = Field(default_factory=dict)


class ApprovalItem(Strict):
    item_id: str
    label: str
    proposal: dict[str, Any]


class ApprovalRequestSpec(Strict):
    mode: ApprovalMode
    approver_roles: list[Role]
    summary: str
    items: list[ApprovalItem] = Field(default_factory=list)
    commit_endpoint_id: str | None = None  # PROPOSED backend endpoint the frontend would call

    @model_validator(mode="after")
    def _unique_items(self) -> ApprovalRequestSpec:
        ids = [item.item_id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("approval item ids must be unique")
        if self.mode == "per_item_review" and not self.items:
            raise ValueError("per_item_review requires items")
        return self


class StepOutput(Strict):
    summary: str = Field(min_length=1, max_length=2000)
    output_type: str
    data: dict[str, Any]
    approval: ApprovalRequestSpec | None = None
    handoffs: list[HandoffRequest] = Field(default_factory=list)
    # Private metadata kept with the step (not part of the validated output), e.g. the assessment subject.
    metadata: dict[str, Any] = Field(default_factory=dict)


# ── human decisions ──────────────────────────────────────────────────────────


class ItemDecision(Strict):
    item_id: str
    decision: Literal["accepted", "overridden"]
    value: int | None = None
    comment: str | None = Field(default=None, max_length=1000)


class ApprovalDecisionInput(Strict):
    decision: Literal["approve", "reject", "modify"]
    items: list[ItemDecision] = Field(default_factory=list)
    comment: str | None = Field(default=None, max_length=1000)


class CommitInstruction(Strict):
    """A backend write the *frontend* may perform after the human decision.

    The orchestrator never executes these. ``endpoint_status`` is the registry
    status, so the UI can tell whether the endpoint exists yet.
    """

    endpoint_id: str
    method: Literal["POST", "PATCH", "PUT"]
    path: str
    body: dict[str, Any]
    endpoint_status: str


class ReviewOutcome(Strict):
    status: Literal["approved", "modified", "rejected"]
    data: dict[str, Any]  # the reviewed output
    commit_plan: list[CommitInstruction] = Field(default_factory=list)
    handoffs: list[HandoffRequest] = Field(default_factory=list)  # run after the human decision
