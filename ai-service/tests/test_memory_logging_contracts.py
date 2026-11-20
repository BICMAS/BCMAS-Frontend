from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from cfp_ai.memory.in_memory import InMemoryLearnerMemory, InMemoryMessageStore
from cfp_ai.memory.interfaces import LearnerFact, StoredMessage, ThreadKey
from cfp_ai.observability.logging import JsonFormatter, redact

REPO = Path(__file__).resolve().parents[2]
SERVICE = Path(__file__).resolve().parents[1]

# ── memory ───────────────────────────────────────────────────────────────────

THREAD = ThreadKey(tenant_id="org-gec", kind="coaching_session", resource_id="cs_1")


def _msg(i: int, role: str = "user", client_id: str | None = None, visible: bool = True) -> StoredMessage:
    return StoredMessage(
        message_id=f"msg_{i}",
        thread=THREAD,
        role=role,
        text=f"turn {i}",  # type: ignore[arg-type]
        created_at=datetime.now(UTC),
        client_message_id=client_id,
        visible_to_user=visible,
    )


async def test_message_store_is_idempotent_on_client_message_id() -> None:
    store = InMemoryMessageStore()
    first = await store.append(_msg(1, client_id="c-1"))
    again = await store.append(_msg(2, client_id="c-1"))
    assert again == first
    assert len(await store.list(THREAD)) == 1


async def test_window_and_hidden_messages() -> None:
    store = InMemoryMessageStore()
    for i in range(20):
        await store.append(_msg(i, "user" if i % 2 == 0 else "assistant"))
    await store.append(_msg(99, "system_note", visible=False))
    await store.set_summary(THREAD, "earlier turns summary", covers_until="msg_7")
    window = await store.window(THREAD, max_recent=12)
    assert window.total_turns == 20 and len(window.recent) == 12
    assert window.recent[-1].message_id == "msg_19"
    assert window.summary == "earlier turns summary"
    assert len(await store.list(THREAD)) == 20
    assert len(await store.list(THREAD, include_hidden=True)) == 21
    other_tenant = ThreadKey(tenant_id="org-ths", kind="coaching_session", resource_id="cs_1")
    assert await store.list(other_tenant) == ()


async def test_learner_memory_scoping_expiry_and_erasure() -> None:
    memory = InMemoryLearnerMemory()
    now = datetime.now(UTC)

    def fact(fid: str, tenant: str = "org-gec", expires: datetime | None = None) -> LearnerFact:
        return LearnerFact(
            fact_id=fid,
            tenant_id=tenant,
            employee_id="emp-8721",
            kind="preference",
            text="prefers short sessions",
            source_session_id="cs_1",
            created_at=now,
            expires_at=expires,
        )

    await memory.upsert(
        [fact("f1"), fact("f2", expires=now - timedelta(days=1)), fact("f3", tenant="org-ths")]
    )
    assert [f.fact_id for f in await memory.recall("org-gec", "emp-8721")] == ["f1"]
    assert await memory.delete("org-gec", "emp-8721", "f1")
    assert await memory.erase_subject("org-ths", "emp-8721") == 1


# ── logging redaction ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "secret",
    [
        "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl",
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWphbWVzIn0.abcdefghijk",
        "sk-ant-api03-SECRETSECRETSECRET",
        "james.miller@gec.example",
    ],
)
def test_redaction(secret: str) -> None:
    assert secret not in redact(f"value: {secret} end")


def test_json_formatter_redacts_message_and_extra_fields() -> None:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "auth header Bearer abc.def.ghi", None, None)
    record.detail = "email james.miller@gec.example key sk-proj-abcdefghijklmnop"
    line = JsonFormatter("svc", "test").format(record)
    payload = json.loads(line)
    assert "abc.def.ghi" not in line and "james.miller" not in line and "sk-proj" not in line
    assert payload["service"] == "svc"


# ── contract parity with the reviewed documents ──────────────────────────────


@pytest.mark.parametrize(
    ("service_copy", "reviewed"),
    [
        ("src/cfp_ai/schemas/public.py", "docs/ai/contracts/cfp_ai_schemas.py"),
        ("src/cfp_ai/integrations/backend/dto.py", "docs/ai/contracts/backend_contracts.py"),
    ],
)
def test_service_schemas_match_reviewed_contracts(service_copy: str, reviewed: str) -> None:
    reviewed_path = REPO / reviewed
    if not reviewed_path.exists():
        pytest.skip("reviewed contracts not present (service extracted from monorepo)")
    assert (SERVICE / service_copy).read_text(encoding="utf-8") == reviewed_path.read_text(encoding="utf-8")
