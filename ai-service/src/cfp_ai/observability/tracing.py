"""OpenTelemetry tracing setup (AI_TECHNICAL_SPEC.md §13.2).

Exporters: ``none`` (default) or ``console`` (local debugging). An OTLP exporter
is added at deployment time by installing ``opentelemetry-exporter-otlp`` and
extending ``configure_tracing``; spans are emitted regardless.
"""

from __future__ import annotations

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

_configured = False


def configure_tracing(*, service: str, env: str, version: str, exporter: str) -> None:
    global _configured
    if _configured:
        return
    provider = TracerProvider(
        resource=Resource.create(
            {"service.name": service, "deployment.environment": env, "service.version": version}
        )
    )
    if exporter == "console":
        provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
    trace.set_tracer_provider(provider)
    _configured = True


def tracer() -> trace.Tracer:
    return trace.get_tracer("cfp_ai")
