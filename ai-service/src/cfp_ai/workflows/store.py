"""Workflow state persistence (docs/ai/WORKFLOWS.md §5).

``SqliteWorkflowStore`` keeps workflow state in a SQLite file, so workflows survive a restart
and are recovered. ``InMemoryWorkflowStore`` is for tests and single-process development.
Both store the full ``WorkflowRecord`` as JSON plus indexed columns for lookups.
"""

from __future__ import annotations

import sqlite3
import threading
from typing import Protocol

from cfp_ai.workflows.models import TERMINAL, WorkflowRecord


class WorkflowStore(Protocol):
    def save(self, record: WorkflowRecord) -> None: ...
    def get(self, tenant_id: str, workflow_id: str) -> WorkflowRecord | None: ...
    def list_records(
        self,
        tenant_id: str,
        *,
        subject_employee_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[WorkflowRecord]: ...
    def find_active(self, tenant_id: str, type_: str, subject_employee_id: str) -> WorkflowRecord | None: ...
    def find_waiting(self, tenant_id: str, ref_type: str, ref_id: str) -> list[WorkflowRecord]: ...
    def idempotent(self, tenant_id: str, key: str) -> str | None: ...
    def remember(self, tenant_id: str, key: str, workflow_id: str) -> None: ...
    def erase_subject(self, tenant_id: str, employee_id: str) -> int: ...


def _active(record: WorkflowRecord) -> bool:
    return record.status not in TERMINAL


class InMemoryWorkflowStore:
    def __init__(self) -> None:
        self._rows: dict[tuple[str, str], str] = {}
        self._keys: dict[tuple[str, str], str] = {}

    def save(self, record: WorkflowRecord) -> None:
        self._rows[(record.tenant_id, record.workflow_id)] = record.model_dump_json()

    def get(self, tenant_id: str, workflow_id: str) -> WorkflowRecord | None:
        raw = self._rows.get((tenant_id, workflow_id))
        return WorkflowRecord.model_validate_json(raw) if raw else None

    def _all(self, tenant_id: str) -> list[WorkflowRecord]:
        return [WorkflowRecord.model_validate_json(v) for (t, _), v in self._rows.items() if t == tenant_id]

    def list_records(
        self,
        tenant_id: str,
        *,
        subject_employee_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[WorkflowRecord]:
        rows = [
            r
            for r in self._all(tenant_id)
            if (subject_employee_id is None or r.subject_employee_id == subject_employee_id)
            and (status is None or r.status == status)
        ]
        return sorted(rows, key=lambda r: r.created_at, reverse=True)[:limit]

    def find_active(self, tenant_id: str, type_: str, subject_employee_id: str) -> WorkflowRecord | None:
        return next(
            (
                r
                for r in self.list_records(tenant_id, subject_employee_id=subject_employee_id)
                if r.type == type_ and _active(r)
            ),
            None,
        )

    def find_waiting(self, tenant_id: str, ref_type: str, ref_id: str) -> list[WorkflowRecord]:
        return [
            r
            for r in self._all(tenant_id)
            if r.status == "awaiting_input"
            and r.awaiting is not None
            and (r.awaiting.ref_type, r.awaiting.ref_id) == (ref_type, ref_id)
        ]

    def idempotent(self, tenant_id: str, key: str) -> str | None:
        return self._keys.get((tenant_id, key))

    def remember(self, tenant_id: str, key: str, workflow_id: str) -> None:
        self._keys[(tenant_id, key)] = workflow_id

    def erase_subject(self, tenant_id: str, employee_id: str) -> int:
        doomed = [
            k
            for k, raw in self._rows.items()
            if k[0] == tenant_id
            and WorkflowRecord.model_validate_json(raw).subject_employee_id == employee_id
        ]
        for key in doomed:
            del self._rows[key]
        return len(doomed)


_SCHEMA = """
CREATE TABLE IF NOT EXISTS workflows (
    tenant_id TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    type TEXT NOT NULL,
    subject_employee_id TEXT NOT NULL,
    status TEXT NOT NULL,
    awaiting_ref TEXT,
    created_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (tenant_id, workflow_id)
);
CREATE INDEX IF NOT EXISTS ix_wf_subject ON workflows (tenant_id, subject_employee_id, type, status);
CREATE INDEX IF NOT EXISTS ix_wf_awaiting ON workflows (tenant_id, awaiting_ref);
CREATE TABLE IF NOT EXISTS workflow_idempotency (
    tenant_id TEXT NOT NULL,
    key TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    PRIMARY KEY (tenant_id, key)
);
"""


class SqliteWorkflowStore:
    """Durable store. One connection guarded by a lock (the service is single-process per replica)."""

    def __init__(self, path: str) -> None:
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(_SCHEMA)
        self._lock = threading.Lock()

    def close(self) -> None:
        self._db.close()

    def ping(self) -> None:
        """Readiness: raises if the database cannot be read and written."""
        with self._lock:
            self._db.execute("SELECT 1").fetchone()
            self._db.execute("BEGIN IMMEDIATE")  # takes the write lock: the disk is writable
            self._db.execute("ROLLBACK")

    def save(self, record: WorkflowRecord) -> None:
        ref = (
            f"{record.awaiting.ref_type}:{record.awaiting.ref_id}"
            if record.awaiting is not None and record.awaiting.ref_type
            else None
        )
        with self._lock:
            self._db.execute(
                "INSERT INTO workflows VALUES (?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(tenant_id, workflow_id) DO UPDATE SET "
                "status=excluded.status, awaiting_ref=excluded.awaiting_ref, version=excluded.version, "
                "body=excluded.body",
                (
                    record.tenant_id,
                    record.workflow_id,
                    record.type,
                    record.subject_employee_id,
                    record.status,
                    ref,
                    record.created_at.isoformat(),
                    record.version,
                    record.model_dump_json(),
                ),
            )

    def _query(self, sql: str, args: tuple[object, ...]) -> list[WorkflowRecord]:
        with self._lock:
            rows = self._db.execute(sql, args).fetchall()
        return [WorkflowRecord.model_validate_json(r[0]) for r in rows]

    def get(self, tenant_id: str, workflow_id: str) -> WorkflowRecord | None:
        rows = self._query(
            "SELECT body FROM workflows WHERE tenant_id=? AND workflow_id=?", (tenant_id, workflow_id)
        )
        return rows[0] if rows else None

    def list_records(
        self,
        tenant_id: str,
        *,
        subject_employee_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[WorkflowRecord]:
        sql, args = "SELECT body FROM workflows WHERE tenant_id=?", [tenant_id]
        if subject_employee_id is not None:
            sql += " AND subject_employee_id=?"
            args.append(subject_employee_id)
        if status is not None:
            sql += " AND status=?"
            args.append(status)
        sql += " ORDER BY created_at DESC LIMIT ?"
        return self._query(sql, (*args, limit))

    def find_active(self, tenant_id: str, type_: str, subject_employee_id: str) -> WorkflowRecord | None:
        terminal = sorted(TERMINAL)
        assert len(terminal) == 3  # matches the placeholders below
        rows = self._query(
            "SELECT body FROM workflows WHERE tenant_id=? AND type=? AND subject_employee_id=? "
            "AND status NOT IN (?,?,?) ORDER BY created_at DESC LIMIT 1",
            (tenant_id, type_, subject_employee_id, *terminal),
        )
        return rows[0] if rows else None

    def find_waiting(self, tenant_id: str, ref_type: str, ref_id: str) -> list[WorkflowRecord]:
        return self._query(
            "SELECT body FROM workflows WHERE tenant_id=? AND status='awaiting_input' AND awaiting_ref=?",
            (tenant_id, f"{ref_type}:{ref_id}"),
        )

    def idempotent(self, tenant_id: str, key: str) -> str | None:
        with self._lock:
            row = self._db.execute(
                "SELECT workflow_id FROM workflow_idempotency WHERE tenant_id=? AND key=?", (tenant_id, key)
            ).fetchone()
        return str(row[0]) if row else None

    def remember(self, tenant_id: str, key: str, workflow_id: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT OR IGNORE INTO workflow_idempotency VALUES (?,?,?)", (tenant_id, key, workflow_id)
            )

    def erase_subject(self, tenant_id: str, employee_id: str) -> int:
        with self._lock:
            cursor = self._db.execute(
                "DELETE FROM workflows WHERE tenant_id=? AND subject_employee_id=?", (tenant_id, employee_id)
            )
        return cursor.rowcount
