"""LLM usage tracking and monthly token budgets (AI_OPERATIONS_GUIDE.md §5).

Every successful model call is recorded per tenant and calendar month (UTC): calls, input,
output and cache tokens, estimated cost (from ``prices_per_mtok`` in the route table) and
latency per capability. Before each call the gateway checks the tenant's monthly token budget
and refuses with ``budget_exceeded`` once it is used up. Usage crossing the warning ratio is
logged once per tenant and month.

Budgets come from settings: ``llm_monthly_token_budget`` (default for all tenants, ``None`` =
unlimited) and ``llm_tenant_token_budgets`` (per-tenant overrides). When the backend's tenant
settings (BE-005, ``ai_monthly_token_budget``, PROPOSED) are confirmed they can feed the same
overrides.

The store is in process memory (per replica, reset on restart). Prometheus counters
(``ai_llm_tokens_total``, ``ai_llm_cost_usd_total``) are the durable source for billing and
dashboards; this tracker exists for fast budget enforcement and the admin usage API.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict, deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime

from cfp_ai.errors import AppError

log = logging.getLogger(__name__)
_LATENCY_SAMPLES = 500


def month_key(at: datetime) -> str:
    return at.astimezone(UTC).strftime("%Y-%m")


@dataclass
class TenantUsage:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0
    unpriced_calls: int = 0  # model without a price entry: cost is an underestimate
    warned: bool = False
    latency_ms: dict[str, deque[int]] = field(
        default_factory=lambda: defaultdict(lambda: deque(maxlen=_LATENCY_SAMPLES))
    )

    @property
    def tokens(self) -> int:
        return self.input_tokens + self.output_tokens


def p95(samples: deque[int] | list[int]) -> int:
    ordered = sorted(samples)
    if not ordered:
        return 0
    return ordered[min(len(ordered) - 1, round(0.95 * (len(ordered) - 1)))]


class UsageTracker:
    def __init__(
        self,
        *,
        default_budget: int | None = None,
        tenant_budgets: Mapping[str, int] | None = None,
        warn_ratio: float = 0.8,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._default = default_budget
        self._overrides = dict(tenant_budgets or {})
        self._warn = warn_ratio
        self._clock = clock
        self._usage: dict[tuple[str, str], TenantUsage] = {}
        self._lock = threading.Lock()

    def budget(self, tenant_id: str) -> int | None:
        return self._overrides.get(tenant_id, self._default)

    def _row(self, tenant_id: str, month: str) -> TenantUsage:
        key = (tenant_id, month)
        if key not in self._usage:
            self._usage[key] = TenantUsage()
        return self._usage[key]

    def check(self, tenant_id: str) -> None:
        """Raise ``budget_exceeded`` when the tenant has used its monthly token budget."""
        budget = self.budget(tenant_id)
        if budget is None:
            return
        with self._lock:
            used = self._row(tenant_id, month_key(self._clock())).tokens
        if used >= budget:
            raise AppError(
                "budget_exceeded", internal_detail=f"tenant monthly token budget used ({used}/{budget})"
            )

    def record(
        self,
        tenant_id: str,
        *,
        capability: str,
        input_tokens: int,
        output_tokens: int,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        cost_usd: float | None,
        latency_ms: int,
    ) -> float | None:
        """Record one call. Returns the budget used ratio (``None`` when unlimited)."""
        budget = self.budget(tenant_id)
        with self._lock:
            row = self._row(tenant_id, month_key(self._clock()))
            row.calls += 1
            row.input_tokens += input_tokens
            row.output_tokens += output_tokens
            row.cache_read_tokens += cache_read_tokens
            row.cache_write_tokens += cache_write_tokens
            if cost_usd is None:
                row.unpriced_calls += 1
            else:
                row.cost_usd += cost_usd
            row.latency_ms[capability].append(latency_ms)
            ratio = row.tokens / budget if budget else None
            warn = ratio is not None and ratio >= self._warn and not row.warned
            if warn:
                row.warned = True
        if warn:
            log.warning("llm budget warning", extra={"tenant_id": tenant_id, "budget_used_ratio": ratio})
        return ratio

    def snapshot(self, month: str | None = None) -> dict[str, TenantUsage]:
        month = month or month_key(self._clock())
        with self._lock:
            return {tenant: row for (tenant, m), row in self._usage.items() if m == month}


__all__ = ["TenantUsage", "UsageTracker", "month_key", "p95"]
