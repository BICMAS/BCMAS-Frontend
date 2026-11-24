"""T8 talent.score_interview: content-only rubric suggestions (BCMS Talent Assessment guide §14)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from cfp_ai.agents.talent.interview_scoring import (
    InterviewLLM,
    InterviewScoringRequest,
    finalise,
    interview_rules,
)
from cfp_ai.container import Container
from cfp_ai.schemas.public import AiProvenance, DraftValidationReport
from tests.conftest import auth

URL = "/v1/talent/interview-scorings"

RUBRIC = [
    {"score": 1, "descriptor": "Names the issue but gives no plan or example."},
    {"score": 2, "descriptor": "Gives an example with some actions but unclear results."},
    {"score": 3, "descriptor": "Describes specific actions, agreed priorities and the customer outcome."},
    {
        "score": 4,
        "descriptor": "Specific actions, agreed priorities, measured customer outcome and lessons learned.",
    },
]
STRONG = (
    "Last year a key supermarket buyer complained about repeated stock-outs. I met the buyer, agreed "
    "priorities for the top twenty products, set specific actions with our distributor and tracked fill "
    "rate weekly. The customer outcome was a fill rate of 98% within six weeks and the lessons learned "
    "became our standard reorder plan."
)


def body(**overrides: Any) -> dict[str, Any]:
    return {
        "role_title": "Sales Executive",
        "questions": [
            {
                "question_id": "q1",
                "competency": "Customer focus",
                "question": "Tell us about a time you resolved a customer complaint.",
                "rubric": RUBRIC,
            },
            {
                "question_id": "q2",
                "competency": "Planning",
                "question": "How do you plan a week of outlet visits?",
                "rubric": RUBRIC,
            },
            {
                "question_id": "q3",
                "competency": "Negotiation",
                "question": "Describe a negotiation you led.",
                "rubric": RUBRIC,
            },
        ],
        "answers": [
            {"question_id": "q1", "text": STRONG},
            {"question_id": "q2", "text": "I just visit them."},
            {"question_id": "q3", "text": ""},
        ],
        **overrides,
    }


def prov() -> AiProvenance:
    return AiProvenance.model_validate(
        {
            "capability": "talent.score_interview",
            "model": "m",
            "prompt_version": "v",
            "generated_at": datetime.now(UTC),
            "context_as_of": None,
            "citations": [],
            "unavailable_context": [],
        }
    )


def test_suggests_rubric_scores_with_verbatim_evidence(client: TestClient, token: Any) -> None:
    response = client.post(URL, headers=auth(token("priya")), json=body())
    assert response.status_code == 200, response.text
    scores = {s["question_id"]: s for s in response.json()["scores"]}
    assert scores["q1"]["score"] > scores["q2"]["score"]
    assert scores["q1"]["max_score"] == 4
    for quote in scores["q1"]["evidence"]:
        assert quote in STRONG
    assert scores["q3"] == {**scores["q3"], "score": 0, "confidence": "high", "evidence": []}  # blank answer
    assert "never scored" in response.json()["disclaimer"]


def test_only_hr_may_score_interviews(client: TestClient, token: Any) -> None:
    assert client.post(URL, headers=auth(token("james")), json=body()).status_code == 403


def test_answers_never_go_through_the_orchestrator(
    client: TestClient, token: Any, container: Container
) -> None:
    async def forbidden(*_: Any, **__: Any) -> Any:
        raise AssertionError("interview scoring must not be orchestrated")

    container.orchestrator.run = forbidden  # type: ignore[method-assign]
    assert client.post(URL, headers=auth(token("priya")), json=body()).status_code == 200


def test_rules_reject_delivery_judgements_off_rubric_scores_and_invented_quotes() -> None:
    request = InterviewScoringRequest.model_validate(body())
    output = InterviewLLM.model_validate(
        {
            "scores": [
                {
                    "question_id": "q1",
                    "score": 7,
                    "confidence": "high",
                    "evidence": ["I negotiated a merger"],
                    "rationale": "Strong accent but clear plan.",
                },
                {
                    "question_id": "q2",
                    "score": 1,
                    "confidence": "low",
                    "evidence": [],
                    "rationale": "Very brief answer.",
                },
            ],
            "summary": "Fluent speaker.",
        }
    )
    codes = {i.code for i in interview_rules(output, request)}
    assert {"invalid_score", "unverified_quote", "delivery_judgement"} <= codes


def test_finalise_lowers_unsupported_scores_and_withholds_delivery_comments() -> None:
    request = InterviewScoringRequest.model_validate(body())
    output = InterviewLLM.model_validate(
        {
            "scores": [
                {
                    "question_id": "q1",
                    "score": 4,
                    "confidence": "high",
                    "evidence": ["not in the answer at all"],
                    "rationale": "Spoke with a nervous tone.",
                },
                {
                    "question_id": "q2",
                    "score": 9,
                    "confidence": "high",
                    "evidence": ["I just visit them."],
                    "rationale": "Ok.",
                },
            ],
            "summary": "Neutral.",
        }
    )
    result = finalise(output, request, DraftValidationReport(passed=False, repaired=True, issues=[]), prov())
    by = {s.question_id: s for s in result.scores}
    assert by["q1"].score == 0 and by["q1"].confidence == "low"  # no verified evidence
    assert "nervous" not in by["q1"].rationale
    assert by["q2"].score == 0  # 9 is not a rubric level
    assert by["q3"].score == 0 and by["q3"].rationale == "No answer was given."
