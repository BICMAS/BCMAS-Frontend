"""Draft review service (AI_TECHNICAL_SPEC.md §14.2–§14.5; docs/ai/DEVELOPMENT_PLAN_AGENT.md §6).

Lifecycle::

    open ──propose edit (subject/creator/approver; re-validated)──▶ open (version+1)
    open ──accept──▶ accepted ──commit-report──▶ committed
    open ──accept with edits (re-validated)──▶ edited ──commit-report──▶ committed
    open ──reject──▶ rejected
    open ──TTL──▶ expired

Review policy per draft (``ApprovalPolicy``):
  * ``role_approval`` (default for development plans): only the subject's line manager
    or an hr_ld_admin may accept or reject — never the subject themself. The subject
    may propose edits while the draft is open.
  * ``user_accept``: the subject or the creator may also accept.

An accepted draft yields a *commit plan* (PROPOSED backend endpoint) that the frontend
executes; the AI service never writes the official record. The frontend reports the
result with ``commit-report``.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from ulid import ULID

from cfp_ai.agents.base import AccessRule, AgentDeps, CapabilitySpec
from cfp_ai.agents.catalogue import HR_TENANT, MANAGER_OF, SELF
from cfp_ai.agents.registry import authorize_subject
from cfp_ai.agents.steps import CommitInstruction
from cfp_ai.auth.principal import Principal
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.observability.context import principal_hash
from cfp_ai.schemas.public import (
    AiProvenance,
    ApprovalPolicy,
    CommittedRef,
    Draft,
    DraftKind,
    DraftResolution,
    ErrorDetail,
    ValidationIssue,
)

ReviewAction = Literal[
    "created", "edit_proposed", "accepted", "edited", "rejected", "commit_reported", "expired"
]

_VIEW = CapabilitySpec(
    "drafts.view",
    "system",
    "DRV",
    "sync",
    None,
    (SELF, MANAGER_OF, HR_TENANT),
    implemented=True,
    public=False,
)
_APPROVE = CapabilitySpec(
    "drafts.approve", "system", "DRA", "sync", None, (MANAGER_OF, HR_TENANT), implemented=True, public=False
)
_HR_ONLY = CapabilitySpec(
    "drafts.hr",
    "system",
    "DRH",
    "sync",
    None,
    (AccessRule(frozenset({"hr_ld_admin"}), "tenant"),),
    implemented=True,
    public=False,
)


def _now() -> datetime:
    return datetime.now(UTC)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReviewEvent(Strict):
    at: datetime
    action: ReviewAction
    actor_hash: str | None
    version: int
    note: str | None = None


class DraftEnvelope(Strict):
    """API view of a draft under review."""

    draft: Draft[dict[str, Any]]
    version: int
    review_history: list[ReviewEvent]
    commit_plan: list[CommitInstruction]
    can_resolve: bool
    can_propose_edits: bool


class ProposeEditRequest(Strict):
    payload: dict[str, Any]
    expected_version: int = Field(ge=1)
    note: str | None = Field(default=None, max_length=1000)


class ResolveRequest(Strict):
    decision: Literal["accepted", "edited", "rejected"]
    edited_payload: dict[str, Any] | None = None
    reason: str | None = Field(default=None, max_length=1000)
    expected_version: int | None = Field(default=None, ge=1)


@dataclass
class KindHandler:
    """How one draft kind is validated and committed (registered by the owning agent)."""

    kind: DraftKind
    payload_model: type[BaseModel]
    validate: Callable[[BaseModel, dict[str, Any]], list[ValidationIssue]]
    commit: Callable[[DraftRecord, BaseModel, Principal, Literal["ai", "ai_edited"]], list[CommitInstruction]]


@dataclass
class DraftRecord:
    tenant_id: str
    draft: Draft[dict[str, Any]]
    capability: str
    requested_by_hash: str
    validation_context: dict[str, Any]
    version: int = 1
    history: list[ReviewEvent] | None = None
    commit_plan: list[CommitInstruction] | None = None
    supersedes: str | None = None


class DraftService:
    def __init__(self, *, deps: AgentDeps, endpoints: BackendEndpointRegistry, ttl_days: int = 14) -> None:
        self._deps = deps
        self._endpoints = endpoints
        self._ttl = timedelta(days=ttl_days)
        self._handlers: dict[str, KindHandler] = {}
        self._records: dict[tuple[str, str], DraftRecord] = {}

    def register(self, handler: KindHandler) -> None:
        self._handlers[handler.kind] = handler

    # ── creation (called by agents) ──────────────────────────────────────

    def create(
        self,
        principal: Principal,
        *,
        kind: DraftKind,
        capability: str,
        subject_employee_id: str | None,
        payload: BaseModel,
        provenance: AiProvenance,
        approval_policy: ApprovalPolicy,
        disclaimer: str,
        validation_context: dict[str, Any],
        supersedes: str | None = None,
    ) -> DraftEnvelope:
        if kind not in self._handlers:
            raise AppError("internal_error", internal_detail=f"no draft handler for {kind}")
        now = _now()
        draft = Draft[dict[str, Any]](
            draft_id=f"drf_{ULID()}",
            kind=kind,
            status="open",
            subject_employee_id=subject_employee_id,
            payload=payload.model_dump(mode="json"),
            provenance=provenance,
            approval_policy=approval_policy,
            disclaimer=disclaimer,
            created_by=principal.subject,
            created_at=now,
            expires_at=now + self._ttl,
            resolution=None,
        )
        record = DraftRecord(
            tenant_id=principal.tenant_id,
            draft=draft,
            capability=capability,
            requested_by_hash=principal_hash(principal.subject),
            validation_context=validation_context,
            history=[
                ReviewEvent(at=now, action="created", actor_hash=principal_hash(principal.subject), version=1)
            ],
            commit_plan=[],
            supersedes=supersedes,
        )
        self._records[(principal.tenant_id, draft.draft_id)] = record
        return self._envelope(record, can_resolve=False, can_edit=True)

    # ── authorisation ────────────────────────────────────────────────────

    async def _can_view(self, principal: Principal, record: DraftRecord) -> bool:
        if record.requested_by_hash == principal_hash(principal.subject):
            return True
        try:
            await authorize_subject(_VIEW, principal, record.draft.subject_employee_id, self._deps)
            return True
        except AppError:
            return False

    async def _can_resolve(self, principal: Principal, record: DraftRecord) -> bool:
        subject = record.draft.subject_employee_id
        policy = record.draft.approval_policy
        if not principal.has_any_role(*policy.approver_roles) and policy.mode == "role_approval":
            return False
        if policy.mode == "role_approval":
            if subject is not None and principal.employee_id == subject:
                return False  # no self-approval of one's own development plan
            try:
                await authorize_subject(_APPROVE, principal, subject, self._deps)
                return True
            except AppError:
                return False
        if policy.mode == "user_accept":
            return await self._can_view(principal, record)
        return False

    def _get(self, principal: Principal, draft_id: str) -> DraftRecord:
        record = self._records.get((principal.tenant_id, draft_id))
        if record is None:
            raise AppError("not_found")
        if record.draft.status == "open" and record.draft.expires_at < _now():
            record.draft = record.draft.model_copy(update={"status": "expired"})
            assert record.history is not None
            record.history.append(
                ReviewEvent(at=_now(), action="expired", actor_hash=None, version=record.version)
            )
        return record

    async def _visible(self, principal: Principal, draft_id: str) -> DraftRecord:
        record = self._get(principal, draft_id)
        if not await self._can_view(principal, record):
            raise AppError("not_found")  # never reveal other people's drafts
        return record

    # ── read ─────────────────────────────────────────────────────────────

    async def get(self, principal: Principal, draft_id: str) -> DraftEnvelope:
        record = await self._visible(principal, draft_id)
        return await self._view(principal, record)

    async def list(
        self, principal: Principal, *, subject_employee_id: str | None = None, status: str | None = None
    ) -> list[DraftEnvelope]:
        rows = [
            r
            for (t, _), r in self._records.items()
            if t == principal.tenant_id
            and (subject_employee_id is None or r.draft.subject_employee_id == subject_employee_id)
            and (status is None or r.draft.status == status)
        ]
        result = []
        for record in sorted(rows, key=lambda r: r.draft.created_at, reverse=True):
            self._get(principal, record.draft.draft_id)  # applies expiry
            if await self._can_view(principal, record):
                result.append(await self._view(principal, record))
        return result

    async def _view(self, principal: Principal, record: DraftRecord) -> DraftEnvelope:
        is_open = record.draft.status == "open"
        return self._envelope(
            record, can_resolve=is_open and await self._can_resolve(principal, record), can_edit=is_open
        )

    @staticmethod
    def _envelope(record: DraftRecord, *, can_resolve: bool, can_edit: bool) -> DraftEnvelope:
        return DraftEnvelope(
            draft=record.draft,
            version=record.version,
            review_history=list(record.history or []),
            commit_plan=list(record.commit_plan or []),
            can_resolve=can_resolve,
            can_propose_edits=can_edit,
        )

    # ── review actions ───────────────────────────────────────────────────

    def _validated(self, record: DraftRecord, payload: dict[str, Any]) -> BaseModel:
        handler = self._handlers[record.draft.kind]
        try:
            model = handler.payload_model.model_validate(payload)
        except ValidationError as exc:
            raise AppError(
                "invalid_request",
                "The edited plan is not valid.",
                details=[
                    ErrorDetail(field=".".join(str(p) for p in e["loc"]), issue=e["msg"])
                    for e in exc.errors()[:20]
                ],
            ) from exc
        issues = handler.validate(model, record.validation_context)
        if issues:
            raise AppError(
                "invalid_request",
                "The edited plan does not meet the plan rules.",
                details=[ErrorDetail(field=i.path, issue=f"{i.code}: {i.message}") for i in issues[:20]],
            )
        return model

    async def propose_edit(
        self, principal: Principal, draft_id: str, request: ProposeEditRequest
    ) -> DraftEnvelope:
        record = await self._visible(principal, draft_id)
        if record.draft.status != "open":
            raise AppError("conflict", "Only open drafts can be edited.")
        if request.expected_version != record.version:
            raise AppError("conflict", "The draft has changed. Reload and try again.")
        model = self._validated(record, request.payload)
        record.version += 1
        record.draft = record.draft.model_copy(update={"payload": model.model_dump(mode="json")})
        assert record.history is not None
        record.history.append(
            ReviewEvent(
                at=_now(),
                action="edit_proposed",
                actor_hash=principal_hash(principal.subject),
                version=record.version,
                note=request.note,
            )
        )
        return await self._view(principal, record)

    async def resolve(self, principal: Principal, draft_id: str, request: ResolveRequest) -> DraftEnvelope:
        record = await self._visible(principal, draft_id)
        if record.draft.status != "open":
            raise AppError("conflict", f"This draft is {record.draft.status}.")
        if request.expected_version is not None and request.expected_version != record.version:
            raise AppError("conflict", "The draft has changed. Reload and try again.")
        if not await self._can_resolve(principal, record):
            raise AppError("forbidden", "You cannot approve this draft.")
        handler = self._handlers[record.draft.kind]
        now = _now()
        if request.decision == "rejected":
            commit: list[CommitInstruction] = []
        else:
            if request.decision == "edited":
                if request.edited_payload is None:
                    raise AppError("invalid_request", "edited_payload is required when decision is edited.")
                model = self._validated(record, request.edited_payload)
                record.version += 1
                record.draft = record.draft.model_copy(update={"payload": model.model_dump(mode="json")})
            else:
                model = self._validated(record, record.draft.payload)
            edited = request.decision == "edited" or any(
                e.action == "edit_proposed" for e in record.history or []
            )
            commit = [
                c.model_copy(update={"endpoint_status": self._endpoints.status(c.endpoint_id) or "unknown"})
                for c in handler.commit(record, model, principal, "ai_edited" if edited else "ai")
            ]
        record.commit_plan = commit
        record.draft = record.draft.model_copy(
            update={
                "status": request.decision,
                "resolution": DraftResolution(
                    decision=request.decision,
                    resolved_by=principal.subject,
                    resolved_at=now,
                    reason=request.reason,
                    committed_ref=None,
                ),
            }
        )
        assert record.history is not None
        record.history.append(
            ReviewEvent(
                at=now,
                action=request.decision,
                actor_hash=principal_hash(principal.subject),
                version=record.version,
                note=request.reason,
            )
        )
        return await self._view(principal, record)

    async def commit_report(
        self, principal: Principal, draft_id: str, committed_ref: CommittedRef
    ) -> DraftEnvelope:
        record = await self._visible(principal, draft_id)
        if record.draft.status not in ("accepted", "edited", "commit_failed"):
            raise AppError("conflict", "Only accepted drafts can be committed.")
        resolution = record.draft.resolution
        is_resolver = resolution is not None and resolution.resolved_by == principal.subject
        if not is_resolver:
            try:
                await authorize_subject(_HR_ONLY, principal, None, self._deps)
            except AppError as exc:
                raise AppError("forbidden", "Only the reviewer can report the commit.") from exc
        assert resolution is not None
        record.draft = record.draft.model_copy(
            update={
                "status": "committed",
                "resolution": resolution.model_copy(update={"committed_ref": committed_ref}),
            }
        )
        assert record.history is not None
        record.history.append(
            ReviewEvent(
                at=_now(),
                action="commit_reported",
                actor_hash=principal_hash(principal.subject),
                version=record.version,
                note=f"{committed_ref.resource_type}:{committed_ref.resource_id}",
            )
        )
        return await self._view(principal, record)

    def confirm_commit_from_event(self, tenant_id: str, draft_id: str, resource_id: str) -> bool:
        """Backend event (development_plan.created with source.draft_id) confirms the commit server-side."""
        record = self._records.get((tenant_id, draft_id))
        if record is None or record.draft.status not in ("accepted", "edited", "commit_failed"):
            return False
        resolution = record.draft.resolution
        assert resolution is not None
        record.draft = record.draft.model_copy(
            update={
                "status": "committed",
                "resolution": resolution.model_copy(
                    update={
                        "committed_ref": CommittedRef(
                            system="backend", resource_type="development_plan", resource_id=resource_id
                        )
                    }
                ),
            }
        )
        assert record.history is not None
        record.history.append(
            ReviewEvent(
                at=_now(),
                action="commit_reported",
                actor_hash=None,
                version=record.version,
                note="confirmed by backend event",
            )
        )
        return True

    def erase_subject(self, tenant_id: str, employee_id: str) -> int:
        doomed = [
            k
            for k, r in self._records.items()
            if k[0] == tenant_id and r.draft.subject_employee_id == employee_id
        ]
        for key in doomed:
            del self._records[key]
        return len(doomed)

    def record(self, tenant_id: str, draft_id: str) -> DraftRecord | None:
        return self._records.get((tenant_id, draft_id))
