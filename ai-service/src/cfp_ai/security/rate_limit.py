"""Per-user and per-tenant request rate limits (AI_API_SPEC.md §8; QA_REPORT.md §4).

Sliding one-minute windows, checked after authentication for every API request. Exceeding a
limit returns ``429 rate_limited`` with ``Retry-After``. In-memory and per replica: behind a
load balancer the effective limit is N × the configured value until a shared store is used.
"""

from __future__ import annotations

import math
import time
from collections import defaultdict, deque

from cfp_ai.auth.principal import Principal
from cfp_ai.errors import AppError

WINDOW_S = 60.0


class RateLimiter:
    def __init__(self, *, per_user: int, per_tenant: int, clock: object = time.monotonic) -> None:
        self._per_user = per_user
        self._per_tenant = per_tenant
        self._clock = clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _now(self) -> float:
        return float(self._clock())  # type: ignore[operator]

    def _check(self, key: str, limit: int, now: float) -> float | None:
        """Seconds until a slot frees up, or None when allowed (and counted)."""
        hits = self._hits[key]
        while hits and hits[0] <= now - WINDOW_S:
            hits.popleft()
        if len(hits) >= limit:
            return hits[0] + WINDOW_S - now
        return None

    def check(self, principal: Principal) -> None:
        if self._per_user <= 0 and self._per_tenant <= 0:
            return
        now = self._now()
        user_key = f"u:{principal.tenant_id}:{principal.subject}"
        tenant_key = f"t:{principal.tenant_id}"
        for key, limit, scope in (
            (user_key, self._per_user, "user"),
            (tenant_key, self._per_tenant, "tenant"),
        ):
            if limit > 0 and (wait := self._check(key, limit, now)) is not None:
                raise AppError(
                    "rate_limited",
                    retry_after_s=max(1, math.ceil(wait)),
                    internal_detail=f"{scope} rate limit ({limit}/min)",
                )
        if self._per_user > 0:
            self._hits[user_key].append(now)
        if self._per_tenant > 0:
            self._hits[tenant_key].append(now)
