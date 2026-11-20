"""FastAPI application factory.

Security posture:
  * No CORS middleware: the service is called by the frontend's server-side BFF
    (``/api/ai/*``), never directly by browsers. API keys exist only in this
    service's environment and are never returned by any endpoint.
  * OpenAPI/docs only in dev/test unless explicitly enabled.
  * Dev-only routes are not mounted outside dev/test.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from cfp_ai import __version__
from cfp_ai.api.errors import install_error_handlers
from cfp_ai.api.middleware import RequestContextMiddleware
from cfp_ai.api.routes import coaching, dev_plans, drafts, events, orchestrator, system, talent, workflows
from cfp_ai.container import Container, build_container, describe
from cfp_ai.observability.context import set_principal_hash_key
from cfp_ai.observability.logging import configure_logging
from cfp_ai.observability.tracing import configure_tracing
from cfp_ai.settings import Settings, get_settings

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, *, container: Container | None = None) -> FastAPI:
    settings = settings or (container.settings if container else get_settings())
    configure_logging(
        level=settings.log_level,
        json_output=settings.log_json,
        service=settings.service_name,
        env=settings.env.value,
    )
    configure_tracing(
        service=settings.service_name,
        env=settings.env.value,
        version=__version__,
        exporter=settings.otel_exporter,
    )
    if settings.log_hash_key is not None:
        set_principal_hash_key(settings.log_hash_key.get_secret_value().encode())
    container = container or build_container(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        log.info("service starting", extra=describe(container))
        yield
        await container.aclose()
        log.info("service stopped")

    docs = settings.docs_enabled
    app = FastAPI(
        title="CFP AI Intelligence Service",
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    app.state.container = container
    install_error_handlers(app)
    app.add_middleware(RequestContextMiddleware, metrics=container.metrics)
    app.include_router(system.router)
    app.include_router(orchestrator.router)
    app.include_router(coaching.router)
    app.include_router(coaching.me_router)
    app.include_router(dev_plans.router)
    app.include_router(drafts.router)
    app.include_router(talent.router)
    app.include_router(workflows.router)
    app.include_router(events.router)
    app.state.event_dedup = events.EventDeduplicator()
    if settings.env.is_local:
        from cfp_ai.api.routes import dev

        app.include_router(dev.router)
    return app
