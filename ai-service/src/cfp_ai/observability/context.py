"""Request-scoped context propagated to logs, traces and backend calls."""

from __future__ import annotations

import hashlib
import hmac
from contextvars import ContextVar

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
traceparent_var: ContextVar[str | None] = ContextVar("traceparent", default=None)
tenant_id_var: ContextVar[str | None] = ContextVar("tenant_id", default=None)
principal_hash_var: ContextVar[str | None] = ContextVar("principal_hash", default=None)
capability_var: ContextVar[str | None] = ContextVar("capability", default=None)

# Keyed hash so log identifiers are stable across replicas but not reversible without
# the key. Set from CFP_AI_LOG_HASH_KEY at startup; the default is for dev/test only.
_hash_key = b"cfp-ai-dev-only-log-hash-key"


def set_principal_hash_key(key: bytes) -> None:
    global _hash_key
    _hash_key = key


def principal_hash(subject: str) -> str:
    """Stable, non-reversible identifier for logs (never log raw user IDs)."""
    return hmac.new(_hash_key, subject.encode(), hashlib.sha256).hexdigest()[:16]
