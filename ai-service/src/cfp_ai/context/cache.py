"""In-process TTL cache for backend reads.

Keys always include the principal's ``visibility_scope`` so data fetched for one
principal is never served to another with different visibility (§5.4).
A shared cache (Redis) replaces this when the service runs multiple replicas;
the interface stays the same.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any


class TtlCache:
    def __init__(self, *, max_entries: int = 10_000, clock: Callable[[], float] = time.monotonic) -> None:
        self._data: dict[str, tuple[float, Any]] = {}
        self._max = max_entries
        self._clock = clock

    def get(self, key: str) -> Any | None:
        item = self._data.get(key)
        if item is None:
            return None
        expires, value = item
        if self._clock() >= expires:
            self._data.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl_s: float) -> None:
        if len(self._data) >= self._max:
            # Drop the soonest-expiring 10% (cheap, bounded memory).
            for stale in sorted(self._data, key=lambda k: self._data[k][0])[: self._max // 10 or 1]:
                self._data.pop(stale, None)
        self._data[key] = (self._clock() + ttl_s, value)

    def invalidate_prefix(self, prefix: str) -> int:
        keys = [k for k in self._data if k.startswith(prefix)]
        for key in keys:
            del self._data[key]
        return len(keys)

    def invalidate_where(self, predicate: Callable[[str], bool]) -> int:
        keys = [k for k in self._data if predicate(k)]
        for key in keys:
            del self._data[key]
        return len(keys)
