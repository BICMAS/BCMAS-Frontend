"""Request context middleware (pure ASGI, streaming-safe).

* Accepts a well-formed ``X-Request-ID`` or generates one; echoes it on the response.
* Propagates ``traceparent`` to backend calls.
* Records request metrics and one access log line per request (no bodies, no headers).
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send
from ulid import ULID

from cfp_ai.observability.context import (
    capability_var,
    principal_hash_var,
    request_id_var,
    tenant_id_var,
    traceparent_var,
)
from cfp_ai.observability.metrics import Metrics
from cfp_ai.schemas.public import CONTRACT_VERSION

log = logging.getLogger("cfp_ai.access")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._\-]{1,64}$")
_TRACEPARENT = re.compile(r"^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$")


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, metrics: Metrics) -> None:
        self.app = app
        self.metrics = metrics

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        incoming = headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID.match(incoming) else f"req_{ULID()}"
        traceparent = headers.get("traceparent", "")
        state: dict[str, Any] = scope.setdefault("state", {})
        state["request_id"] = request_id

        tokens = [
            (request_id_var, request_id_var.set(request_id)),
            (traceparent_var, traceparent_var.set(traceparent if _TRACEPARENT.match(traceparent) else None)),
            (tenant_id_var, tenant_id_var.set(None)),
            (principal_hash_var, principal_hash_var.set(None)),
            (capability_var, capability_var.set(None)),
        ]
        status = {"code": 500}
        started = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
                extra = [
                    (b"x-request-id", request_id.encode()),
                    (b"x-ai-contract-version", CONTRACT_VERSION.encode()),
                ]
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration = time.perf_counter() - started
            route = scope.get("route")
            route_label = getattr(route, "path", "unmatched")
            error_code = state.get("error_code", "")
            self.metrics.requests.labels(route_label, str(status["code"]), error_code).inc()
            self.metrics.request_duration.labels(route_label).observe(duration)
            log.info(
                "request",
                extra={
                    "method": scope["method"],
                    "route": route_label,
                    "status": status["code"],
                    "duration_ms": int(duration * 1000),
                    "error_code": error_code or None,
                },
            )
            for var, token in reversed(tokens):
                var.reset(token)
