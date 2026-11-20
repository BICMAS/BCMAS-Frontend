"""Conversation memory interfaces (AI_TECHNICAL_SPEC.md §6).

* ``MessageStore`` — canonical, append-only transcript per thread (system of
  record for "what was said"; LangGraph checkpoints hold graph state only).
* ``ConversationMemory`` — windowing: last N turns verbatim + rolling summary.
* ``LearnerMemory`` — long-term, user-visible, user-deletable facts. Never read
  by talent.* capabilities.

Production implementations are Postgres-backed (row-level security by tenant);
the in-memory implementations in ``in_memory.py`` serve dev and tests.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict

ThreadKind = Literal["coaching_session", "conversation", "roleplay", "insights", "job"]
MessageRole = Literal["user", "assistant", "persona", "participant", "system_note"]


class ThreadKey(BaseModel):
    model_config = ConfigDict(frozen=True)

    tenant_id: str
    kind: ThreadKind
    resource_id: str

    @property
    def thread_id(self) -> str:
        return f"{self.tenant_id}:{self.kind}:{self.resource_id}"


class StoredMessage(BaseModel):
    model_config = ConfigDict(frozen=True)

    message_id: str
    thread: ThreadKey
    role: MessageRole
    text: str
    created_at: datetime
    client_message_id: str | None = None
    visible_to_user: bool = True  # observer notes / summaries are hidden


class WindowedHistory(BaseModel):
    model_config = ConfigDict(frozen=True)

    summary: str | None
    recent: tuple[StoredMessage, ...]
    total_turns: int


class LearnerFact(BaseModel):
    model_config = ConfigDict(frozen=True)

    fact_id: str
    tenant_id: str
    employee_id: str
    kind: Literal["preference", "goal", "theme"]
    text: str
    source_session_id: str | None
    created_at: datetime
    expires_at: datetime | None = None


class MessageStore(Protocol):
    async def append(self, message: StoredMessage) -> StoredMessage:
        """Idempotent on (thread, client_message_id): returns the existing message on repeat."""
        ...

    async def get_by_client_id(self, thread: ThreadKey, client_message_id: str) -> StoredMessage | None: ...

    async def list(self, thread: ThreadKey, *, include_hidden: bool = False) -> Sequence[StoredMessage]: ...

    async def delete_thread(self, thread: ThreadKey) -> int: ...

    async def window(self, thread: ThreadKey, *, max_recent: int = 12) -> WindowedHistory: ...


class ConversationMemory(Protocol):
    async def window(self, thread: ThreadKey, *, max_recent: int = 12) -> WindowedHistory: ...

    async def set_summary(self, thread: ThreadKey, summary: str, *, covers_until: str) -> None: ...


class LearnerMemory(Protocol):
    async def recall(self, tenant_id: str, employee_id: str, *, limit: int = 10) -> Sequence[LearnerFact]: ...

    async def upsert(self, facts: Sequence[LearnerFact]) -> None: ...

    async def delete(self, tenant_id: str, employee_id: str, fact_id: str) -> bool: ...

    async def delete_by_source(self, tenant_id: str, employee_id: str, source_session_id: str) -> int: ...

    async def erase_subject(self, tenant_id: str, employee_id: str) -> int: ...
