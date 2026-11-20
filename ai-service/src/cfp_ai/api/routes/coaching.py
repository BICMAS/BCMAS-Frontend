"""AI Coaching Agent API (AI_API_SPEC.md §3 + v1.2 additions in docs/ai/COACHING_AGENT.md §8).

All endpoints require a verified principal and pass the capability registry
(role, entitlement, backend dependencies). Coaching data is always about the
caller; transcripts are owner-only. Message endpoints stream SSE when the client
sends ``Accept: text/event-stream`` and return JSON otherwise.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request, Response

from cfp_ai.agents.coaching.models import (
    CoachingConversation,
    CoachingSummary,
    CoachingTurnResult,
    ManagerSessionView,
    StartConversationRequest,
)
from cfp_ai.agents.coaching.modes import ModeInfo, mode_catalogue
from cfp_ai.agents.coaching.service import CoachingService
from cfp_ai.api.sse import frame, guarded, sse_response, wants_sse
from cfp_ai.auth.dependencies import CurrentPrincipal
from cfp_ai.errors import AppError
from cfp_ai.llm.types import LlmStreamDelta
from cfp_ai.orchestrator.models import OrchestrationRequest
from cfp_ai.schemas.public import (
    CoachMetrics,
    CoachScenario,
    CoachScenarioAdmin,
    CoachSession,
    CoachSessionSummary,
    CoachTurnResult,
    CreateCoachSessionRequest,
    LearnerMemoryFact,
    ManagerBriefRequest,
    ManagerCoachingBrief,
    PublishScenarioRequest,
    ScenarioRecommendationsResponse,
    SendCoachMessageRequest,
    SessionEvaluation,
)

router = APIRouter(prefix="/v1/coaching", tags=["coaching"])
me_router = APIRouter(prefix="/v1/me", tags=["personal data"])


def _svc(request: Request) -> CoachingService:
    service: CoachingService = request.app.state.container.coaching
    return service


def _meta(request: Request, capability: str, resource_id: str) -> dict[str, Any]:
    return {
        "request_id": request.state.request_id,
        "capability": capability,
        "model": "",
        "resource_id": resource_id,
        "turn_id": None,
    }


# ── modes & scenarios ────────────────────────────────────────────────────────


@router.get("/modes", response_model=list[ModeInfo])
async def modes(principal: CurrentPrincipal) -> list[ModeInfo]:
    return mode_catalogue()


@router.get("/scenarios", response_model=list[CoachScenarioAdmin | CoachScenario])
async def list_scenarios(
    request: Request, principal: CurrentPrincipal
) -> list[CoachScenario | CoachScenarioAdmin]:
    return _svc(request).list_scenarios(principal)


@router.get("/scenarios/recommended", response_model=ScenarioRecommendationsResponse)
async def recommended(
    request: Request, principal: CurrentPrincipal, limit: Annotated[int, Query(ge=1, le=10)] = 3
) -> ScenarioRecommendationsResponse:
    return await _svc(request).recommend_scenarios(principal, limit)


@router.get("/scenarios/{scenario_id}", response_model=CoachScenarioAdmin | CoachScenario)
async def get_scenario(
    request: Request, scenario_id: str, principal: CurrentPrincipal
) -> CoachScenario | CoachScenarioAdmin:
    return _svc(request).get_scenario(principal, scenario_id)


@router.post("/scenarios", response_model=CoachScenarioAdmin, status_code=201)
async def publish_scenario(
    request: Request, body: PublishScenarioRequest, principal: CurrentPrincipal
) -> CoachScenarioAdmin:
    return await _svc(request).publish_scenario(principal, body)


# ── coaching conversations (7 modes) ─────────────────────────────────────────


@router.post("/conversations", response_model=CoachingConversation, status_code=201)
async def start_conversation(
    request: Request, body: StartConversationRequest, principal: CurrentPrincipal
) -> CoachingConversation:
    return await _svc(request).start_conversation(principal, body)


@router.get("/conversations", response_model=list[CoachingConversation])
async def list_conversations(request: Request, principal: CurrentPrincipal) -> list[CoachingConversation]:
    return await _svc(request).list_conversations(principal)


@router.get("/conversations/{conversation_id}", response_model=CoachingConversation)
async def get_conversation(
    request: Request, conversation_id: str, principal: CurrentPrincipal
) -> CoachingConversation:
    return await _svc(request).get_conversation(principal, conversation_id)


@router.post("/conversations/{conversation_id}/messages", response_model=CoachingTurnResult)
async def conversation_message(
    request: Request, conversation_id: str, body: SendCoachMessageRequest, principal: CurrentPrincipal
) -> Any:
    result = await _svc(request).conversation_turn(
        principal, conversation_id, body.text, body.client_message_id
    )
    if not wants_sse(request):
        return result

    async def frames() -> AsyncIterator[bytes]:
        yield frame(
            "meta",
            {
                **_meta(request, "coaching.conversation_turn", conversation_id),
                "turn_id": result.assistant_message.message_id,
            },
        )
        for word in result.assistant_message.text.split(
            " "
        ):  # generated as structured output, then delivered
            yield frame("delta", {"text": word + " "})
        yield frame("result", result)
        yield frame("done", {})

    return sse_response(frames())


@router.post("/conversations/{conversation_id}/end", response_model=CoachingSummary)
async def end_conversation(
    request: Request, conversation_id: str, principal: CurrentPrincipal
) -> CoachingSummary:
    return await _svc(request).end_conversation(principal, conversation_id)


@router.get("/conversations/{conversation_id}/summary", response_model=CoachingSummary)
async def conversation_summary(
    request: Request, conversation_id: str, principal: CurrentPrincipal
) -> CoachingSummary:
    return _svc(request).get_summary(principal, conversation_id)


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    request: Request, conversation_id: str, principal: CurrentPrincipal
) -> Response:
    await _svc(request).delete_conversation(principal, conversation_id)
    return Response(status_code=204)


# ── interactive role-play ────────────────────────────────────────────────────


@router.post("/sessions", response_model=CoachSession, status_code=201)
async def start_session(
    request: Request, body: CreateCoachSessionRequest, principal: CurrentPrincipal
) -> CoachSession:
    return await _svc(request).start_session(principal, body.scenario_id)


@router.get("/sessions", response_model=list[CoachSessionSummary])
async def list_sessions(request: Request, principal: CurrentPrincipal) -> list[CoachSessionSummary]:
    return _svc(request).list_sessions(principal)


@router.get("/sessions/{session_id}", response_model=CoachSession)
async def get_session(request: Request, session_id: str, principal: CurrentPrincipal) -> CoachSession:
    return await _svc(request).get_session(principal, session_id)


@router.post("/sessions/{session_id}/messages", response_model=CoachTurnResult)
async def session_message(
    request: Request, session_id: str, body: SendCoachMessageRequest, principal: CurrentPrincipal
) -> Any:
    stream = _svc(request).roleplay_turn_stream(principal, session_id, body.text, body.client_message_id)
    first = await anext(stream)  # authorisation and state errors surface as normal HTTP errors
    if not wants_sse(request):
        last: Any = first
        async for chunk in stream:
            last = chunk
        if isinstance(last, LlmStreamDelta):
            raise AppError("internal_error", internal_detail="role-play stream ended without a result")
        return last

    async def frames() -> AsyncIterator[bytes]:
        yield frame("meta", _meta(request, "coaching.roleplay_turn", session_id))
        for item in (first,):
            yield (
                frame("delta", {"text": item.text})
                if isinstance(item, LlmStreamDelta)
                else frame("result", item)
            )
        async for item in stream:
            yield (
                frame("delta", {"text": item.text})
                if isinstance(item, LlmStreamDelta)
                else frame("result", item)
            )
        yield frame("done", {})

    return sse_response(guarded(frames(), request.state.request_id))


@router.post("/sessions/{session_id}/end", response_model=SessionEvaluation)
async def end_session(request: Request, session_id: str, principal: CurrentPrincipal) -> SessionEvaluation:
    return await _svc(request).end_session(principal, session_id)


@router.get("/sessions/{session_id}/evaluation", response_model=SessionEvaluation)
async def get_evaluation(request: Request, session_id: str, principal: CurrentPrincipal) -> SessionEvaluation:
    return _svc(request).get_evaluation(principal, session_id)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(request: Request, session_id: str, principal: CurrentPrincipal) -> Response:
    await _svc(request).delete_session(principal, session_id)
    return Response(status_code=204)


# ── tracking, manager support ────────────────────────────────────────────────


@router.get("/metrics/me", response_model=CoachMetrics)
async def my_metrics(request: Request, principal: CurrentPrincipal) -> CoachMetrics:
    return _svc(request).metrics(principal)


@router.get("/team/{employee_id}/activity", response_model=list[ManagerSessionView])
async def report_activity(
    request: Request, employee_id: str, principal: CurrentPrincipal
) -> list[ManagerSessionView]:
    return await _svc(request).manager_view(principal, employee_id)


@router.post("/manager-briefs", response_model=ManagerCoachingBrief)
async def manager_brief(
    request: Request, body: ManagerBriefRequest, principal: CurrentPrincipal
) -> ManagerCoachingBrief:
    """C6 through the orchestrator's explicit path, so it gets the same authorisation and context handling."""
    record = await request.app.state.container.orchestrator.run(
        principal,
        OrchestrationRequest(
            capability="coaching.manager_brief", subject_employee_id=body.employee_id, allow_handoffs=False
        ),
        request.state.request_id,
    )
    step = record.steps[0]
    if step.status != "succeeded" or step.output is None:
        error = step.error
        raise AppError(error.code if error else "internal_error", error.message if error else None)
    return ManagerCoachingBrief.model_validate(step.output)


# ── personal data: learner memory (AI_API_SPEC.md §2) ────────────────────────


@me_router.get("/learner-memory", response_model=list[LearnerMemoryFact])
async def my_memory(request: Request, principal: CurrentPrincipal) -> list[LearnerMemoryFact]:
    if principal.employee_id is None:
        return []
    facts = await request.app.state.container.learner_memory.recall(
        principal.tenant_id, principal.employee_id, limit=50
    )
    return [
        LearnerMemoryFact(
            fact_id=f.fact_id,
            kind=f.kind,
            text=f.text,
            source_session_id=f.source_session_id,
            created_at=f.created_at,
        )
        for f in facts
    ]


@me_router.delete("/learner-memory/{fact_id}", status_code=204)
async def forget(request: Request, fact_id: str, principal: CurrentPrincipal) -> Response:
    if principal.employee_id is None or not await request.app.state.container.learner_memory.delete(
        principal.tenant_id, principal.employee_id, fact_id
    ):
        raise AppError("not_found")
    return Response(status_code=204)
