"""Structured JSON logging with redaction (AI_TECHNICAL_SPEC.md §13.1).

Never logged: tokens, API keys, prompt/response bodies, emails. The redaction
filter is a safety net; code must also avoid passing such values to loggers.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import UTC, datetime
from typing import Any

from cfp_ai.observability.context import (
    capability_var,
    principal_hash_var,
    request_id_var,
    tenant_id_var,
)

_REDACTIONS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9\-_.~+/]+=*"), "Bearer [REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*"), "[REDACTED_JWT]"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{10,}"), "[REDACTED_KEY]"),
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[REDACTED_EMAIL]"),
]

_STANDARD_ATTRS = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", None, None)).keys() | {"message", "asctime"}
)


def redact(text: str) -> str:
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def _redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, dict):
        return {k: _redact_value(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_redact_value(v) for v in value]
    return value


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str, env: str) -> None:
        super().__init__()
        self._service = service
        self._env = env

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "service": self._service,
            "env": self._env,
            "event": redact(record.getMessage()),
            "request_id": request_id_var.get(),
            "tenant_id": tenant_id_var.get(),
            "principal_hash": principal_hash_var.get(),
            "capability": capability_var.get(),
        }
        for key, value in record.__dict__.items():
            if key not in _STANDARD_ATTRS and not key.startswith("_"):
                payload[key] = _redact_value(value)
        if record.exc_info:
            payload["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps({k: v for k, v in payload.items() if v is not None}, default=str)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        rid = request_id_var.get() or "-"
        base = f"{record.levelname:<7} {record.name} [{rid}] {redact(record.getMessage())}"
        if record.exc_info:
            base += "\n" + redact(self.formatException(record.exc_info))
        return base


def configure_logging(*, level: str, json_output: bool, service: str, env: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service, env) if json_output else TextFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # Third-party clients log full request lines (and sometimes headers) at DEBUG/INFO.
    for noisy in ("httpx", "httpcore", "anthropic", "openai", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(max(logging.WARNING, logging.getLevelName(level)))
