"""Collaborative workflow state (docs/ai/WORKFLOWS.md §3). Persisted as JSON by the workflow store."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


WorkflowType = Literal["assessment_to_development", "personal_development", "continuous_development"]
WorkflowStatus = Literal[
    "running", "awaiting_input", "completed", "completed_with_warnings", "failed", "cancelled"
]
StageStatus = Literal["pending", "running", "awaiting", "succeeded", "failed", "skipped"]
Actor = Literal["any", "subject", "assessor", "approver"]
TERMINAL: frozenset[str] = frozenset({"completed", "completed_with_warnings", "cancelled"})


class StageError(Strict):
    code: str
    message: str
    retryable: bool
    retry_from: str | None = None  # recovery restarts here (e.g. regenerate a rejected plan)


class StageRecord(Strict):
    key: str
    title: str
    agent: str  # talent_assessment | dev_plan | coaching | system
    actor: Actor
    optional: bool = False
    status: StageStatus = "pending"
    attempts: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    summary: str | None = None
    output: dict[str, Any] = Field(default_factory=dict)
    refs: dict[str, str] = Field(default_factory=dict)  # execution_id, draft_id, … (duplicate prevention)
    error: StageError | None = None


class Awaiting(Strict):
    stage: str
    actor: str  # who must act: subject | assessor | manager | manager_or_hr
    action: str
    ref_type: str | None = None  # draft | scoring_set
    ref_id: str | None = None


class WorkflowEvent(Strict):
    at: datetime
    type: str
    stage: str | None = None
    actor_hash: str | None = None
    detail: str | None = None


class WorkflowRecord(Strict):
    workflow_id: str
    type: WorkflowType
    title: str
    tenant_id: str
    subject_employee_id: str
    initiated_by_hash: str
    inputs: dict[str, Any]
    status: WorkflowStatus = "running"
    outcome: str | None = None
    awaiting: Awaiting | None = None
    stages: list[StageRecord]
    data: dict[str, Any] = Field(default_factory=dict)  # shared results passed between stages
    events: list[WorkflowEvent] = Field(default_factory=list)
    version: int = 0
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    def stage(self, key: str) -> StageRecord:
        return next(s for s in self.stages if s.key == key)


class StartWorkflowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: WorkflowType
    subject_employee_id: str | None = Field(default=None, min_length=1, max_length=128)  # default: the caller
    assessment_id: str | None = Field(default=None, max_length=128)  # workflow A
    objectives: list[str] = Field(default_factory=list, max_length=5)  # workflow B
    focus_skill_ids: list[str] = Field(default_factory=list, max_length=6)  # workflow B
    horizon_weeks: int | None = Field(default=None, ge=4, le=52)


class StageDefinitionView(Strict):
    key: str
    title: str
    agent: str
    actor: Actor
    optional: bool
    checkpoint: bool


class WorkflowDefinitionView(Strict):
    type: WorkflowType
    title: str
    description: str
    stages: list[StageDefinitionView]
