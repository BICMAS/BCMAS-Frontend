"""Coaching session store (AI-owned data; docs/ai/COACHING_AGENT.md §6).

Holds conversation and role-play session metadata, summaries and evaluations.
Message text lives in the MessageStore. In-memory for dev/test; Postgres with
row-level security in production. All access is tenant-scoped, and transcripts
are owner-only (enforced by the service layer).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from cfp_ai.agents.coaching.models import CoachingSummary, Stage
from cfp_ai.agents.coaching.modes import CoachingMode
from cfp_ai.memory.interfaces import ThreadKey
from cfp_ai.schemas.public import PersonaPublic, SessionEvaluation, SkillTarget


@dataclass
class ConversationState:
    conversation_id: str
    tenant_id: str
    employee_id: str
    mode: CoachingMode
    topic: str | None
    focus_skill_ids: list[str]
    use_memory: bool
    created_at: datetime
    status: str = "active"
    stage: Stage = "goal"
    turn_count: int = 0
    ended_at: datetime | None = None
    summary: CoachingSummary | None = None
    flags: list[str] = field(default_factory=list)
    turn_cache: dict[str, Any] = field(default_factory=dict)  # client_message_id → result (idempotency)

    @property
    def thread(self) -> ThreadKey:
        return ThreadKey(tenant_id=self.tenant_id, kind="conversation", resource_id=self.conversation_id)


@dataclass
class RoleplayState:
    session_id: str
    tenant_id: str
    employee_id: str
    scenario_id: str
    scenario_version: int
    title: str
    persona: PersonaPublic
    target_skills: list[SkillTarget]
    time_limit_s: int
    started_at: datetime
    status: str = "active"  # active | evaluating | evaluated | abandoned
    evaluation_status: str = "none"  # none | pending | ready | failed
    turn_count: int = 0
    ended_at: datetime | None = None
    evaluation: SessionEvaluation | None = None
    flags: list[str] = field(default_factory=list)
    turn_cache: dict[str, Any] = field(default_factory=dict)

    @property
    def thread(self) -> ThreadKey:
        return ThreadKey(tenant_id=self.tenant_id, kind="coaching_session", resource_id=self.session_id)


class CoachingStore:
    def __init__(self) -> None:
        self._conversations: dict[tuple[str, str], ConversationState] = {}
        self._sessions: dict[tuple[str, str], RoleplayState] = {}

    # conversations
    def save_conversation(self, state: ConversationState) -> None:
        self._conversations[(state.tenant_id, state.conversation_id)] = state

    def conversation(self, tenant_id: str, conversation_id: str) -> ConversationState | None:
        return self._conversations.get((tenant_id, conversation_id))

    def conversations_for(self, tenant_id: str, employee_id: str) -> list[ConversationState]:
        rows = [
            c for (t, _), c in self._conversations.items() if t == tenant_id and c.employee_id == employee_id
        ]
        return sorted(rows, key=lambda c: c.created_at, reverse=True)

    def delete_conversation(self, tenant_id: str, conversation_id: str) -> ConversationState | None:
        return self._conversations.pop((tenant_id, conversation_id), None)

    # role-play sessions
    def save_session(self, state: RoleplayState) -> None:
        self._sessions[(state.tenant_id, state.session_id)] = state

    def session(self, tenant_id: str, session_id: str) -> RoleplayState | None:
        return self._sessions.get((tenant_id, session_id))

    def sessions_for(self, tenant_id: str, employee_id: str) -> list[RoleplayState]:
        rows = [s for (t, _), s in self._sessions.items() if t == tenant_id and s.employee_id == employee_id]
        return sorted(rows, key=lambda s: s.started_at, reverse=True)

    def delete_session(self, tenant_id: str, session_id: str) -> RoleplayState | None:
        return self._sessions.pop((tenant_id, session_id), None)

    # retention
    def expired(
        self, now: datetime, retention_days: int
    ) -> tuple[list[ConversationState], list[RoleplayState]]:
        cutoff = now - timedelta(days=retention_days)
        return (
            [c for c in self._conversations.values() if c.created_at < cutoff],
            [s for s in self._sessions.values() if s.started_at < cutoff],
        )
