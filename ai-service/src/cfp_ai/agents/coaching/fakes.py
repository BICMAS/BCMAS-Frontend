"""Offline fake responders for the coaching routes (dev/test only).

They read the facts embedded in the prompt (``<input_json>``) and return outputs
that satisfy the same validators as a real model, so the full coaching flow runs
locally without an API key.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from cfp_ai.agents.common import extract_input_json
from cfp_ai.llm.types import LlmRequest

MODE_QUESTIONS = {
    "career": "What would make the next step in your career feel meaningful to you?",
    "leadership": "How would you like the people you lead to describe your leadership in six months?",
    "performance": "What would good progress on that goal look like by the end of the month?",
    "behavioural": "In that situation, what did you do, and what impact did it have?",
    "technical_skills": "Which indicator at the next level feels closest to what you already do?",
    "communication": "What do you most need your audience to understand or do afterwards?",
    "situational": "What outcome would make that situation a success for you?",
}


def conversation_turn(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    question = MODE_QUESTIONS.get(facts.get("mode", ""), "What would be most useful to explore next?")
    actions = []
    if facts.get("candidate_scenarios") and facts.get("mode") in ("situational", "communication"):
        scenario = facts["candidate_scenarios"][0]
        actions.append(
            {"type": "open_scenario", "label": f"Rehearse: {scenario['title']}", "ref_id": scenario["id"]}
        )
    observations = []
    if facts.get("focus_skill_ids"):
        observations.append(
            {
                "type": "development_opportunity",
                "skill_id": facts["focus_skill_ids"][0],
                "note": "Named as a focus area.",
            }
        )
    return {
        "message": f"Thanks, that gives me a clearer picture. {question}",
        "reflective_question": question,
        "coaching_move": "question",
        "stage": "reality" if facts.get("turn_number", 1) < 3 else "options",
        "observations": observations,
        "suggested_actions": actions,
        "safety_flag": "none",
    }


def summarise(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    allowed = facts.get("allowed_skill_ids", [])
    learning = facts.get("candidate_learning", [])
    return {
        "summary": "You explored what you want to work on and agreed a first practical step.",
        "key_themes": ["Clarifying the goal", "Building on recent work"],
        "development_opportunities": [{"skill_id": allowed[0], "description": "Practise at the next level."}]
        if allowed
        else [],
        "agreed_actions": [
            {
                "action": "Try the approach in your next team meeting",
                "timeframe": "Next two weeks",
                "success_measure": "Feedback from one colleague",
            }
        ],
        "reflective_questions": ["What would you do differently next time?"],
        "learning_recommendations": [
            {"catalogue_item_id": learning[0]["id"], "reason": "Supports the focus skill."}
        ]
        if learning
        else [],
        "memory_facts": [
            {"kind": "preference", "text": "Prefers practising with real examples from current work"}
        ],
    }


def persona_turn(request: LlmRequest, output_model: type[BaseModel] | None) -> str:
    return "That's a fair point, but I need specifics. How exactly would you make sure that is enforced?"


def observer(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    latest = facts.get("latest_message", {}).get("text", "")
    criteria = facts.get("criteria", [])
    checks = []
    if criteria:
        quote = latest[:40].strip()
        checks.append(
            {
                "criterion_id": criteria[0]["criterion_id"],
                "status": "partially" if quote else "not_shown",
                "quote": quote or None,
            }
        )
    return {"criteria": checks, "note": "Partial evidence for the first criterion."}


def evaluate(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    employee = [m for m in facts.get("transcript", []) if m["speaker"] == "employee"]
    first = employee[0]
    evidence = [{"message_id": first["message_id"], "quote": first["text"][:50].strip()}]
    indicators = [i["id"] for i in facts.get("indicators", [])]
    scenarios = facts.get("candidate_scenarios", [])
    return {
        "overall_practice_score": 72,
        "skill_observations": [
            {"skill_id": s["skill_id"], "observed_level": max(1, s["target_level"] - 1), "evidence": evidence}
            for s in facts.get("target_skills", [])
        ],
        "strengths": [
            {
                "text": "Engaged directly with the stakeholder's concern.",
                "indicator_id": indicators[0] if indicators else None,
                "evidence": evidence,
            }
        ],
        "growth_areas": [
            {
                "text": "Make the enforcement mechanism explicit.",
                "indicator_id": None,
                "evidence": evidence,
                "tip": "Name the control and how it is verified.",
            }
        ],
        "next_steps": [
            {"type": "scenario", "ref_id": scenarios[0]["id"], "reason": "Practise a related situation."}
        ]
        if scenarios
        else [],
    }


RESPONDERS = {
    "coaching.conversation_turn": conversation_turn,
    "coaching.summarise": summarise,
    "coaching.persona_turn": persona_turn,
    "coaching.observer": observer,
    "coaching.evaluate": evaluate,
}
