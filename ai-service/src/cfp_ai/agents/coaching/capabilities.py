"""Registry entries for the interactive coaching capabilities.

C1 (role-play turn), C2 (session evaluation) and C5 (conversation turn) are
stateful and run through the coaching API (``CoachingService``), not the
orchestrator, so they are registered with ``orchestratable=False``. Registering
them lets the capability registry gate every coaching call (role, entitlement,
backend dependencies) and report availability in ``GET /v1/capabilities``.
"""

from __future__ import annotations

from dataclasses import replace

from pydantic import BaseModel

from cfp_ai.agents.base import Capability, CapabilitySpec
from cfp_ai.agents.catalogue import declared


def _interactive(capability: str, **changes: object) -> CapabilitySpec:
    return replace(declared(capability), implemented=True, orchestratable=False, **changes)  # type: ignore[arg-type]


class ConversationCapability(Capability[BaseModel, BaseModel]):
    spec = _interactive(
        "coaching.conversation_turn",
        llm_routes=("coaching.conversation_turn", "coaching.summarise"),
        optional_endpoints=("BE-010", "BE-023", "BE-030", "BE-040", "BE-042"),
    )


class RoleplayCapability(Capability[BaseModel, BaseModel]):
    spec = _interactive("coaching.roleplay_turn")


class EvaluateSessionCapability(Capability[BaseModel, BaseModel]):
    spec = _interactive("coaching.evaluate_session", optional_endpoints=("BE-022", "BE-040"))
