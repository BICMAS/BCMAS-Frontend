"""In-memory memory implementations (dev/test; single process, not durable)."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from datetime import UTC, datetime

from cfp_ai.memory.interfaces import LearnerFact, StoredMessage, ThreadKey, WindowedHistory

_CONVERSATIONAL_ROLES = frozenset({"user", "assistant", "persona", "participant"})


class InMemoryMessageStore:
    def __init__(self) -> None:
        self._threads: dict[str, list[StoredMessage]] = {}
        self._summaries: dict[str, tuple[str, str]] = {}  # thread_id → (summary, last covered message_id)
        self._lock = asyncio.Lock()

    async def append(self, message: StoredMessage) -> StoredMessage:
        async with self._lock:
            thread = self._threads.setdefault(message.thread.thread_id, [])
            if message.client_message_id is not None:
                for existing in thread:
                    if existing.client_message_id == message.client_message_id:
                        return existing
            thread.append(message)
            return message

    async def get_by_client_id(self, thread: ThreadKey, client_message_id: str) -> StoredMessage | None:
        for message in self._threads.get(thread.thread_id, []):
            if message.client_message_id == client_message_id:
                return message
        return None

    async def list(self, thread: ThreadKey, *, include_hidden: bool = False) -> Sequence[StoredMessage]:
        messages = self._threads.get(thread.thread_id, [])
        return tuple(m for m in messages if include_hidden or m.visible_to_user)

    async def delete_thread(self, thread: ThreadKey) -> int:
        async with self._lock:
            self._summaries.pop(thread.thread_id, None)
            return len(self._threads.pop(thread.thread_id, []))

    # ConversationMemory ------------------------------------------------------

    async def window(self, thread: ThreadKey, *, max_recent: int = 12) -> WindowedHistory:
        turns = [m for m in self._threads.get(thread.thread_id, []) if m.role in _CONVERSATIONAL_ROLES]
        summary_entry = self._summaries.get(thread.thread_id)
        return WindowedHistory(
            summary=summary_entry[0] if summary_entry and len(turns) > max_recent else None,
            recent=tuple(turns[-max_recent:]),
            total_turns=len(turns),
        )

    async def set_summary(self, thread: ThreadKey, summary: str, *, covers_until: str) -> None:
        self._summaries[thread.thread_id] = (summary, covers_until)


class InMemoryLearnerMemory:
    def __init__(self, *, max_facts_per_subject: int = 30) -> None:
        self._facts: dict[tuple[str, str], dict[str, LearnerFact]] = {}
        self._max = max_facts_per_subject

    async def recall(self, tenant_id: str, employee_id: str, *, limit: int = 10) -> Sequence[LearnerFact]:
        now = datetime.now(UTC)
        facts = [
            f
            for f in self._facts.get((tenant_id, employee_id), {}).values()
            if f.expires_at is None or f.expires_at > now
        ]
        return sorted(facts, key=lambda f: f.created_at, reverse=True)[:limit]

    async def upsert(self, facts: Sequence[LearnerFact]) -> None:
        for fact in facts:
            bucket = self._facts.setdefault((fact.tenant_id, fact.employee_id), {})
            bucket[fact.fact_id] = fact
            if len(bucket) > self._max:
                oldest = min(bucket.values(), key=lambda f: f.created_at)
                bucket.pop(oldest.fact_id)

    async def delete(self, tenant_id: str, employee_id: str, fact_id: str) -> bool:
        return self._facts.get((tenant_id, employee_id), {}).pop(fact_id, None) is not None

    async def delete_by_source(self, tenant_id: str, employee_id: str, source_session_id: str) -> int:
        bucket = self._facts.get((tenant_id, employee_id), {})
        doomed = [fid for fid, f in bucket.items() if f.source_session_id == source_session_id]
        for fid in doomed:
            del bucket[fid]
        return len(doomed)

    async def erase_subject(self, tenant_id: str, employee_id: str) -> int:
        return len(self._facts.pop((tenant_id, employee_id), {}))
