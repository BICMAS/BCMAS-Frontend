"""Execution history and suggestion stores.

In-memory implementations for dev/test (single process, not durable). Production
uses Postgres with row-level security on ``tenant_id``; the interface is the same.
Every lookup is tenant-scoped.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

from cfp_ai.orchestrator.models import ExecutionRecord, PendingApproval
from cfp_ai.schemas.public import Suggestion


class ExecutionStore:
    def __init__(self, *, max_per_tenant: int = 5000) -> None:
        self._records: dict[tuple[str, str], ExecutionRecord] = {}
        self._max = max_per_tenant
        self._locks: dict[str, asyncio.Lock] = {}

    def lock(self, execution_id: str) -> asyncio.Lock:
        return self._locks.setdefault(execution_id, asyncio.Lock())

    def save(self, record: ExecutionRecord) -> None:
        self._records[(record.tenant_id, record.execution_id)] = record.model_copy(deep=True)
        tenant_keys = [k for k in self._records if k[0] == record.tenant_id]
        if len(tenant_keys) > self._max:
            oldest = min(tenant_keys, key=lambda k: self._records[k].created_at)
            self._records.pop(oldest, None)

    def get(self, tenant_id: str, execution_id: str) -> ExecutionRecord | None:
        record = self._records.get((tenant_id, execution_id))
        return record.model_copy(deep=True) if record else None

    def list_for(
        self, tenant_id: str, requested_by_hash: str, *, status: str | None = None, limit: int = 20
    ) -> list[ExecutionRecord]:
        rows = [
            r
            for (t, _), r in self._records.items()
            if t == tenant_id
            and r.requested_by_hash == requested_by_hash
            and (status is None or r.status == status)
        ]
        rows.sort(key=lambda r: r.created_at, reverse=True)
        return [r.model_copy(deep=True) for r in rows[:limit]]

    def pending_approvals(self, tenant_id: str) -> list[PendingApproval]:
        result = []
        for (t, _), record in self._records.items():
            if t != tenant_id or record.status != "awaiting_approval":
                continue
            approval = record.pending_approval()
            if approval is not None:
                result.append(
                    PendingApproval(
                        execution_id=record.execution_id,
                        approval=approval,
                        requested_by_hash=record.requested_by_hash,
                        created_at=record.created_at,
                    )
                )
        return sorted(result, key=lambda p: p.created_at)


class SuggestionStore:
    """Suggestions created by handoffs that were not executed (ORCHESTRATION.md §5)."""

    MAX_PENDING_PER_KIND = 5

    def __init__(self) -> None:
        self._items: dict[str, list[Suggestion]] = {}

    def add(self, tenant_id: str, suggestion: Suggestion) -> Suggestion:
        bucket = self._items.setdefault(tenant_id, [])
        for existing in bucket:
            if (
                existing.status == "pending"
                and existing.kind == suggestion.kind
                and existing.subject_employee_id == suggestion.subject_employee_id
                and existing.title == suggestion.title
            ):
                return existing  # de-duplicated
        same_kind = [
            s
            for s in bucket
            if s.status == "pending"
            and s.kind == suggestion.kind
            and s.subject_employee_id == suggestion.subject_employee_id
        ]
        if len(same_kind) >= self.MAX_PENDING_PER_KIND:
            oldest = min(same_kind, key=lambda s: s.created_at)
            bucket[bucket.index(oldest)] = oldest.model_copy(update={"status": "dismissed"})
        bucket.append(suggestion)
        return suggestion

    def list_for_subject(
        self, tenant_id: str, subject_employee_id: str, status: str | None = "pending"
    ) -> Sequence[Suggestion]:
        return [
            s
            for s in self._items.get(tenant_id, [])
            if s.subject_employee_id == subject_employee_id and (status is None or s.status == status)
        ]

    def dismiss(self, tenant_id: str, subject_employee_id: str, suggestion_id: str) -> Suggestion | None:
        bucket = self._items.get(tenant_id, [])
        for i, s in enumerate(bucket):
            if s.suggestion_id == suggestion_id and s.subject_employee_id == subject_employee_id:
                bucket[i] = s.model_copy(update={"status": "dismissed"})
                return bucket[i]
        return None

    def erase_subject(self, tenant_id: str, subject_employee_id: str) -> int:
        """Data-subject erasure: drop every suggestion about the employee."""
        bucket = self._items.get(tenant_id, [])
        kept = [s for s in bucket if s.subject_employee_id != subject_employee_id]
        self._items[tenant_id] = kept
        return len(bucket) - len(kept)
