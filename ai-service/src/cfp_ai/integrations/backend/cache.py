"""HTTP-level cache for tenant **reference data** only (BACKEND_INTEGRATION_SPEC.md §4.5).

Cached: proficiency scale, skills (levels and indicators), role profiles, role records with
job descriptions, and catalogue items. These are the same for everyone in a tenant. Entries
are keyed by tenant + endpoint + path + query, honour ``Cache-Control`` (``no-store`` and
``max-age``), and are revalidated with ``If-None-Match`` once stale (a ``304`` refreshes them).

Employee data (profiles, capabilities, learning records, plans, assessments, performance) is
**never** cached here. It is cached only briefly, per visibility scope, by the context
builder, and invalidated by backend events.
"""

from __future__ import annotations

import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

REFERENCE_ENDPOINTS: frozenset[str] = frozenset({"BE-020", "BE-022", "BE-023", "BE-024", "BE-041"})
_MAX_AGE = re.compile(r"max-age=(\d+)")


@dataclass
class CachedResponse:
    data: Any
    etag: str | None
    fresh_until: float


class ReferenceCache:
    def __init__(self, *, ttl_s: float = 300, max_entries: int = 5_000) -> None:
        self._ttl = ttl_s
        self._max = max_entries
        self._entries: OrderedDict[tuple[str, ...], CachedResponse] = OrderedDict()
        self.hits = self.revalidated = 0

    @staticmethod
    def key(tenant_id: str, endpoint_id: str, path: str, params: dict[str, Any] | None) -> tuple[str, ...]:
        items = sorted((params or {}).items())
        query = "&".join(f"{k}={v}" for k, v in items)
        return (tenant_id, endpoint_id, path, query)

    def get(self, key: tuple[str, ...]) -> CachedResponse | None:
        entry = self._entries.get(key)
        if entry is not None:
            self._entries.move_to_end(key)
        return entry

    def fresh(self, entry: CachedResponse) -> bool:
        return entry.fresh_until > time.monotonic()

    def store(self, key: tuple[str, ...], data: Any, headers: Any) -> None:
        control = (headers.get("cache-control") or "").lower()
        if "no-store" in control or "private" in control:
            self._entries.pop(key, None)
            return
        ttl = self._ttl
        if match := _MAX_AGE.search(control):
            ttl = min(ttl, int(match.group(1)))
        self._entries[key] = CachedResponse(
            data=data, etag=headers.get("etag"), fresh_until=time.monotonic() + ttl
        )
        self._entries.move_to_end(key)
        while len(self._entries) > self._max:
            self._entries.popitem(last=False)

    def refresh(self, key: tuple[str, ...], headers: Any) -> CachedResponse | None:
        entry = self._entries.get(key)
        if entry is None:
            return None
        self.revalidated += 1
        self.store(key, entry.data, {"etag": headers.get("etag") or entry.etag, **dict(headers)})
        return self._entries.get(key)

    def invalidate_tenant(self, tenant_id: str) -> int:
        doomed = [k for k in self._entries if k[0] == tenant_id]
        for key in doomed:
            del self._entries[key]
        return len(doomed)
