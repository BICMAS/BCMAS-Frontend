"""Coaching modes (docs/ai/COACHING_AGENT.md §2).

Seven conversational modes share one conversation engine, each with its own
coaching method, context and guidance. ``role_play`` runs on the scenario engine
(``roleplay.py``) instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel

CoachingMode = Literal[
    "career",
    "leadership",
    "performance",
    "behavioural",
    "technical_skills",
    "communication",
    "situational",
    "role_play",
]
ConversationMode = Literal[
    "career",
    "leadership",
    "performance",
    "behavioural",
    "technical_skills",
    "communication",
    "situational",
]
SkillFocus = Literal["any", "technical", "behavioural"]


@dataclass(frozen=True)
class ModeProfile:
    mode: CoachingMode
    title: str
    description: str
    method: str  # coaching method the coach follows
    skill_focus: SkillFocus  # which skills from the framework are in scope
    context_slices: frozenset[str]
    opening: str  # first coach message (deterministic: no model call to open)
    guidance: str  # mode-specific instructions appended to the shared coach prompt


_BASE_SLICES = frozenset({"subject_profile", "role_profile", "framework", "capabilities"})

MODES: dict[CoachingMode, ModeProfile] = {
    "career": ModeProfile(
        "career",
        "Career coaching",
        "Explore aspirations, options and next steps in your career.",
        "GROW (Goal, Reality, Options, Way forward), values-led",
        "any",
        _BASE_SLICES | {"learning_history", "development_plans"},
        "Let's think about where you want your career to go. Looking ahead one to three years, "
        "what would you like to be doing that you are not doing today?",
        "Explore values, motivations and aspirations before options. Connect options to the role "
        "requirements and skill gaps only when the employee raises direction or progression. Never promise "
        "promotions, roles or outcomes; the organisation decides those.",
    ),
    "leadership": ModeProfile(
        "leadership",
        "Leadership coaching",
        "Grow how you lead, influence and develop others.",
        "GROW with situational leadership reflection",
        "behavioural",
        _BASE_SLICES | {"development_plans"},
        "Let's focus on your leadership. Think of a recent moment where you were leading others: "
        "what happened, and what would you like to have done differently?",
        "Focus on the employee's own leadership behaviours: setting direction, delegating, giving feedback, "
        "influencing without authority. Ask them to choose a leadership style for a specific situation and "
        "explain why. Do not discuss named colleagues' performance.",
    ),
    "performance": ModeProfile(
        "performance",
        "Performance coaching",
        "Make progress on goals and remove obstacles in your current role.",
        "GROW, anchored to role requirements and development objectives",
        "any",
        _BASE_SLICES | {"development_plans", "learning_history"},
        "What goal or objective would you most like to make progress on in the next few weeks?",
        "Anchor the conversation to a concrete goal, current skill gaps and active development plan "
        "objectives. Help the employee find their own next step and a measure of success. Verified levels are "
        "facts from the organisation; never claim to change them.",
    ),
    "behavioural": ModeProfile(
        "behavioural",
        "Behavioural coaching",
        "Change a specific workplace behaviour or habit.",
        "STAR (Situation, Task, Action, Result) to unpack examples; SBI (Situation, Behaviour, Impact) "
        "for feedback",
        "behavioural",
        _BASE_SLICES,
        "Which behaviour or habit would you like to work on? A recent example helps: what was the "
        "situation, and what did you do?",
        "Unpack one concrete example with STAR before exploring alternatives. Relate behaviours to the "
        "behavioural indicators of the role's behavioural skills. Give feedback in SBI form, about "
        "behaviour, never personality.",
    ),
    "technical_skills": ModeProfile(
        "technical_skills",
        "Technical skills coaching",
        "Build a technical skill through deliberate practice.",
        "Deliberate practice: target level indicators, practice task, feedback loop",
        "technical",
        _BASE_SLICES | {"learning_history"},
        "Which technical skill would you like to strengthen? Tell me about a recent piece of work where "
        "you used it.",
        "Use the indicators of the next level to define what 'better' looks like. Ask the employee to "
        "self-assess against specific indicators, then co-design a small practice task with a way to get "
        "feedback. You may explain a concept briefly when asked, then return to a question.",
    ),
    "communication": ModeProfile(
        "communication",
        "Communication coaching",
        "Communicate more clearly and persuasively with stakeholders.",
        "Audience-Message-Medium framing with SBI feedback",
        "behavioural",
        _BASE_SLICES,
        "Who is an audience you need to communicate with more effectively, and what do you need them to "
        "understand or do?",
        "Help the employee define audience, key message and desired outcome. Invite them to draft the "
        "opening line themselves, then give specific feedback. Offer to rehearse via a role-play scenario "
        "when relevant.",
    ),
    "situational": ModeProfile(
        "situational",
        "Situational coaching",
        "Prepare for a specific upcoming situation.",
        "Situation analysis → options → rehearsal plan",
        "any",
        _BASE_SLICES,
        "What situation are you preparing for, when is it, and what outcome would make it a success for you?",
        "Clarify the situation, stakeholders, risks and desired outcome. Help the employee generate and "
        "weigh options, then plan the first two moves. Suggest an interactive role-play scenario to "
        "rehearse when one fits.",
    ),
    "role_play": ModeProfile(
        "role_play",
        "Interactive role-play",
        "Practise a realistic workplace scenario with an AI persona.",
        "Simulation with observer-based, indicator-linked feedback",
        "any",
        _BASE_SLICES,
        "",  # openings come from the scenario
        "",
    ),
}


class ModeInfo(BaseModel):
    mode: CoachingMode
    title: str
    description: str
    method: str
    interaction: Literal["conversation", "role_play"]


def mode_catalogue() -> list[ModeInfo]:
    return [
        ModeInfo(
            mode=p.mode,
            title=p.title,
            description=p.description,
            method=p.method,
            interaction="role_play" if p.mode == "role_play" else "conversation",
        )
        for p in MODES.values()
    ]
