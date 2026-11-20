"""AI Coaching Agent service (docs/ai/COACHING_AGENT.md).

* Conversations — 7 coaching modes on one engine: structured, reflective turns
  validated so the coach guides rather than lectures; end-of-conversation summary
  with agreed actions and learning interventions; optional learner memory.
* Role-play — scenario persona with real token streaming, a silent observer that
  records indicator evidence per turn, and an evidence-based practice evaluation.
* Recommendations, metrics, manager view (summaries only), privacy operations.

Authorisation: every operation passes the capability registry (role, entitlement,
dependencies). Coaching is always about the *signed-in employee*: context is read
from the backend as them, and transcripts are visible to them only.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field
from ulid import ULID

from cfp_ai.agents.base import AccessRule, AgentDeps, CapabilitySpec
from cfp_ai.agents.coaching import prompts
from cfp_ai.agents.coaching.models import (
    AgreedAction,
    CoachingConversation,
    CoachingMove,
    CoachingObservation,
    CoachingSummary,
    CoachingTurnResult,
    DevelopmentOpportunity,
    LearningIntervention,
    ManagerSessionView,
    Stage,
    StartConversationRequest,
    TurnCoaching,
)
from cfp_ai.agents.coaching.modes import MODES, ModeProfile
from cfp_ai.agents.coaching.recommend import recommend
from cfp_ai.agents.coaching.safety import is_sensitive_fact, safe_response, wellbeing_check
from cfp_ai.agents.coaching.scenarios import ScenarioStore, public_view
from cfp_ai.agents.coaching.store import CoachingStore, ConversationState, RoleplayState
from cfp_ai.agents.common import input_json_block, level_label, provenance
from cfp_ai.agents.registry import CapabilityRegistry, authorize_subject
from cfp_ai.auth.principal import Principal
from cfp_ai.context.models import CapabilityContext, ContextRequest
from cfp_ai.context.render import render_context
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.dto import CatalogueItemDTO
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.llm.types import LlmMessage, LlmRequest, LlmResult, LlmStreamDelta
from cfp_ai.memory.interfaces import LearnerFact, StoredMessage
from cfp_ai.orchestrator.store import SuggestionStore
from cfp_ai.schemas.public import (
    CoachMessage,
    CoachMetrics,
    CoachScenario,
    CoachScenarioAdmin,
    CoachSession,
    CoachSessionSummary,
    FeedbackPoint,
    GrowthPoint,
    NextStep,
    PublishScenarioRequest,
    ScenarioRecommendationsResponse,
    SessionEvaluation,
    SkillObservation,
    SkillTarget,
    SuggestedAction,
    Suggestion,
    TranscriptQuote,
    ValidationIssue,
)
from cfp_ai.security.injection import scan as scan_injection
from cfp_ai.settings import Settings
from cfp_ai.validation.structured import generate_validated

log = logging.getLogger(__name__)

CONVERSATION_CAP = "coaching.conversation_turn"
ROLEPLAY_CAP = "coaching.roleplay_turn"
EVALUATE_CAP = "coaching.evaluate_session"
DRAFT_CAP = "coaching.draft_scenario"
RECOMMEND_CAP = "coaching.recommend_scenarios"
ROUTE_TURN = "coaching.conversation_turn"
ROUTE_SUMMARY = "coaching.summarise"
ROUTE_PERSONA = "coaching.persona_turn"
ROUTE_OBSERVER = "coaching.observer"
ROUTE_EVALUATE = "coaching.evaluate"

SUMMARY_DISCLAIMER = "Coaching notes for your development. They do not change verified capability levels."
EVALUATION_DISCLAIMER = "Coaching practice only. Does not update verified capability levels."
WINDOW = 12
SUGGEST_END_AFTER = 8
MAX_BULLETS = 3
_MANAGER_RULE = AccessRule(frozenset({"line_manager"}), "direct_report")
_MANAGER_SPEC = CapabilitySpec(
    "coaching.manager_view",
    "coaching",
    "C-MGR",
    "sync",
    "ai_coaching",
    (_MANAGER_RULE,),
    implemented=True,
    public=False,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


# ── LLM output schemas ───────────────────────────────────────────────────────


class _Action(BaseModel):
    type: Literal["open_scenario", "view_learning", "generate_plan", "view_gap"]
    label: str = Field(max_length=120)
    ref_id: str | None = None


class TurnDraft(BaseModel):
    message: str = Field(max_length=900)
    reflective_question: str = Field(max_length=300)
    coaching_move: CoachingMove
    stage: Stage
    observations: list[CoachingObservation] = Field(default_factory=list, max_length=3)
    suggested_actions: list[_Action] = Field(default_factory=list, max_length=2)
    safety_flag: Literal["none", "wellbeing_concern", "formal_complaint"] = "none"


class _Opportunity(BaseModel):
    skill_id: str | None
    description: str = Field(max_length=400)


class _LearningPick(BaseModel):
    catalogue_item_id: str
    reason: str = Field(max_length=300)


class _MemoryFact(BaseModel):
    kind: Literal["preference", "goal", "theme"]
    text: str = Field(max_length=200)


class SummaryDraft(BaseModel):
    summary: str = Field(max_length=900)
    key_themes: list[str] = Field(default_factory=list, max_length=5)
    development_opportunities: list[_Opportunity] = Field(default_factory=list, max_length=4)
    agreed_actions: list[AgreedAction] = Field(default_factory=list, max_length=5)
    reflective_questions: list[str] = Field(default_factory=list, max_length=3)
    learning_recommendations: list[_LearningPick] = Field(default_factory=list, max_length=3)
    memory_facts: list[_MemoryFact] = Field(default_factory=list, max_length=3)


class _CriterionCheck(BaseModel):
    criterion_id: str
    status: Literal["met", "partially", "not_shown"]
    quote: str | None = Field(default=None, max_length=300)


class ObserverNote(BaseModel):
    criteria: list[_CriterionCheck]
    note: str = Field(max_length=300)


class _Quote(BaseModel):
    message_id: str
    quote: str = Field(max_length=400)


class _SkillObs(BaseModel):
    skill_id: str
    observed_level: int | None = Field(default=None, ge=1, le=5)
    evidence: list[_Quote] = Field(default_factory=list, max_length=3)


class _Point(BaseModel):
    text: str = Field(max_length=400)
    indicator_id: str | None = None
    evidence: list[_Quote] = Field(default_factory=list, max_length=3)


class _Growth(_Point):
    tip: str = Field(max_length=300)


class _Next(BaseModel):
    type: Literal["learning", "scenario"]
    ref_id: str
    reason: str = Field(max_length=300)


class EvaluationDraft(BaseModel):
    overall_practice_score: int = Field(ge=0, le=100)
    skill_observations: list[_SkillObs]
    strengths: list[_Point] = Field(default_factory=list, max_length=4)
    growth_areas: list[_Growth] = Field(default_factory=list, max_length=4)
    next_steps: list[_Next] = Field(default_factory=list, max_length=3)


# ── service ──────────────────────────────────────────────────────────────────


class CoachingService:
    def __init__(
        self,
        *,
        deps: AgentDeps,
        registry: CapabilityRegistry,
        scenarios: ScenarioStore,
        store: CoachingStore,
        suggestions: SuggestionStore,
        settings: Settings,
    ) -> None:
        self._deps = deps
        self._registry = registry
        self._scenarios = scenarios
        self._store = store
        self._suggestions = suggestions
        self._settings = settings

    # ── authorisation helpers ────────────────────────────────────────────

    def _gate(self, principal: Principal, capability: str) -> str:
        """Registry pre-check (role, entitlement, dependencies) + coaching is for employees."""
        self._registry.resolve(capability, principal, self._deps)
        if principal.type != "user" or not principal.employee_id:
            raise AppError("forbidden", "Coaching is available to employees.")
        return principal.employee_id

    def _own_conversation(self, principal: Principal, conversation_id: str) -> ConversationState:
        state = self._store.conversation(principal.tenant_id, conversation_id)
        if state is None or state.employee_id != principal.employee_id:
            raise AppError("not_found")  # never reveal other people's conversations
        return state

    def _own_session(self, principal: Principal, session_id: str) -> RoleplayState:
        state = self._store.session(principal.tenant_id, session_id)
        if state is None or state.employee_id != principal.employee_id:
            raise AppError("not_found")
        return state

    def _screen_input(self, principal: Principal, resource_type: str, resource: str, text: str) -> None:
        """Suspected prompt injection is audited (pattern names only, never the text); the turn continues."""
        found = scan_injection(text)
        if found and self._deps.audit is not None:
            self._deps.audit.record(
                tenant_id=principal.tenant_id,
                principal=principal,
                action="prompt_injection_suspected",
                resource_type=resource_type,
                resource=resource,
                outcome="flagged",
                detail=",".join(found),
            )

    @staticmethod
    def _deadline(seconds: float) -> float:
        return time.monotonic() + seconds

    # ── shared context ───────────────────────────────────────────────────

    async def _context(
        self, principal: Principal, profile: ModeProfile, deadline: float
    ) -> CapabilityContext:
        assert principal.employee_id is not None
        return await self._deps.context.build(
            principal,
            ContextRequest(subject_employee_id=principal.employee_id, slices=profile.context_slices),
            deadline=deadline,
        )

    @staticmethod
    def _allowed_skills(context: CapabilityContext, profile: ModeProfile) -> dict[str, str]:
        """skill_id → name, for the role's requirements in this mode's focus."""
        if context.role_profile is None:
            return {}
        allowed: dict[str, str] = {}
        for req in context.role_profile.requirements:
            if profile.skill_focus != "any" and req.category != profile.skill_focus:
                continue
            skill = context.skills.get(req.skill_id)
            allowed[req.skill_id] = skill.name if skill else req.skill_id
        return allowed

    async def _candidate_learning(
        self, principal: Principal, context: CapabilityContext, skill_ids: Sequence[str]
    ) -> list[CatalogueItemDTO]:
        if not skill_ids:
            return []
        try:
            items = await self._deps.backend.list_catalogue(principal, list(skill_ids))
        except BackendError as exc:
            if exc.kind == "unauthorized":
                raise exc.to_app_error() from exc
            log.info("catalogue unavailable for coaching", extra={"kind": exc.kind})
            return []
        done = {r.catalogue_item_id for r in context.learning_history or [] if r.status == "completed"}
        return [i for i in items if i.id not in done][:8]

    def _candidate_scenarios(self, tenant_id: str, skill_ids: Sequence[str]) -> list[CoachScenarioAdmin]:
        wanted = set(skill_ids)
        return [
            s
            for s in self._scenarios.list(tenant_id)
            if not wanted or wanted & {t.skill_id for t in s.target_skills}
        ][:6]

    def _coaching_history(self, tenant_id: str, employee_id: str) -> list[dict[str, Any]]:
        history: list[dict[str, Any]] = []
        for conv in self._store.conversations_for(tenant_id, employee_id):
            if conv.summary is not None:
                history.append(
                    {
                        "kind": "conversation",
                        "mode": conv.mode,
                        "themes": conv.summary.key_themes,
                        "agreed_actions": [a.action for a in conv.summary.agreed_actions],
                    }
                )
        for session in self._store.sessions_for(tenant_id, employee_id):
            if session.evaluation is not None:
                history.append(
                    {
                        "kind": "role_play",
                        "scenario": session.title,
                        "practice_score": session.evaluation.overall_practice_score,
                        "growth_areas": [g.text for g in session.evaluation.growth_areas],
                    }
                )
        return history[:3]

    async def _memory(self, tenant_id: str, employee_id: str, use_memory: bool) -> list[str]:
        if not use_memory:
            return []
        return [f.text for f in await self._deps.learner_memory.recall(tenant_id, employee_id, limit=8)]

    # ════════════════════════════════════════════════════════════════════
    # Conversations (career, leadership, performance, behavioural,
    # technical_skills, communication, situational)
    # ════════════════════════════════════════════════════════════════════

    async def start_conversation(
        self, principal: Principal, request: StartConversationRequest
    ) -> CoachingConversation:
        employee_id = self._gate(principal, CONVERSATION_CAP)
        profile = MODES[request.mode]
        context = await self._context(principal, profile, self._deadline(10))
        allowed = self._allowed_skills(context, profile)
        unknown = [s for s in request.focus_skill_ids if s not in allowed]
        if unknown:
            raise AppError(
                "invalid_request",
                "Focus skills must be skills of your role for this mode.",
                internal_detail=f"unknown focus {unknown}",
            )
        state = ConversationState(
            conversation_id=f"cv_{ULID()}",
            tenant_id=principal.tenant_id,
            employee_id=employee_id,
            mode=request.mode,
            topic=request.topic,
            focus_skill_ids=list(request.focus_skill_ids),
            use_memory=request.use_memory,
            created_at=_now(),
        )
        opening = profile.opening
        if request.focus_skill_ids:
            names = ", ".join(allowed[s] for s in request.focus_skill_ids)
            opening = f"We'll focus on {names}. " + opening
        await self._deps.messages.append(
            StoredMessage(
                message_id=f"msg_{ULID()}",
                thread=state.thread,
                role="assistant",
                text=opening,
                created_at=_now(),
            )
        )
        self._store.save_conversation(state)
        return await self._conversation_view(state, context=context, with_messages=True)

    async def _conversation_view(
        self,
        state: ConversationState,
        *,
        context: CapabilityContext | None = None,
        with_messages: bool = False,
    ) -> CoachingConversation:
        messages = await self._deps.messages.list(state.thread) if with_messages else []
        names = {s: s for s in state.focus_skill_ids}
        targets = {}
        if context is not None and context.role_profile is not None:
            for req in context.role_profile.requirements:
                if req.skill_id in names:
                    skill = context.skills.get(req.skill_id)
                    targets[req.skill_id] = SkillTarget(
                        skill_id=req.skill_id,
                        skill_name=skill.name if skill else req.skill_id,
                        target_level=req.required_level,
                        level_label=level_label(context, req.required_level),
                    )
        return CoachingConversation(
            conversation_id=state.conversation_id,
            mode=state.mode,
            topic=state.topic,
            status=state.status,
            stage=state.stage,
            use_memory=state.use_memory,
            focus_skills=list(targets.values()),
            turn_count=state.turn_count,
            created_at=state.created_at,
            ended_at=state.ended_at,
            has_summary=state.summary is not None,
            messages=[self._coach_message(m) for m in messages],
        )

    @staticmethod
    def _coach_message(message: StoredMessage) -> CoachMessage:
        role = "user" if message.role in ("user", "participant") else "coach"
        return CoachMessage(
            message_id=message.message_id,
            role=role,
            text=message.text,
            created_at=message.created_at,
        )

    async def get_conversation(self, principal: Principal, conversation_id: str) -> CoachingConversation:
        self._gate(principal, CONVERSATION_CAP)
        return await self._conversation_view(
            self._own_conversation(principal, conversation_id), with_messages=True
        )

    async def list_conversations(self, principal: Principal) -> list[CoachingConversation]:
        employee_id = self._gate(principal, CONVERSATION_CAP)
        return [
            await self._conversation_view(s)
            for s in self._store.conversations_for(principal.tenant_id, employee_id)
        ]

    async def conversation_turn(
        self, principal: Principal, conversation_id: str, text: str, client_message_id: str
    ) -> CoachingTurnResult:
        self._gate(principal, CONVERSATION_CAP)
        state = self._own_conversation(principal, conversation_id)
        if state.status != "active":
            raise AppError("conflict", "This conversation has ended.")
        self._screen_input(principal, "conversation", conversation_id, text)
        cached = state.turn_cache.get(client_message_id)
        if isinstance(cached, CoachingTurnResult):
            return cached
        if state.turn_count >= self._settings.coaching_max_conversation_turns:
            raise AppError(
                "conflict",
                "This conversation has reached its length limit. Please end it and start a new one.",
            )
        profile = MODES[state.mode]
        deadline = self._deadline(45)
        user_message = await self._deps.messages.append(
            StoredMessage(
                message_id=f"msg_{ULID()}",
                thread=state.thread,
                role="user",
                text=text,
                created_at=_now(),
                client_message_id=client_message_id,
            )
        )
        flag = wellbeing_check(text)
        if flag != "none":
            state.flags.append(f"{flag}:{user_message.message_id}")
            reply_text = safe_response(flag)
            coaching = TurnCoaching(
                reflective_question="When you are ready, what would be most helpful to focus on?",
                coaching_move="reflect",
                stage=state.stage,
                safety_flag=flag,
            )
            actions: list[SuggestedAction] = []
            reply_text = f"{reply_text} {coaching.reflective_question}"
        else:
            draft, actions = await self._generate_turn(principal, state, profile, deadline)
            coaching = TurnCoaching(
                reflective_question=draft.reflective_question,
                coaching_move=draft.coaching_move,
                stage=draft.stage,
                observations=draft.observations,
                safety_flag=draft.safety_flag,
            )
            reply_text = draft.message
            if draft.safety_flag != "none":  # model-detected concern → fixed, safe response
                state.flags.append(f"{draft.safety_flag}:{user_message.message_id}")
                reply_text = f"{safe_response(draft.safety_flag)} {draft.reflective_question}"
                actions = []
            state.stage = draft.stage
        assistant = await self._deps.messages.append(
            StoredMessage(
                message_id=f"msg_{ULID()}",
                thread=state.thread,
                role="assistant",
                text=reply_text,
                created_at=_now(),
            )
        )
        state.turn_count += 1
        result = CoachingTurnResult(
            user_message=self._coach_message(user_message),
            assistant_message=self._coach_message(assistant),
            suggested_actions=actions,
            coaching=coaching,
            conversation_status="active",
            turns_remaining=self._settings.coaching_max_conversation_turns - state.turn_count,
        )
        state.turn_cache[client_message_id] = result
        self._store.save_conversation(state)
        return result

    async def _generate_turn(
        self, principal: Principal, state: ConversationState, profile: ModeProfile, deadline: float
    ) -> tuple[TurnDraft, list[SuggestedAction]]:
        assert principal.employee_id is not None
        context = await self._context(principal, profile, deadline)
        allowed = self._allowed_skills(context, profile)
        focus = state.focus_skill_ids or [g.skill_id for g in context.skill_gaps if g.skill_id in allowed][:3]
        learning = await self._candidate_learning(principal, context, focus or list(allowed))
        scenarios = self._candidate_scenarios(principal.tenant_id, focus or list(allowed))
        gap_ids = {g.skill_id for g in context.skill_gaps}
        facts = {
            "mode": state.mode,
            "method": profile.method,
            "topic": state.topic,
            "stage": state.stage,
            "turn_number": state.turn_count + 1,
            "allowed_skill_ids": sorted(allowed),
            "focus_skill_ids": focus,
            "candidate_learning": [
                {"id": i.id, "title": i.title, "skill_ids": i.skill_ids} for i in learning
            ],
            "candidate_scenarios": [
                {"id": s.scenario_id, "title": s.title, "skill_ids": [t.skill_id for t in s.target_skills]}
                for s in scenarios
            ],
            "coaching_history": self._coaching_history(principal.tenant_id, principal.employee_id),
            "learner_memory": await self._memory(
                principal.tenant_id, principal.employee_id, state.use_memory
            ),
        }
        window = await self._deps.messages.window(state.thread, max_recent=WINDOW)
        messages = [LlmMessage("user", render_context(context) + "\n\n" + input_json_block(facts))]
        for m in window.recent:
            role: Literal["user", "assistant"] = "user" if m.role == "user" else "assistant"
            if messages[-1].role == role:  # keep strict alternation
                messages[-1] = LlmMessage(role, messages[-1].content + "\n\n" + m.text)
            else:
                messages.append(LlmMessage(role, m.text))
        refs = {
            "open_scenario": {s.scenario_id for s in scenarios},
            "view_learning": {i.id for i in learning},
            "view_gap": gap_ids,
        }

        def check(out: TurnDraft) -> list[ValidationIssue]:
            issues: list[ValidationIssue] = []
            question = out.reflective_question.strip()
            if not question.endswith("?"):
                issues.append(
                    ValidationIssue(
                        code="not_a_question",
                        path="reflective_question",
                        message="must be a single open question ending with '?'",
                    )
                )
            elif _norm(question) not in _norm(out.message):
                issues.append(
                    ValidationIssue(
                        code="question_not_in_message",
                        path="message",
                        message="the message must end with the reflective question",
                    )
                )
            bullets = sum(1 for line in out.message.splitlines() if line.strip().startswith(("-", "*", "•")))
            if bullets > MAX_BULLETS or len(out.message.split()) > 140:
                issues.append(
                    ValidationIssue(
                        code="lecturing",
                        path="message",
                        message="too long or list-heavy; coach with a short message and a question",
                    )
                )
            for i, obs in enumerate(out.observations):
                if obs.skill_id is not None and obs.skill_id not in allowed:
                    issues.append(
                        ValidationIssue(
                            code="unknown_id",
                            path=f"observations[{i}].skill_id",
                            message=f"'{obs.skill_id}' is not an allowed skill",
                        )
                    )
            for i, act in enumerate(out.suggested_actions):
                valid = refs.get(act.type)
                if act.type == "generate_plan":
                    continue
                if act.ref_id is None or valid is None or act.ref_id not in valid:
                    issues.append(
                        ValidationIssue(
                            code="unknown_id",
                            path=f"suggested_actions[{i}].ref_id",
                            message=f"'{act.ref_id}' is not a listed {act.type} reference",
                        )
                    )
            return issues

        result = await generate_validated(
            self._deps.gateway,
            ROUTE_TURN,
            LlmRequest(
                route_id=ROUTE_TURN,
                system_blocks=(prompts.COACH_SYSTEM, profile.guidance),
                messages=tuple(messages),
                metadata={"tenant_id": principal.tenant_id, "capability": CONVERSATION_CAP},
            ),
            TurnDraft,
            [check],
            metrics=self._deps.metrics,
            deadline=deadline,
        )
        draft = result.output
        actions = [
            SuggestedAction(type=a.type, label=a.label, ref_id=a.ref_id) for a in draft.suggested_actions
        ]
        return draft, actions

    async def end_conversation(self, principal: Principal, conversation_id: str) -> CoachingSummary:
        self._gate(principal, CONVERSATION_CAP)
        state = self._own_conversation(principal, conversation_id)
        if state.summary is not None:
            return state.summary
        assert principal.employee_id is not None
        flagged = {f.split(":", 1)[1] for f in state.flags}
        transcript = [m for m in await self._deps.messages.list(state.thread) if m.message_id not in flagged]
        if not any(m.role == "user" for m in transcript):
            state.status, state.ended_at = "ended", _now()
            self._store.save_conversation(state)
            raise AppError("precondition_failed", "There is nothing to summarise yet.")
        profile = MODES[state.mode]
        deadline = self._deadline(60)
        context = await self._context(principal, profile, deadline)
        allowed = self._allowed_skills(context, profile)
        learning = await self._candidate_learning(principal, context, state.focus_skill_ids or list(allowed))
        learning_by_id = {i.id: i for i in learning}
        facts = {
            "mode": state.mode,
            "topic": state.topic,
            "allowed_skill_ids": sorted(allowed),
            "candidate_learning": [
                {"id": i.id, "title": i.title, "skill_ids": i.skill_ids} for i in learning
            ],
            "transcript": [
                {"speaker": "employee" if m.role == "user" else "coach", "text": m.text} for m in transcript
            ],
        }

        def check(out: SummaryDraft) -> list[ValidationIssue]:
            issues: list[ValidationIssue] = []
            for i, opp in enumerate(out.development_opportunities):
                if opp.skill_id is not None and opp.skill_id not in allowed:
                    issues.append(
                        ValidationIssue(
                            code="unknown_id",
                            path=f"development_opportunities[{i}]",
                            message=f"'{opp.skill_id}' is not an allowed skill",
                        )
                    )
            for i, pick in enumerate(out.learning_recommendations):
                if pick.catalogue_item_id not in learning_by_id:
                    issues.append(
                        ValidationIssue(
                            code="unknown_id",
                            path=f"learning_recommendations[{i}]",
                            message=f"'{pick.catalogue_item_id}' is not candidate learning",
                        )
                    )
            for i, fact in enumerate(out.memory_facts):
                if is_sensitive_fact(fact.text):
                    issues.append(
                        ValidationIssue(
                            code="sensitive_memory",
                            path=f"memory_facts[{i}]",
                            message="memory facts must not contain personal or sensitive data",
                        )
                    )
            return issues

        result = await generate_validated(
            self._deps.gateway,
            ROUTE_SUMMARY,
            LlmRequest(
                route_id=ROUTE_SUMMARY,
                system_blocks=(prompts.SUMMARY_SYSTEM,),
                messages=(LlmMessage("user", input_json_block(facts)),),
                metadata={"tenant_id": principal.tenant_id, "capability": CONVERSATION_CAP},
            ),
            SummaryDraft,
            [check],
            metrics=self._deps.metrics,
            deadline=deadline,
        )
        draft = result.output
        saved = 0
        if state.use_memory and draft.memory_facts:
            ttl = timedelta(days=self._settings.learner_memory_ttl_days)
            facts_to_save = [
                LearnerFact(
                    fact_id=f"fact_{ULID()}",
                    tenant_id=state.tenant_id,
                    employee_id=state.employee_id,
                    kind=f.kind,
                    text=f.text,
                    source_session_id=state.conversation_id,
                    created_at=_now(),
                    expires_at=_now() + ttl,
                )
                for f in draft.memory_facts
            ]
            await self._deps.learner_memory.upsert(facts_to_save)
            saved = len(facts_to_save)
        summary = CoachingSummary(
            conversation_id=state.conversation_id,
            mode=state.mode,
            summary=draft.summary,
            key_themes=draft.key_themes,
            development_opportunities=[
                DevelopmentOpportunity(
                    skill_id=o.skill_id,
                    skill_name=allowed.get(o.skill_id) if o.skill_id else None,
                    description=o.description,
                )
                for o in draft.development_opportunities
            ],
            agreed_actions=draft.agreed_actions,
            reflective_questions=draft.reflective_questions,
            learning_recommendations=[
                LearningIntervention(
                    catalogue_item_id=p.catalogue_item_id,
                    title=learning_by_id[p.catalogue_item_id].title,
                    kind=learning_by_id[p.catalogue_item_id].kind,
                    reason=p.reason,
                )
                for p in draft.learning_recommendations
            ],
            memory_facts_saved=saved,
            provenance=provenance(
                CONVERSATION_CAP, model=result.model, prompt_version=prompts.SUMMARY_VERSION, context=context
            ),
            disclaimer=SUMMARY_DISCLAIMER,
            created_at=_now(),
        )
        state.summary, state.status, state.ended_at = summary, "ended", _now()
        self._store.save_conversation(state)
        return summary

    def get_summary(self, principal: Principal, conversation_id: str) -> CoachingSummary:
        self._gate(principal, CONVERSATION_CAP)
        state = self._own_conversation(principal, conversation_id)
        if state.summary is None:
            raise AppError("not_found", "This conversation has no summary yet.")
        return state.summary

    # ════════════════════════════════════════════════════════════════════
    # Interactive role-play
    # ════════════════════════════════════════════════════════════════════

    async def recommend_scenarios(
        self, principal: Principal, limit: int = 3
    ) -> ScenarioRecommendationsResponse:
        employee_id = self._gate(principal, RECOMMEND_CAP)
        context = await self._deps.context.build(
            principal,
            ContextRequest(
                subject_employee_id=employee_id,
                slices=frozenset({"role_profile", "framework", "capabilities"}),
            ),
            deadline=self._deadline(10),
        )
        return recommend(self._scenarios, self._store, principal.tenant_id, employee_id, context, limit=limit)

    def list_scenarios(self, principal: Principal) -> list[CoachScenario | CoachScenarioAdmin]:
        self._registry.resolve(ROLEPLAY_CAP, principal, self._deps)
        admin = principal.has_any_role("hr_ld_admin")
        rows = self._scenarios.list(principal.tenant_id, include_unpublished=admin)
        return [s if admin else public_view(s) for s in rows]

    def get_scenario(self, principal: Principal, scenario_id: str) -> CoachScenario | CoachScenarioAdmin:
        self._registry.resolve(ROLEPLAY_CAP, principal, self._deps)
        scenario = self._scenarios.get(principal.tenant_id, scenario_id)
        admin = principal.has_any_role("hr_ld_admin")
        if scenario is None or (scenario.status != "published" and not admin):
            raise AppError("not_found")
        return scenario if admin else public_view(scenario)

    async def publish_scenario(
        self, principal: Principal, request: PublishScenarioRequest
    ) -> CoachScenarioAdmin:
        if not principal.has_any_role("hr_ld_admin"):
            raise AppError("forbidden", "Only L&D administrators can publish scenarios.")
        payload = request.scenario
        targets = {t.skill_id for t in payload.target_skills}
        bad = [c.criterion_id for c in payload.authoring.success_criteria if c.skill_id not in targets]
        if bad:
            raise AppError(
                "invalid_request", "Every success criterion must target one of the scenario's skills."
            )
        for skill_id in targets:  # skills must exist in the tenant framework (read as the admin)
            try:
                await self._deps.backend.get_skill(principal, skill_id)
            except BackendError as exc:
                if exc.kind == "not_found":
                    raise AppError("invalid_request", f"Unknown skill {skill_id}.") from exc
                if exc.kind != "not_callable":
                    raise exc.to_app_error() from exc
        return self._scenarios.publish(principal.tenant_id, payload)

    async def start_session(self, principal: Principal, scenario_id: str) -> CoachSession:
        employee_id = self._gate(principal, ROLEPLAY_CAP)
        scenario = self._scenarios.get(principal.tenant_id, scenario_id)
        if scenario is None:
            raise AppError("not_found")
        if scenario.status != "published":
            raise AppError("precondition_failed", "This scenario is not available.")
        state = RoleplayState(
            session_id=f"cs_{ULID()}",
            tenant_id=principal.tenant_id,
            employee_id=employee_id,
            scenario_id=scenario.scenario_id,
            scenario_version=scenario.version,
            title=scenario.title,
            persona=scenario.persona,
            target_skills=scenario.target_skills,
            time_limit_s=scenario.estimated_minutes * 60,
            started_at=_now(),
        )
        await self._deps.messages.append(
            StoredMessage(
                message_id=f"msg_{ULID()}",
                thread=state.thread,
                role="persona",
                text=scenario.opening,
                created_at=_now(),
            )
        )
        self._store.save_session(state)
        return await self._session_view(state)

    async def _session_view(self, state: RoleplayState) -> CoachSession:
        messages = await self._deps.messages.list(state.thread)
        return CoachSession(
            session_id=state.session_id,
            employee_id=state.employee_id,
            scenario_id=state.scenario_id,
            scenario_version=state.scenario_version,
            title=state.title,
            status=state.status,
            evaluation_status=state.evaluation_status,
            persona=state.persona,
            target_skills=state.target_skills,
            started_at=state.started_at,
            ended_at=state.ended_at,
            duration_s=int((state.ended_at - state.started_at).total_seconds()) if state.ended_at else None,
            time_limit_s=state.time_limit_s,
            messages=[self._coach_message(m) for m in messages],
        )

    async def get_session(self, principal: Principal, session_id: str) -> CoachSession:
        self._gate(principal, ROLEPLAY_CAP)
        return await self._session_view(self._own_session(principal, session_id))

    def list_sessions(self, principal: Principal) -> list[CoachSessionSummary]:
        employee_id = self._gate(principal, ROLEPLAY_CAP)
        return [self._session_summary(s) for s in self._store.sessions_for(principal.tenant_id, employee_id)]

    @staticmethod
    def _session_summary(s: RoleplayState) -> CoachSessionSummary:
        return CoachSessionSummary(
            session_id=s.session_id,
            employee_id=s.employee_id,
            scenario_id=s.scenario_id,
            scenario_version=s.scenario_version,
            title=s.title,
            status=s.status,
            evaluation_status=s.evaluation_status,
            persona=s.persona,
            target_skills=s.target_skills,
            started_at=s.started_at,
            ended_at=s.ended_at,
            duration_s=int((s.ended_at - s.started_at).total_seconds()) if s.ended_at else None,
            time_limit_s=s.time_limit_s,
            practice_score=s.evaluation.overall_practice_score if s.evaluation else None,
        )

    def _remaining_s(self, state: RoleplayState) -> int:
        return max(0, state.time_limit_s - int((_now() - state.started_at).total_seconds()))

    async def roleplay_turn_stream(
        self, principal: Principal, session_id: str, text: str, client_message_id: str
    ) -> AsyncIterator[LlmStreamDelta | Any]:
        """Yields LlmStreamDelta chunks, then a final ``CoachTurnResult``-shaped dict."""
        from cfp_ai.schemas.public import CoachTurnResult

        self._gate(principal, ROLEPLAY_CAP)
        state = self._own_session(principal, session_id)
        if state.status != "active":
            raise AppError("conflict", "This role-play has ended.")
        self._screen_input(principal, "roleplay_session", session_id, text)
        cached = state.turn_cache.get(client_message_id)
        if cached is not None:
            yield cached
            return
        if self._remaining_s(state) <= 0 or state.turn_count >= self._settings.coaching_max_roleplay_turns:
            raise AppError(
                "conflict", "The time limit for this role-play has been reached. Please end the session."
            )
        scenario = self._scenarios.get(state.tenant_id, state.scenario_id)
        if scenario is None:
            raise AppError("not_found")
        participant = await self._deps.messages.append(
            StoredMessage(
                message_id=f"msg_{ULID()}",
                thread=state.thread,
                role="participant",
                text=text,
                created_at=_now(),
                client_message_id=client_message_id,
            )
        )
        flag = wellbeing_check(text)
        if flag != "none":
            state.flags.append(f"{flag}:{participant.message_id}")
            reply = "(Pausing the role-play.) " + safe_response(flag)
            yield LlmStreamDelta(text=reply)
        else:
            reply = ""
            async for chunk in self._persona_reply(principal, state, scenario):
                if isinstance(chunk, LlmStreamDelta):
                    yield chunk
                else:
                    reply = chunk
        persona_msg = await self._deps.messages.append(
            StoredMessage(
                message_id=f"msg_{ULID()}", thread=state.thread, role="persona", text=reply, created_at=_now()
            )
        )
        if flag == "none":
            await self._observe(principal, state, scenario, participant)
        state.turn_count += 1
        result = CoachTurnResult(
            user_message=self._coach_message(participant),
            coach_message=self._coach_message(persona_msg),
            session_status="active",
            suggest_end=state.turn_count >= SUGGEST_END_AFTER or flag != "none",
            remaining_s=self._remaining_s(state),
        )
        state.turn_cache[client_message_id] = result
        self._store.save_session(state)
        yield result

    async def _persona_reply(
        self, principal: Principal, state: RoleplayState, scenario: CoachScenarioAdmin
    ) -> AsyncIterator[LlmStreamDelta | str]:
        """Streams the persona's reply (deltas), then yields the full text once."""
        scenario_block = input_json_block(
            {
                "persona": scenario.persona.model_dump(),
                "persona_brief": scenario.authoring.persona_brief,
                "hidden_constraints": scenario.authoring.hidden_constraints,
                "escalation_rules": scenario.authoring.escalation_rules,
                "scenario": scenario.description,
            }
        )
        window = await self._deps.messages.window(state.thread, max_recent=WINDOW)
        messages = [LlmMessage("user", "Scene setup (do not repeat it):\n" + scenario_block)]
        for m in window.recent:
            role: Literal["user", "assistant"] = "user" if m.role == "participant" else "assistant"
            if messages[-1].role == role:
                messages[-1] = LlmMessage(role, messages[-1].content + "\n\n" + m.text)
            else:
                messages.append(LlmMessage(role, m.text))

        final: LlmResult[Any] | None = None
        async for item in self._deps.gateway.stream(
            ROUTE_PERSONA,
            LlmRequest(
                route_id=ROUTE_PERSONA,
                system_blocks=(prompts.PERSONA_SYSTEM,),
                messages=tuple(messages),
                metadata={"tenant_id": principal.tenant_id, "capability": ROLEPLAY_CAP},
            ),
            deadline=self._deadline(30),
        ):
            if isinstance(item, LlmStreamDelta):
                yield item
            else:
                final = item
        yield (final.text or "").strip() if final else ""

    async def _observe(
        self,
        principal: Principal,
        state: RoleplayState,
        scenario: CoachScenarioAdmin,
        participant: StoredMessage,
    ) -> None:
        """Silent observer: indicator evidence for the latest participant message (non-fatal)."""
        criteria = {c.criterion_id: c for c in scenario.authoring.success_criteria}

        def check(out: ObserverNote) -> list[ValidationIssue]:
            issues = []
            for i, c in enumerate(out.criteria):
                if c.criterion_id not in criteria:
                    issues.append(
                        ValidationIssue(code="unknown_id", path=f"criteria[{i}]", message="unknown criterion")
                    )
                if c.quote and _norm(c.quote) not in _norm(participant.text):
                    issues.append(
                        ValidationIssue(
                            code="quote_not_in_source",
                            path=f"criteria[{i}].quote",
                            message="quote must be verbatim from the latest message",
                        )
                    )
            return issues

        facts = {
            "criteria": [{"criterion_id": c.criterion_id, "text": c.text} for c in criteria.values()],
            "latest_message": {"message_id": participant.message_id, "text": participant.text},
        }
        try:
            result = await generate_validated(
                self._deps.gateway,
                ROUTE_OBSERVER,
                LlmRequest(
                    route_id=ROUTE_OBSERVER,
                    system_blocks=(prompts.OBSERVER_SYSTEM,),
                    messages=(LlmMessage("user", input_json_block(facts)),),
                    metadata={"tenant_id": principal.tenant_id, "capability": ROLEPLAY_CAP},
                ),
                ObserverNote,
                [check],
                metrics=self._deps.metrics,
                max_repairs=1,
                deadline=self._deadline(20),
            )
        except AppError as exc:
            log.info("observer skipped", extra={"error_code": exc.code})
            return
        note = {"for_message_id": participant.message_id, **result.output.model_dump()}
        await self._deps.messages.append(
            StoredMessage(
                message_id=f"msg_{ULID()}",
                thread=state.thread,
                role="system_note",
                text=json.dumps(note),
                created_at=_now(),
                visible_to_user=False,
            )
        )

    async def end_session(self, principal: Principal, session_id: str) -> SessionEvaluation:
        employee_id = self._gate(principal, EVALUATE_CAP)
        state = self._own_session(principal, session_id)
        if state.evaluation is not None:
            return state.evaluation
        scenario = self._scenarios.get(state.tenant_id, state.scenario_id)
        if scenario is None:
            raise AppError("not_found")
        flagged = {f.split(":", 1)[1] for f in state.flags}
        all_messages = await self._deps.messages.list(state.thread, include_hidden=True)
        participant = {
            m.message_id: m for m in all_messages if m.role == "participant" and m.message_id not in flagged
        }
        state.ended_at = state.ended_at or _now()
        if not participant:
            state.status, state.evaluation_status = "abandoned", "none"
            self._store.save_session(state)
            raise AppError("precondition_failed", "There is nothing to evaluate yet.")
        state.status, state.evaluation_status = "evaluating", "pending"
        self._store.save_session(state)
        deadline = self._deadline(120)
        targets = {t.skill_id: t for t in state.target_skills}
        indicators: dict[str, str] = {}
        for skill_id in targets:
            try:
                skill = await self._deps.backend.get_skill(principal, skill_id)
            except BackendError:
                continue  # optional grounding (BE-022)
            for lvl in skill.levels:
                for ind in lvl.indicators:
                    indicators[ind.id] = f"{skill.name} L{lvl.level}: {ind.text}"
        learning = await self._candidate_learning(
            principal,
            CapabilityContext(tenant_id=state.tenant_id, subject_employee_id=employee_id, as_of=_now()),
            list(targets),
        )
        others = [
            s
            for s in self._candidate_scenarios(state.tenant_id, list(targets))
            if s.scenario_id != state.scenario_id
        ]
        observer_notes = [json.loads(m.text) for m in all_messages if m.role == "system_note"]
        facts = {
            "scenario": {"title": scenario.title, "description": scenario.description},
            "target_skills": [t.model_dump() for t in state.target_skills],
            "success_criteria": [c.model_dump() for c in scenario.authoring.success_criteria],
            "indicators": [{"id": k, "text": v} for k, v in sorted(indicators.items())],
            "transcript": [
                {
                    "message_id": m.message_id,
                    "speaker": "employee" if m.role == "participant" else "persona",
                    "text": m.text,
                }
                for m in all_messages
                if m.role in ("participant", "persona") and m.message_id not in flagged
            ],
            "observer_notes": observer_notes,
            "candidate_scenarios": [{"id": s.scenario_id, "title": s.title} for s in others],
            "candidate_learning": [{"id": i.id, "title": i.title} for i in learning],
        }
        refs = {
            "scenario": {s.scenario_id: s.title for s in others},
            "learning": {i.id: i.title for i in learning},
        }

        def quote_issues(path: str, quotes: list[_Quote]) -> list[ValidationIssue]:
            issues = []
            for j, q in enumerate(quotes):
                source = participant.get(q.message_id)
                if source is None or _norm(q.quote) not in _norm(source.text):
                    issues.append(
                        ValidationIssue(
                            code="quote_not_in_source",
                            path=f"{path}.evidence[{j}]",
                            message="evidence must quote the employee verbatim with its message_id",
                        )
                    )
            return issues

        def check(out: EvaluationDraft) -> list[ValidationIssue]:
            issues: list[ValidationIssue] = []
            seen = {o.skill_id for o in out.skill_observations}
            for missing in sorted(set(targets) - seen):
                issues.append(
                    ValidationIssue(
                        code="missing_skill",
                        path="skill_observations",
                        message=f"no observation for {missing}",
                    )
                )
            for i, obs in enumerate(out.skill_observations):
                if obs.skill_id not in targets:
                    issues.append(
                        ValidationIssue(
                            code="unknown_id",
                            path=f"skill_observations[{i}]",
                            message=f"'{obs.skill_id}' is not a target skill",
                        )
                    )
                issues += quote_issues(f"skill_observations[{i}]", obs.evidence)
            for name, points in (("strengths", out.strengths), ("growth_areas", out.growth_areas)):
                for i, p in enumerate(points):
                    if p.indicator_id is not None and p.indicator_id not in indicators:
                        issues.append(
                            ValidationIssue(
                                code="unknown_indicator",
                                path=f"{name}[{i}]",
                                message=f"'{p.indicator_id}' is not a listed indicator",
                            )
                        )
                    issues += quote_issues(f"{name}[{i}]", p.evidence)
            for i, n in enumerate(out.next_steps):
                if n.ref_id not in refs[n.type]:
                    issues.append(
                        ValidationIssue(
                            code="unknown_id",
                            path=f"next_steps[{i}]",
                            message=f"'{n.ref_id}' is not a candidate {n.type}",
                        )
                    )
            return issues

        try:
            result = await generate_validated(
                self._deps.gateway,
                ROUTE_EVALUATE,
                LlmRequest(
                    route_id=ROUTE_EVALUATE,
                    system_blocks=(prompts.EVALUATION_SYSTEM,),
                    messages=(LlmMessage("user", input_json_block(facts)),),
                    metadata={"tenant_id": principal.tenant_id, "capability": EVALUATE_CAP},
                ),
                EvaluationDraft,
                [check],
                metrics=self._deps.metrics,
                deadline=deadline,
            )
        except AppError:
            state.status, state.evaluation_status = "evaluated", "failed"
            self._store.save_session(state)
            raise
        draft = result.output

        def quotes(qs: list[_Quote]) -> list[TranscriptQuote]:
            return [TranscriptQuote(message_id=q.message_id, quote=q.quote) for q in qs]

        evaluation = SessionEvaluation(
            session_id=state.session_id,
            overall_practice_score=draft.overall_practice_score,
            skill_observations=[
                SkillObservation(
                    skill_id=o.skill_id,
                    skill_name=targets[o.skill_id].skill_name,
                    target_level=targets[o.skill_id].target_level,
                    observed_level=o.observed_level,
                    evidence=quotes(o.evidence),
                )
                for o in draft.skill_observations
            ],
            strengths=[
                FeedbackPoint(text=p.text, indicator_id=p.indicator_id, evidence=quotes(p.evidence))
                for p in draft.strengths
            ],
            growth_areas=[
                GrowthPoint(text=p.text, indicator_id=p.indicator_id, evidence=quotes(p.evidence), tip=p.tip)
                for p in draft.growth_areas
            ],
            next_steps=[
                NextStep(type=n.type, ref_id=n.ref_id, title=refs[n.type][n.ref_id], reason=n.reason)
                for n in draft.next_steps
            ],
            provenance=provenance(
                EVALUATE_CAP, model=result.model, prompt_version=prompts.EVALUATION_VERSION, context=None
            ),
            disclaimer=EVALUATION_DISCLAIMER,
        )
        state.evaluation, state.status, state.evaluation_status = evaluation, "evaluated", "ready"
        self._store.save_session(state)
        if (
            draft.growth_areas
        ):  # handoff coaching.session_evaluated → a plan-review suggestion for the employee
            self._suggestions.add(
                state.tenant_id,
                Suggestion.model_validate(
                    {
                        "suggestion_id": f"sug_{ULID()}",
                        "kind": "plan_review",
                        "subject_employee_id": state.employee_id,
                        "title": "Review your development plan after practice",
                        "detail": "Growth areas from '"
                        + state.title
                        + "': "
                        + "; ".join(g.text for g in draft.growth_areas)[:600],
                        "source_handoff": "coaching.session_evaluated",
                        "ref_id": state.session_id,
                        "status": "pending",
                        "created_at": _now(),
                    }
                ),
            )
        return evaluation

    def get_evaluation(self, principal: Principal, session_id: str) -> SessionEvaluation:
        self._gate(principal, EVALUATE_CAP)
        state = self._own_session(principal, session_id)
        if state.evaluation is None:
            raise AppError("not_found", "This session has not been evaluated yet.")
        return state.evaluation

    # ════════════════════════════════════════════════════════════════════
    # Metrics, manager view, privacy
    # ════════════════════════════════════════════════════════════════════

    def metrics(self, principal: Principal) -> CoachMetrics:
        employee_id = self._gate(principal, CONVERSATION_CAP)
        convs = self._store.conversations_for(principal.tenant_id, employee_id)
        sessions = self._store.sessions_for(principal.tenant_id, employee_id)
        now = _now()
        started = [c.created_at for c in convs] + [s.started_at for s in sessions]
        scores = [s.evaluation.overall_practice_score for s in sessions if s.evaluation]
        skills = {t.skill_id for s in sessions for t in s.target_skills} | {
            k for c in convs for k in c.focus_skill_ids
        }
        minutes = sum(
            int(((s.ended_at or now) - s.started_at).total_seconds() // 60) for s in sessions
        ) + sum(int(((c.ended_at or now) - c.created_at).total_seconds() // 60) for c in convs)
        return CoachMetrics(
            total_sessions=len(started),
            sessions_this_month=sum(1 for d in started if (d.year, d.month) == (now.year, now.month)),
            skills_targeted=len(skills),
            average_practice_score=round(sum(scores) / len(scores)) if scores else None,
            minutes_coached=minutes,
        )

    async def manager_view(self, principal: Principal, employee_id: str) -> list[ManagerSessionView]:
        """Direct report's coaching activity for their manager: summaries only, never transcripts."""
        if not self._settings.coaching_manager_can_view_summaries:
            raise AppError("forbidden", "Your organisation does not share coaching summaries with managers.")
        self._registry.resolve("coaching.manager_brief", principal, self._deps)  # entitlement + role
        await authorize_subject(_MANAGER_SPEC, principal, employee_id, self._deps)
        views: list[ManagerSessionView] = []
        for c in self._store.conversations_for(principal.tenant_id, employee_id):
            if c.summary is not None:
                views.append(
                    ManagerSessionView(
                        kind="conversation",
                        id=c.conversation_id,
                        mode=c.mode,
                        title=MODES[c.mode].title,
                        status=c.status,
                        started_at=c.created_at,
                        ended_at=c.ended_at,
                        practice_score=None,
                        key_themes=c.summary.key_themes,
                        agreed_actions=c.summary.agreed_actions,
                    )
                )
        for s in self._store.sessions_for(principal.tenant_id, employee_id):
            if s.evaluation is not None:
                views.append(
                    ManagerSessionView(
                        kind="role_play",
                        id=s.session_id,
                        mode="role_play",
                        title=s.title,
                        status=s.status,
                        started_at=s.started_at,
                        ended_at=s.ended_at,
                        practice_score=s.evaluation.overall_practice_score,
                        key_themes=[g.text for g in s.evaluation.growth_areas][:3],
                        agreed_actions=[],
                    )
                )
        return sorted(views, key=lambda v: v.started_at, reverse=True)

    async def delete_conversation(self, principal: Principal, conversation_id: str) -> None:
        self._gate(principal, CONVERSATION_CAP)
        state = self._own_conversation(principal, conversation_id)
        await self._erase_conversation(state)

    async def delete_session(self, principal: Principal, session_id: str) -> None:
        self._gate(principal, ROLEPLAY_CAP)
        state = self._own_session(principal, session_id)
        await self._erase_session(state)

    async def _erase_conversation(self, state: ConversationState) -> None:
        await self._deps.messages.delete_thread(state.thread)
        await self._deps.learner_memory.delete_by_source(
            state.tenant_id, state.employee_id, state.conversation_id
        )
        self._store.delete_conversation(state.tenant_id, state.conversation_id)

    async def _erase_session(self, state: RoleplayState) -> None:
        await self._deps.messages.delete_thread(state.thread)
        self._store.delete_session(state.tenant_id, state.session_id)

    async def purge_expired(self, now: datetime | None = None) -> dict[str, int]:
        """Retention job (scheduler): erase transcripts, summaries and evaluations past retention."""
        conversations, sessions = self._store.expired(now or _now(), self._settings.coaching_retention_days)
        for c in conversations:
            await self._erase_conversation(c)
        for s in sessions:
            await self._erase_session(s)
        return {"conversations": len(conversations), "sessions": len(sessions)}

    async def erase_employee(self, tenant_id: str, employee_id: str) -> dict[str, int]:
        """Data-subject erasure (employee.deleted / user.erasure_requested)."""
        conversations = self._store.conversations_for(tenant_id, employee_id)
        sessions = self._store.sessions_for(tenant_id, employee_id)
        for c in conversations:
            await self._erase_conversation(c)
        for s in sessions:
            await self._erase_session(s)
        facts = await self._deps.learner_memory.erase_subject(tenant_id, employee_id)
        return {"conversations": len(conversations), "sessions": len(sessions), "facts": facts}
