"""Minimal per-key circuit breaker (AI_TECHNICAL_SPEC.md §8.4, BACKEND_INTEGRATION_SPEC.md §4.1)."""

from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field


@dataclass
class _State:
    events: deque[tuple[float, bool]] = field(default_factory=deque)  # (timestamp, ok)
    opened_at: float | None = None
    half_open_trial: bool = False


class CircuitBreaker:
    def __init__(
        self,
        *,
        window_s: float = 30.0,
        min_calls: int = 20,
        failure_ratio: float = 0.5,
        open_s: float = 30.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._window = window_s
        self._min_calls = min_calls
        self._ratio = failure_ratio
        self._open_s = open_s
        self._clock = clock
        self._states: dict[str, _State] = {}

    def _state(self, key: str) -> _State:
        return self._states.setdefault(key, _State())

    def is_open(self, key: str) -> bool:
        state = self._state(key)
        if state.opened_at is None:
            return False
        if self._clock() - state.opened_at >= self._open_s and not state.half_open_trial:
            state.half_open_trial = True  # allow exactly one trial call
            return False
        return True

    def record(self, key: str, ok: bool) -> None:
        state = self._state(key)
        now = self._clock()
        if state.opened_at is not None:
            if ok:
                self._states[key] = _State()
            else:
                state.opened_at = now
                state.half_open_trial = False
            return
        state.events.append((now, ok))
        while state.events and now - state.events[0][0] > self._window:
            state.events.popleft()
        failures = sum(1 for _, success in state.events if not success)
        if len(state.events) >= self._min_calls and failures / len(state.events) >= self._ratio:
            state.opened_at = now
            state.events.clear()
