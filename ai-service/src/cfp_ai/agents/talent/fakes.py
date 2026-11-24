"""Offline fake responders for the Talent Assessment routes (dev/test only).

They read the facts in ``<input_json>`` and return output that passes the same validators as
a real model. The score-row fake judges criteria by word-stem overlap between an indicator
and a response sentence, quoting the sentence verbatim — deterministic, so tests can check
scoring consistency end to end.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel

from cfp_ai.agents.common import extract_input_json
from cfp_ai.llm.types import LlmRequest

_NEGATION = re.compile(r"\b(not yet|have not|haven't|never|did not|didn't)\b", re.IGNORECASE)
_STOP = {"with", "that", "this", "from", "their", "they", "them", "into", "level", "using", "would", "where"}


def _stems(text: str) -> set[str]:
    return {w[:5] for w in re.findall(r"[a-z]+", text.lower()) if len(w) >= 4 and w not in _STOP}


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def score_row(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    judgements = []
    generic = _stems(facts["competency"]["skill_name"]) | {"demon"}  # naming the skill is not evidence
    for criterion in facts["criteria"]:
        stems = _stems(criterion["text"]) - generic
        best: tuple[int, str, str] | None = None
        for response in facts["responses"]:
            for sentence in _sentences(response["text"]):
                overlap = len(stems & (_stems(sentence) - generic))
                if overlap >= 2 and (best is None or overlap > best[0]):
                    best = (overlap, response["response_item_id"], sentence)
        if best is None:
            judgements.append(
                {"criterion_id": criterion["criterion_id"], "judgement": "not_evidenced", "evidence": []}
            )
            continue
        _, item_id, sentence = best
        judgement = "not_met" if _NEGATION.search(sentence) else "met"
        judgements.append(
            {
                "criterion_id": criterion["criterion_id"],
                "judgement": judgement,
                "evidence": [{"response_item_id": item_id, "quote": sentence}],
            }
        )
    return {
        "judgements": judgements,
        "rationale": "Judged each criterion against the submitted responses only (offline fake).",
    }


def design(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    types: list[str] = facts["allowed_question_types"]
    questions = []
    for ci, comp in enumerate(facts["competencies"]):
        qtype = types[ci % len(types)]
        name, target = comp["skill_name"], comp["target_level"]
        at_target = [c["criterion_id"] for c in comp["criteria"] if c["level"] == target]
        lower = [c["criterion_id"] for c in comp["criteria"] if c["level"] < target]
        expected = (at_target or [comp["criteria"][-1]["criterion_id"]])[:2]
        prompts = {
            "behavioural": f"Tell us about a time you used {name} on complex work. What did you do?",
            "situational_judgement": f"A deadline conflicts with a {name} standard. What do you do first?",
            "scenario": f"Read the case and explain how you would apply {name} to resolve it.",
            "technical": f"Complete the practical task that requires {name} and explain your approach.",
            "self_rating": f"Rate your {name} proficiency from 1 to 5 and give a work example that shows it.",
            "manager_rating": f"Rate the employee's {name} from 1 to 5 and describe an example you observed.",
        }
        question: dict[str, Any] = {
            "question_key": f"q{ci + 1}-{qtype}",
            "type": qtype,
            "skill_id": comp["skill_id"],
            "prompt": prompts[qtype],
            "expected_indicator_ids": expected,
            "look_fors": [f"Specific actions that show {name} at level {target}."],
            "feedback": {
                "strong": f"Your answer showed {name} clearly at the expected level.",
                "developing": f"Give more specific examples of {name} in practice.",
            },
            "evidence_required": "A specific, recent example with actions and outcomes.",
            "estimated_minutes": 10,
        }
        if qtype == "situational_judgement":
            question["options"] = [
                {
                    "option_key": "a",
                    "text": "Follow the standard and agree a revised plan.",
                    "score": 5,
                    "indicator_ids": expected,
                    "rationale": "Applies the standard and manages delivery.",
                },
                {
                    "option_key": "b",
                    "text": "Ask a colleague what they would do.",
                    "score": 3,
                    "indicator_ids": lower[:1],
                    "rationale": "Seeks input but does not decide.",
                },
                {
                    "option_key": "c",
                    "text": "Skip the standard to meet the date.",
                    "score": 1,
                    "indicator_ids": [],
                    "rationale": "Ignores the standard.",
                },
            ]
        if qtype in ("scenario", "technical"):
            question["model_answer_outline"] = (
                f"Identifies the {name} issues, proposes a sound approach, explains trade-offs."
            )
        questions.append(question)
    return {
        "title": f"{facts['method'].replace('_', ' ').title()} assessment",
        "objectives": ["Assess the competencies against the framework's proficiency definitions."],
        "questions": questions,
    }


def report(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    feedback = []
    for comp in facts["competencies"]:
        met = "; ".join(comp["criteria_met"]) or "the evidence provided"
        feedback.append(
            {
                "rubric_row_id": comp["rubric_row_id"],
                "feedback": f"Confirmed at level {comp['confirmed_level']} for {comp['skill_name']}: {met}.",
            }
        )
    recommendations = [
        {
            "skill_id": need["skill_id"],
            "recommendation": f"Build {need['skill_name']} with the organisation's resources.",
            "catalogue_item_ids": need["catalogue"][:1],
            "scenario_ids": need["scenarios"][:1],
        }
        for need in facts["development_needs"]
    ]
    return {
        "summary": f"The assessment covered {len(facts['competencies'])} competencies (confirmed).",
        "competency_feedback": feedback,
        "recommendations": recommendations,
        "participant_feedback": "Thank you for your responses. The feedback explains the evidence.",
    }


_YEARS = re.compile(r"\b(19|20)\d{2}\b")
_QUALIFICATION = re.compile(
    r"\b(BSc|B\.Sc|MSc|M\.Sc|MBA|BA|MA|PhD|HND|OND|Degree|Diploma|Certified|Certificate|Certification|ACCA|ICAN|CIPM)\b"
)


def cv_analysis(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    """Offline CV analysis: a sentence counts as evidence when it shares the skill's word stems."""
    facts = extract_input_json(request)
    cv = facts["cv_text"]
    lines = [line.strip() for line in cv.splitlines() if line.strip()]
    sentences = [s for line in lines for s in _sentences(line)]
    skills = []
    for req in facts["required_skills"]:
        stems = {w[:5] for w in re.findall(r"[a-z]+", req["skill_name"].lower()) if len(w) >= 4}
        best: tuple[float, str] | None = None
        for sentence in sentences:
            shared = len(stems & _stems(sentence))
            ratio = shared / len(stems) if stems else 0
            if shared and (best is None or ratio > best[0]):
                best = (ratio, sentence)
        if best is not None and best[0] >= 0.99 and len(best[1].split()) >= 5:
            skills.append(
                {
                    "skill_name": req["skill_name"],
                    "status": "found",
                    "confidence": "high" if len(best[1].split()) >= 8 else "medium",
                    "passages": [best[1]],
                    "note": f"The CV describes work involving {req['skill_name'].lower()}.",
                }
            )
        elif best is not None:
            skills.append(
                {
                    "skill_name": req["skill_name"],
                    "status": "unclear",
                    "confidence": "low",
                    "passages": [best[1]] if len(best[1]) >= 8 else [],
                    "note": "Only a partial or indirect mention; ask the candidate for an example.",
                }
            )
        else:
            skills.append(
                {
                    "skill_name": req["skill_name"],
                    "status": "not_found",
                    "confidence": "medium",
                    "passages": [],
                    "note": "No relevant passage in the CV. This is not proof the skill is missing.",
                }
            )
    found = sum(1 for s in skills if s["status"] == "found")
    return {
        "skills": skills,
        "experience": [line for line in lines if _YEARS.search(line)][:5],
        "qualifications": [line for line in lines if _QUALIFICATION.search(line)][:5],
        "summary": (
            f"The CV shows clear evidence for {found} of {len(skills)} required skills. "
            "Other skills are unclear or not mentioned and should be explored with the candidate."
        ),
    }


