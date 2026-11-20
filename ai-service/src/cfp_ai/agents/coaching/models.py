"""Coaching API models added in v1.2 (pending review; see docs/ai/COACHING_AGENT.md §8).

Reviewed v1.1 contract models (CoachMessage, CoachSession, SessionEvaluation, …) are
reused unchanged from ``cfp_ai.schemas.public``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.agents.coaching.modes import CoachingMode, ConversationMode
from cfp_ai.schemas.public import AiProvenance, CoachMessage, SkillTarget, SuggestedAction

Stage = Literal["goal", "reality", "options", "way_forward", "review"]
CoachingMove = Literal[
    "question", "reflect", "reframe", "feedback", "challenge", "summarise", "suggest_action"
]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StartConversationRequest(Strict):
    mode: ConversationMode
    topic: str | None = Field(default=None, max_length=200)
    focus_skill_ids: list[str] = Field(default_factory=list, max_length=3)
    use_memory: bool = True  # read and write learner memory for this conversation


class CoachingObservation(Strict):
    type: Literal["strength", "development_opportunity"]
    skill_id: str | None
    note: str = Field(max_length=300)


class TurnCoaching(Strict):
    """Structured coaching metadata for one coach turn."""

    reflective_question: str
    coaching_move: CoachingMove
    stage: Stage
    observations: list[CoachingObservation] = Field(default_factory=list)
    safety_flag: Literal["none", "wellbeing_concern", "formal_complaint"] = "none"


class CoachingTurnResult(Strict):
    user_message: CoachMessage
    assistant_message: CoachMessage
    suggested_actions: list[SuggestedAction]
    coaching: TurnCoaching
    conversation_status: Literal["active", "ended"]
    turns_remaining: int


class CoachingConversation(Strict):
    conversation_id: str
    mode: CoachingMode
    topic: str | None
    status: Literal["active", "ended"]
    stage: Stage
    use_memory: bool
    focus_skills: list[SkillTarget]
    turn_count: int
    created_at: datetime
    ended_at: datetime | None
    has_summary: bool
    messages: list[CoachMessage] = Field(default_factory=list)


class AgreedAction(Strict):
    action: str = Field(max_length=300)
    timeframe: str = Field(max_length=100)
    success_measure: str = Field(max_length=200)


class DevelopmentOpportunity(Strict):
    skill_id: str | None
    skill_name: str | None
    description: str = Field(max_length=400)


class LearningIntervention(Strict):
    catalogue_item_id: str
    title: str
    kind: str
    reason: str = Field(max_length=300)


class CoachingSummary(Strict):
    conversation_id: str
    mode: CoachingMode
    summary: str
    key_themes: list[str]
    development_opportunities: list[DevelopmentOpportunity]
    agreed_actions: list[AgreedAction]
    reflective_questions: list[str]
    learning_recommendations: list[LearningIntervention]
    memory_facts_saved: int
    provenance: AiProvenance
    disclaimer: str
    created_at: datetime


class ManagerSessionView(Strict):
    """What a line manager may see about a direct report's coaching (no transcripts)."""

    kind: Literal["conversation", "role_play"]
    id: str
    mode: CoachingMode
    title: str
    status: str
    started_at: datetime
    ended_at: datetime | None
    practice_score: int | None
    key_themes: list[str]
    agreed_actions: list[AgreedAction]
