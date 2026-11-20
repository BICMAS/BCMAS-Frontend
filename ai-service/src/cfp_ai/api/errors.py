"""Exception handlers → ``ErrorEnvelope`` (AI_TECHNICAL_SPEC.md §12)."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.observability.errors import report_exception
from cfp_ai.schemas.public import ErrorDetail, ErrorEnvelope

log = logging.getLogger(__name__)

_HTTP_TO_CODE = {
    400: "invalid_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    405: "invalid_request",
    409: "conflict",
    429: "rate_limited",
}


def _respond(request: Request, error: AppError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    request.scope.setdefault("state", {})["error_code"] = error.code
    envelope = ErrorEnvelope(error=error.to_body(request_id))
    headers = {"Retry-After": str(error.retry_after_s)} if error.retry_after_s else None
    return JSONResponse(
        envelope.model_dump(mode="json", exclude_none=True), status_code=error.http_status, headers=headers
    )


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError) -> JSONResponse:
        level = logging.ERROR if exc.http_status >= 500 else logging.INFO
        log.log(level, "request failed", extra={"error_code": exc.code, "detail": exc.internal_detail})
        return _respond(request, exc)

    @app.exception_handler(BackendError)
    async def backend_error(request: Request, exc: BackendError) -> JSONResponse:
        return await app_error(request, exc.to_app_error())

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            ErrorDetail(
                field=".".join(str(p) for p in err.get("loc", ()) if p != "body") or None,
                issue=str(err.get("msg", "invalid")),
            )  # never echo the submitted value
            for err in exc.errors()[:20]
        ]
        return _respond(request, AppError("invalid_request", details=details))

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_TO_CODE.get(exc.status_code, "internal_error")
        return _respond(request, AppError(code, internal_detail=str(exc.detail)))  # type: ignore[arg-type]

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        report_exception(request.app.state.container.metrics, exc)
        return _respond(request, AppError("internal_error", internal_detail=type(exc).__name__))
