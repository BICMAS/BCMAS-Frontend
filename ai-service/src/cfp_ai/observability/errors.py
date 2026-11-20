"""Error reporting (AI_OPERATIONS_GUIDE.md §4).

Every unhandled exception is:

1. logged once as ``unhandled error`` with the stack trace, request ID, tenant and a stable
   ``error_fingerprint`` (exception type + innermost frame), so a log pipeline can group and
   alert on it;
2. counted in ``ai_unhandled_exceptions_total{type}``;
3. sent to Sentry when ``CFP_AI_SENTRY_DSN`` is set **and** the ``sentry-sdk`` package is
   installed (it is optional and not in the default image). Sentry is configured to send no
   PII: no request bodies, headers, cookies, local variables or user identity.

The client only ever receives ``internal_error`` with the request ID.
"""

from __future__ import annotations

import hashlib
import importlib
import logging
import traceback
from typing import Any

from cfp_ai.observability.metrics import Metrics
from cfp_ai.settings import Settings

log = logging.getLogger("cfp_ai.errors")
_sentry: Any = None


def fingerprint(exc: BaseException) -> str:
    frames = traceback.extract_tb(exc.__traceback__)
    where = f"{frames[-1].filename.rsplit('/', 1)[-1]}:{frames[-1].name}" if frames else "?"
    return hashlib.sha256(f"{type(exc).__name__}@{where}".encode()).hexdigest()[:12]


def _scrub(event: dict[str, Any], _hint: Any) -> dict[str, Any]:
    """Sentry ``before_send``: drop anything that could carry personal data or secrets."""
    for key in ("request", "user", "extra", "breadcrumbs"):
        event.pop(key, None)
    for exc in (event.get("exception") or {}).get("values", []):
        exc["value"] = "(redacted)"  # messages may embed user content
        for frame in (exc.get("stacktrace") or {}).get("frames", []):
            frame.pop("vars", None)
    return event


def configure_error_reporting(settings: Settings, *, version: str) -> str:
    """Initialise Sentry if configured. Returns the active mode: ``sentry`` or ``logs``."""
    global _sentry
    if settings.sentry_dsn is None:
        return "logs"
    try:
        sdk = importlib.import_module("sentry_sdk")
    except ImportError:
        log.warning("CFP_AI_SENTRY_DSN is set but sentry-sdk is not installed; reporting to logs only")
        return "logs"
    sdk.init(
        dsn=settings.sentry_dsn.get_secret_value(),
        environment=settings.env.value,
        release=settings.release or version,
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=settings.sentry_traces_sample_rate,
        before_send=_scrub,
        default_integrations=False,  # no automatic request/log capture; we report explicitly
    )
    _sentry = sdk
    return "sentry"


def report_exception(metrics: Metrics, exc: BaseException) -> None:
    fp = fingerprint(exc)
    metrics.unhandled_exceptions.labels(type(exc).__name__).inc()
    log.error(
        "unhandled error",
        exc_info=(type(exc), exc, exc.__traceback__),
        extra={"error_type": type(exc).__name__, "error_fingerprint": fp},
    )
    if _sentry is not None:
        with _sentry.new_scope() as scope:
            scope.fingerprint = [fp]
            _sentry.capture_exception(exc)