def interview_scoring(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    """Offline interview scoring: rubric level from how many descriptor stems the answer shares."""
    facts = extract_input_json(request)
    scores = []
    for q in facts["questions"]:
        answer = q["answer"]
        sentences = _sentences(answer) or [answer.strip()]
        levels = sorted(q["rubric"], key=lambda lvl: lvl["score"])
        answer_stems = _stems(answer) | _stems(q["question"]) if len(answer.split()) >= 25 else _stems(answer)
        chosen = levels[0]
        for lvl in levels:
            if len(_stems(lvl["descriptor"]) & answer_stems) >= 2:
                chosen = lvl
        if len(answer.split()) < 8:
            chosen = levels[0]
        quote = max(sentences, key=len)
        scores.append(
            {
                "question_id": q["question_id"],
                "score": chosen["score"],
                "confidence": "medium" if len(answer.split()) >= 25 else "low",
                "evidence": [quote] if len(quote) >= 4 else [],
                "rationale": (
                    f"The answer matches the level {chosen['score']} description for {q['competency']}."
                ),
            }
        )
    return {
        "scores": scores,
        "summary": (
            "Scores are based on the content of each answer against its approved rubric (offline fake)."
        ),
    }


RESPONDERS = {
    "talent.score_row": score_row,
    "talent.interview_scoring": interview_scoring,
    "talent.draft_items": design,
    "talent.report": report,
    "talent.cv_analysis": cv_analysis,
}
