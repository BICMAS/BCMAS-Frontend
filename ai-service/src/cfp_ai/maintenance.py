"""Scheduled maintenance inside the service (AI_OPERATIONS_GUIDE.md §6).

The only job today enforces coaching retention: transcripts, summaries and evaluations older
than ``CFP_AI_COACHING_RETENTION_DAYS`` are erased. It runs once shortly after start-up and then
every ``CFP_AI_MAINTENANCE_INTERVAL_S`` seconds (``0`` disables it, for example when an external
scheduler calls the same job). Failures are logged and counted, never fatal, and the loop stops
cleanly on shutdown. With several replicas each runs the job on its own data; that is correct
while state is per process, and must move to a single scheduler with durable stores.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from cfp_ai.observability.metrics import Metrics

log = logging.getLogger(__name__)
Job = Callable[[], Awaitable[dict[str, int]]]


@dataclass
class Maintenance:
    jobs: dict[str, Job]
    metrics: Metrics
    interval_s: float
    initial_delay_s: float = 30.0
    _task: asyncio.Task[None] | None = field(default=None, init=False)

    async def run_once(self) -> dict[str, dict[str, int] | str]:
        results: dict[str, dict[str, int] | str] = {}
        for name, job in self.jobs.items():
            try:
                outcome = await job()
            except Exception as exc:  # a failed job must not stop the others or the loop
                self.metrics.maintenance_runs.labels(name, "error").inc()
                log.error("maintenance job failed", extra={"job": name, "error_type": type(exc).__name__})
                results[name] = "error"
                continue
            self.metrics.maintenance_runs.labels(name, "ok").inc()
            log.info(
                "maintenance job", extra={"job": name, **{f"removed_{k}": v for k, v in outcome.items()}}
            )
            results[name] = outcome
        return results

    async def _loop(self) -> None:
        await asyncio.sleep(self.initial_delay_s)
        while True:
            await self.run_once()
            await asyncio.sleep(self.interval_s)

    def start(self) -> None:
        if self.interval_s > 0 and self._task is None:
            self._task = asyncio.create_task(self._loop(), name="cfp-ai-maintenance")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
