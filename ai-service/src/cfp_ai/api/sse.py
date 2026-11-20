"""Server-Sent Events helpers (AI_API_SPEC.md §1.4).

Frames: ``meta`` → ``delta``* → ``result`` → ``done``; on failure after the stream
has started: ``error`` (no ``done``). Errors before the first frame are returned as
normal HTTP errors by priming the generator before the response starts.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from cfp_ai.errors import AppError


def frame(event: str, data: Any) -> bytes:
    if isinstance(data, BaseModel):
        data = data.model_dump(mode="json")
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode()


def wants_sse(request: Request) -> bool:
    return "text/event-stream" in request.headers.get("accept", "")


def sse_response(frames: AsyncIterator[bytes]) -> StreamingResponse:
    return StreamingResponse(
        frames,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def guarded(frames: AsyncIterator[bytes], request_id: str) -> AsyncIterator[bytes]:
    """Turns an AppError raised mid-stream into an ``error`` frame (and stops)."""
    try:
        async for chunk in frames:
            yield chunk
    except AppError as exc:
        yield frame("error", exc.to_body(request_id))
