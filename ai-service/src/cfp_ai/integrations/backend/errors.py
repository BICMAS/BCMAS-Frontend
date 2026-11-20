"""Backend call failures, independent of transport (HTTP or mock)."""

from __future__ import annotations

from typing import Literal

from cfp_ai.errors import AppError

BackendErrorKind = Literal[
    "not_callable",  # registry: endpoint not available in this environment
    "unauthorized",  # 401
    "forbidden",  # 403
    "not_found",  # 404
    "conflict",  # 409
    "rate_limited",  # 429 after retries (Retry-After honoured)
    "bad_request",  # 400/422 — our bug
    "unavailable",  # 5xx, timeout, circuit open, connection error
    "contract_violation",  # response did not match the expected DTO
]


class BackendError(Exception):
    def __init__(self, endpoint_id: str, kind: BackendErrorKind, detail: str = "") -> None:
        super().__init__(f"{endpoint_id} {kind}: {detail}")
        self.endpoint_id = endpoint_id
        self.kind = kind
        self.detail = detail

    def to_app_error(self) -> AppError:
        ids = [self.endpoint_id]
        match self.kind:
            case "not_callable":
                return AppError(
                    "backend_dependency_unconfirmed", backend_endpoint_ids=ids, internal_detail=str(self)
                )
            case "unauthorized":
                return AppError("unauthenticated", internal_detail=str(self))
            case "forbidden":
                return AppError("forbidden", internal_detail=str(self))
            case "not_found":
                return AppError("not_found", internal_detail=str(self))
            case "conflict":
                return AppError("conflict", internal_detail=str(self))
            case "bad_request":
                return AppError("internal_error", internal_detail=str(self))
            case "rate_limited":
                return AppError("rate_limited", backend_endpoint_ids=ids, internal_detail=str(self))
            case _:
                return AppError("upstream_unavailable", backend_endpoint_ids=ids, internal_detail=str(self))
