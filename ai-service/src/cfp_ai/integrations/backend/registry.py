"""Backend endpoint registry (BACKEND_INTEGRATION_SPEC.md §1).

The single switch deciding whether the AI service may call a backend endpoint.
Every endpoint is PROPOSED until the backend team confirms it; the service only
calls endpoints that are ``available`` (any environment) or ``mocked`` (dev/test).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

import yaml

from cfp_ai.settings import Environment

EndpointStatus = Literal["proposed", "confirmed", "mocked", "available", "rejected"]
_VALID_STATUSES: frozenset[str] = frozenset({"proposed", "confirmed", "mocked", "available", "rejected"})


@dataclass(frozen=True)
class EndpointEntry:
    id: str
    method: str
    path: str
    caller: str
    auth: str
    purpose: str
    used_by: tuple[str, ...]
    status: dict[str, EndpointStatus]


class BackendEndpointRegistry:
    def __init__(self, entries: dict[str, EndpointEntry], environment: Environment) -> None:
        self._entries = entries
        self._environment = environment
        self._column = "dev" if environment.is_local else environment.value

    @classmethod
    def load(cls, path: Path, environment: Environment) -> BackendEndpointRegistry:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        entries: dict[str, EndpointEntry] = {}
        for item in raw["endpoints"]:
            status = {str(k): str(v) for k, v in item["status"].items()}
            bad = {v for v in status.values() if v not in _VALID_STATUSES}
            if bad:
                raise ValueError(f"{item['id']}: invalid status {bad}")
            if item["id"] in entries:
                raise ValueError(f"duplicate endpoint id {item['id']}")
            entries[item["id"]] = EndpointEntry(
                id=item["id"],
                method=item["method"],
                path=str(item["path"]),
                caller=item["caller"],
                auth=item["auth"],
                purpose=item["purpose"],
                used_by=tuple(str(u) for u in item.get("used_by", [])),
                status=cast(dict[str, EndpointStatus], status),
            )
        return cls(entries, environment)

    @property
    def environment(self) -> Environment:
        return self._environment

    def ids(self) -> list[str]:
        return sorted(self._entries)

    def entry(self, endpoint_id: str) -> EndpointEntry | None:
        return self._entries.get(endpoint_id)

    def status(self, endpoint_id: str) -> EndpointStatus | None:
        entry = self._entries.get(endpoint_id)
        return entry.status.get(self._column) if entry else None

    def is_callable(self, endpoint_id: str) -> bool:
        status = self.status(endpoint_id)
        if status == "available":
            return True
        return status == "mocked" and self._environment.is_local

    def counts(self) -> dict[str, int]:
        result: dict[str, int] = {}
        for endpoint_id in self._entries:
            key = self.status(endpoint_id) or "unknown"
            result[key] = result.get(key, 0) + 1
        return result
