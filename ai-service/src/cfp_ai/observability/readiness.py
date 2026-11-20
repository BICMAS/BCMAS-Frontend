"""Readiness checks (AI_OPERATIONS_GUIDE.md §2).

``/healthz`` (liveness) only says the process is serving. ``/readyz`` decides whether this
replica should receive traffic:

* **critical** checks fail readiness (503): an LLM provider and the router's route are
  usable, the workflow store is readable and writable, and the replica is not draining;
* **advisory** checks are reported but never fail readiness, because the dependency is
  shared by every replica and taking all of them out of rotation would turn a partial
  outage into a total one: JWKS reachability, backend connectivity mode, durable storage.

Results are cached briefly so frequent probes do not hammer dependencies. No secrets, URLs
or tenant data are returned.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel

from cfp_ai.container import Container
from cfp_ai.settings import BackendMode
from cfp_ai.workflows.store import SqliteWorkflowStore

CheckStatus = Literal["ok", "degraded", "failed"]
CORE_ROUTE = "orchestrator.route"


class Check(BaseModel):
    name: str
    status: CheckStatus
    critical: bool
    detail: str | None = None


class Readiness(BaseModel):
    status: Literal["ready", "not_ready"]
    version: str
    release: str | None
    checks: list[Check]


@dataclass
class ReadinessChecker:
    container: Container
    version: str
    cache_s: float = 10.0
    draining: bool = False
    _cached: tuple[float, Readiness] | None = field(default=None, init=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, init=False)

    async def check(self) -> Readiness:
        if self.draining:
            return self._result([Check(name="lifecycle", status="failed", critical=True, detail="draining")])
        async with self._lock:
            now = time.monotonic()
            if self._cached and now - self._cached[0] < self.cache_s:
                return self._cached[1]
            result = self._result(await self._run())
            self._cached = (now, result)
            return result

    def _result(self, checks: list[Check]) -> Readiness:
        failed = any(c.critical and c.status == "failed" for c in checks)
        return Readiness(
            status="not_ready" if failed else "ready",
            version=self.version,
            release=self.container.settings.release,
            checks=checks,
        )

    async def _run(self) -> list[Check]:
        c = self.container
        s = c.settings
        checks: list[Check] = []

        if not c.providers:
            checks.append(
                Check(name="llm_provider", status="failed", critical=True, detail="none configured")
            )
        else:
            checks.append(
                Check(name="llm_provider", status="ok", critical=True, detail=",".join(sorted(c.providers)))
            )
        usable = c.gateway.route_usable(CORE_ROUTE)
        checks.append(
            Check(
                name="llm_routes",
                status="ok" if usable else "failed",
                critical=True,
                detail=None if usable else f"{CORE_ROUTE} has no usable provider",
            )
        )

        if isinstance(c.workflow_store, SqliteWorkflowStore):
            try:
                await asyncio.to_thread(c.workflow_store.ping)
                checks.append(Check(name="workflow_store", status="ok", critical=True, detail="sqlite"))
            except Exception as exc:
                checks.append(
                    Check(name="workflow_store", status="failed", critical=True, detail=type(exc).__name__)
                )
        else:
            checks.append(
                Check(
                    name="workflow_store", status="degraded", critical=False, detail="in-memory (not durable)"
                )
            )

        probe = getattr(c.verifier, "probe", None)
        problem = await probe() if probe is not None else None
        checks.append(
            Check(name="auth_jwks", status="degraded" if problem else "ok", critical=False, detail=problem)
        )

        confirmed = c.endpoints.counts().get("available", 0)
        checks.append(
            Check(
                name="backend",
                status="ok" if s.backend_mode is BackendMode.HTTP and confirmed else "degraded",
                critical=False,
                detail=f"mode={s.backend_mode.value}, confirmed_endpoints={confirmed}",
            )
        )
        checks.append(
            Check(
                name="state_stores",
                status="degraded",
                critical=False,
                detail="memory, drafts, executions, audit and usage are in-memory (single replica)",
            )
        )
        return checks
