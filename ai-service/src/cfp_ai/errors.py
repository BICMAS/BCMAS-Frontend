"""Error model (AI_TECHNICAL_SPEC.md §12).

Every failure that reaches a client is an ``AppError`` carrying a public
``ErrorCode``. Internal detail is logged, never returned.
"""

from __future__ import annotations

from collections.abc import Sequence

from cfp_ai.schemas.public import ERROR_HTTP_STATUS, ErrorBody, ErrorCode, ErrorDetail

_RETRYABLE_BY_DEFAULT: frozenset[str] = frozenset(
    {
        "upstream_unavailable",
        "ai_unavailable",
        "deadline_exceeded",
        "internal_error",
        "ai_output_invalid",
        "rate_limited",
        "budget_exceeded",
    }
)

_DEFAULT_MESSAGES: dict[str, str] = {
    "invalid_request": "The request is invalid.",
    "unauthenticated": "Authentication is required.",
    "forbidden": "You do not have access to this resource.",
    "entitlement_required": "This AI feature is not enabled for your organisation.",
    "not_found": "The resource was not found.",
    "conflict": "The resource is in a conflicting state.",
    "idempotency_conflict": "This idempotency key was used with a different request.",
    "precondition_failed": "A precondition for this request was not met.",
    "ai_output_invalid": "We couldn't produce a reliable result. Please try again.",
    "content_refused": "This request can't be completed. Try rephrasing it.",
    "backend_dependency_unconfirmed": "This feature isn't available yet.",
    "upstream_unavailable": "A required service is temporarily unavailable.",
    "rate_limited": "Too many requests. Please wait and try again.",
    "budget_exceeded": "Your organisation's AI usage limit has been reached.",
    "internal_error": "Something went wrong.",
    "ai_unavailable": "AI features are temporarily unavailable.",
    "deadline_exceeded": "The request took too long. Please try again.",
}


class AppError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str | None = None,
        *,
        retryable: bool | None = None,
        retry_after_s: int | None = None,
        details: Sequence[ErrorDetail] = (),
        backend_endpoint_ids: Sequence[str] = (),
        internal_detail: str | None = None,
    ) -> None:
        self.code: ErrorCode = code
        self.message = message or _DEFAULT_MESSAGES[code]
        self.retryable = code in _RETRYABLE_BY_DEFAULT if retryable is None else retryable
        self.retry_after_s = retry_after_s
        self.details = tuple(details)
        self.backend_endpoint_ids = tuple(backend_endpoint_ids)
        self.internal_detail = internal_detail
        super().__init__(f"{code}: {internal_detail or self.message}")

    @property
    def http_status(self) -> int:
        return ERROR_HTTP_STATUS[self.code]

    def to_body(self, request_id: str) -> ErrorBody:
        return ErrorBody(
            code=self.code,
            message=self.message,
            request_id=request_id,
            retryable=self.retryable,
            retry_after_s=self.retry_after_s,
            details=list(self.details) or None,
            backend_endpoint_ids=list(self.backend_endpoint_ids) or None,
        )
