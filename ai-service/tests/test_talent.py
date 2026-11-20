"""AI Talent Assessment Agent: assessment validity, scoring consistency, output reliability,
assessor review, reporting and sharing validated results through the orchestrator."""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from cfp_ai.agents.talent import design, report, scoring
from cfp_ai.agents.talent.models import (
    METHOD_QUESTION_TYPES,
    CriterionResult,
    EvaluationCriterion,
    EvidenceRef,
    LevelResult,
)
from cfp_ai.container import Container
from cfp_ai.integrations.backend.dto import AssessmentItemDTO
from cfp_ai.integrations.backend.mock import data
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from tests.conftest import auth, make_principal

T = "/v1/talent"
METHODS = list(METHOD_QUESTION_TYPES)


def score(client: TestClient, token: str, assessment: str = "dev-james", **body: Any) -> Any:
    return client.post(f"{T}/assessments/{assessment}/scoring", headers=auth(token), json=body)


def accept_all(view: dict[str, Any], **overrides: dict[str, Any]) -> dict[str, Any]:
    items = []
    for rec in view["evaluation"]["recommendations"]:
        item: dict[str, Any] = {"item_id": rec["rubric_row_id"], "decision": "accepted"}
        item.update(overrides.get(rec["rubric_row_id"], {}))
        items.append(item)
    return {"decision": "approve", "items": items}


def by_skill(view: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {r["skill_id"]: r for r in view["evaluation"]["recommendations"]}


# ── scoring consistency: the deterministic level rule ────────────────────────


def _crit(level: int, judgement: str, cid: str | None = None) -> CriterionResult:
    return CriterionResult(
        criterion_id=cid or f"i-{level}-{judgement}",
        level=level,
        text="t",
        judgement=judgement,  # type: ignore[arg-type]
        evidence=[],
        basis="none",
    )


@pytest.mark.parametrize(
    ("criteria", "expected"),
    [
        ([_crit(3, "met"), _crit(4, "met"), _crit(5, "not_evidenced")], 4),
        ([_crit(3, "met"), _crit(4, "partial"), _crit(4, "met", "x")], 4),  # 0.75 coverage
        ([_crit(3, "met"), _crit(4, "partial")], 3),  # 0.5 coverage: partially, not demonstrated
        ([_crit(2, "not_met"), _crit(3, "met")], None),  # a lower level not demonstrated blocks
        ([_crit(2, "not_evidenced"), _crit(3, "met")], 3),  # unassessed levels do not block
        ([_crit(2, "partial"), _crit(3, "met")], 3),  # partially shown levels do not block
        ([_crit(4, "not_met"), _crit(5, "not_met")], None),  # nothing demonstrated → no score
        ([_crit(3, "not_evidenced")], None),
    ],
)
def test_level_rule(criteria: list[CriterionResult], expected: int | None) -> None:
    level, determination = scoring.determine_level(scoring.level_results(criteria))
    assert level == expected
    assert ("assessor decides" in determination) == (expected is None)


def test_level_rule_is_independent_of_criteria_order() -> None:
    criteria = [_crit(3, "met"), _crit(4, "met"), _crit(4, "partial", "y"), _crit(5, "not_met")]
    results = {scoring.determine_level(scoring.level_results(c))[0] for c in (criteria, criteria[::-1])}
    assert results == {4}


def test_keyed_options_are_scored_deterministically() -> None:
    item = AssessmentItemDTO.model_validate(data.ASSESSMENT_ITEMS["lib-sjt-api"])
    levels = {"ind-api-gov-2-1": 2, "ind-api-gov-4-1": 4, "ind-api-gov-4-2": 4}
    best = scoring.keyed_judgements(item, "r", "d", levels)
    assert {k: v[0] for k, v in best.items()} == {"ind-api-gov-4-1": "met", "ind-api-gov-4-2": "met"}
    partial = scoring.keyed_judgements(item, "r", "c", levels)  # carries 4-2 only; misses 4-1
    assert {k: v[0] for k, v in partial.items()} == {"ind-api-gov-4-2": "met", "ind-api-gov-4-1": "not_met"}
    poor = scoring.keyed_judgements(item, "r", "b", levels)
    assert poor["ind-api-gov-2-1"][0] == "met" and poor["ind-api-gov-4-1"][0] == "not_met"
    assert scoring.keyed_judgements(item, "r", "z", levels) == {}


def test_self_reported_text_alone_cannot_fully_meet_a_criterion() -> None:
    criterion = EvaluationCriterion(criterion_id="c1", skill_id="s", level=3, text="t")
    inputs = scoring.RowInputs(row=None, skill=None, criteria=[criterion])  # type: ignore[arg-type]
    inputs.texts = [scoring.ResponseText("self", "subject", "self_assessment", "", "I do it.")]
    model = scoring.RowJudgement.model_validate(
        {
            "judgements": [
                {
                    "criterion_id": "c1",
                    "judgement": "met",
                    "evidence": [{"response_item_id": "self", "quote": "I do it."}],
                }
            ],
            "rationale": "r",
        }
    )
    [result] = scoring.merge(inputs, model)
    assert result.judgement == "partial" and result.evidence[0].self_reported
    inputs.keyed_judgements = {
        "c1": (
            "met",
            EvidenceRef(kind="keyed_option", response_item_id="sjt", respondent="subject", item_type="sjt"),
        )
    }
    [combined] = scoring.merge(inputs, model)
    assert combined.judgement == "met" and combined.basis == "combined"  # the strongest source wins


def test_confidence_reflects_independent_evidence() -> None:
    def ref(rid: str, self_reported: bool = False) -> EvidenceRef:
        return EvidenceRef(
            kind="quote",
            response_item_id=rid,
            respondent="subject",
            item_type="x",
            quote="q",
            self_reported=self_reported,
        )

    one = [_crit(3, "met").model_copy(update={"evidence": [ref("a")]})]
    two = [_crit(3, "met").model_copy(update={"evidence": [ref("a"), ref("b")]})]
    self_only = [_crit(3, "partial").model_copy(update={"evidence": [ref("a", True)]})]
    assert scoring.confidence(3, one) == "medium"
    assert scoring.confidence(3, two) == "high"
    assert scoring.confidence(3, self_only) == "low"
    assert scoring.confidence(None, one) == "low"


# ── scoring consistency: end to end ──────────────────────────────────────────


def _scores(client: TestClient, token: Any) -> dict[str, tuple[Any, ...]]:
    response = score(client, token("priya"))
    assert response.status_code == 201, response.text
    return {
        r["skill_id"]: (
            r["recommended_score"],
            r["confidence"],
            tuple((c["criterion_id"], c["judgement"]) for c in r["criteria"]),
        )
        for r in response.json()["evaluation"]["recommendations"]
    }


def test_repeated_scoring_is_consistent(client: TestClient, token: Any) -> None:
    first, second = _scores(client, token), _scores(client, token)
    assert first == second
    assert {k: v[0] for k, v in first.items()} == {
        "skl-api-gov": 4,
        "skl-influence": 3,
        "skl-microservices": 3,
    }


def test_scores_do_not_depend_on_response_order(
    client: TestClient, token: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    baseline = _scores(client, token)
    monkeypatch.setitem(
        data.ASSESSMENT_RESPONSES, "dev-james", list(reversed(data.ASSESSMENT_RESPONSES["dev-james"]))
    )
    assert _scores(client, token) == baseline


def test_every_score_is_traceable_to_criteria_and_evidence(client: TestClient, token: Any) -> None:
    view = score(client, token("priya")).json()
    evaluation = view["evaluation"]
    assert evaluation["blind"] is True and evaluation["scoring_rule"] == scoring.SCORING_RULE_TEXT
    texts = {
        r["item_id"]: (r["response_text"] or "").replace("James", "the employee").lower()
        for r in data.ASSESSMENT_RESPONSES["dev-james"]
    }
    for rec in evaluation["recommendations"]:
        criteria = [CriterionResult.model_validate(c) for c in rec["criteria"]]
        # Re-deriving the level from the criteria reproduces the recommended score exactly.
        assert scoring.determine_level(scoring.level_results(criteria))[0] == rec["recommended_score"]
        assert [LevelResult.model_validate(level) for level in rec["levels"]] == scoring.level_results(
            criteria
        )
        skill_indicators = {
            i["id"] for lvl in data.SKILLS[rec["skill_id"]]["levels"] for i in lvl["indicators"]
        }
        for c in criteria:
            assert c.criterion_id in skill_indicators  # every criterion is a framework indicator
            if c.judgement in ("met", "partial"):
                assert c.evidence, c
            if c.judgement == "not_evidenced":
                assert not c.evidence
            for e in c.evidence:
                if e.kind == "quote":
                    assert e.quote and e.quote.lower() in texts[e.response_item_id]  # verbatim
        assert rec["gap"] == max(0, rec["required_level"] - rec["recommended_score"])


def test_ratings_are_compared_not_counted(
    client: TestClient, token: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    baseline = by_skill(score(client, token("priya")).json())
    assert baseline["skl-api-gov"]["rating_claims"][0]["alignment"] == "aligned"
    inflated = copy.deepcopy(data.ASSESSMENT_RESPONSES["dev-james"])
    next(r for r in inflated if r["item_id"] == "resp-self")["rating"] = 5
    monkeypatch.setitem(data.ASSESSMENT_RESPONSES, "dev-james", inflated)
    after = by_skill(score(client, token("priya")).json())
    assert after["skl-api-gov"]["recommended_score"] == baseline["skl-api-gov"]["recommended_score"]
    assert after["skl-api-gov"]["rating_claims"][0] == {
        "respondent": "subject",
        "response_item_id": "resp-self",
        "rating": 5,
        "alignment": "above_evidence",
    }


# ── output reliability ───────────────────────────────────────────────────────


def _patch_scorer(fake_llm: FakeLlmProvider, corrupt: Any, times: int = 1) -> dict[str, int]:
    original = fake_llm.responders["talent.score_row"]
    calls = {"n": 0}

    def responder(request: Any, output_model: Any) -> dict[str, Any]:
        calls["n"] += 1
        out: dict[str, Any] = original(request, output_model)
        return corrupt(out) if calls["n"] <= times else out

    fake_llm.responders["talent.score_row"] = responder
    return calls


def _fabricate(out: dict[str, Any]) -> dict[str, Any]:
    for j in out["judgements"]:
        if j["evidence"]:
            j["evidence"][0]["quote"] = "I presented the technical vision to the board and it was adopted."
            j["judgement"] = "met"
    return out


def test_fabricated_evidence_is_repaired(client: TestClient, token: Any, fake_llm: FakeLlmProvider) -> None:
    calls = _patch_scorer(fake_llm, _fabricate)
    view = score(client, token("priya"), rubric_row_ids=["row-inf"]).json()
    assert calls["n"] == 2  # first output rejected (quote_not_in_source), repaired
    assert "board and it was adopted" not in json.dumps(view)
    assert by_skill(view)["skl-influence"]["recommended_score"] == 3


def test_persistent_fabrication_yields_no_score(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    _patch_scorer(fake_llm, _fabricate, times=99)
    response = score(client, token("priya"), rubric_row_ids=["row-inf"])
    assert response.status_code == 422 and response.json()["error"]["code"] == "ai_output_invalid"


@pytest.mark.parametrize(
    "corrupt",
    [
        lambda o: {**o, "rationale": "Strong candidate with high potential; ready for promotion."},
        lambda o: {
            **o,
            "judgements": [{**j, "evidence": []} if j["judgement"] == "met" else j for j in o["judgements"]],
        },
        lambda o: {**o, "judgements": o["judgements"][1:]},  # a criterion left unjudged
        lambda o: {
            **o,
            "judgements": [
                *o["judgements"],
                {"criterion_id": "ind-made-up", "judgement": "met", "evidence": []},
            ],
        },
    ],
    ids=["decision-and-potential-language", "met-without-evidence", "missing-criterion", "unknown-criterion"],
)
def test_invalid_judgements_are_repaired(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider, corrupt: Any
) -> None:
    calls = _patch_scorer(fake_llm, corrupt)
    view = score(client, token("priya"), rubric_row_ids=["row-inf"]).json()
    assert calls["n"] == 2
    rec = by_skill(view)["skl-influence"]
    assert rec["recommended_score"] == 3 and "potential" not in rec["rationale"].lower()


def test_insufficient_evidence_gives_no_score_and_no_invented_evidence(
    client: TestClient, token: Any
) -> None:
    view = score(client, token("priya"), "promo-robert").json()
    influence = by_skill(view)["skl-influence"]
    assert (
        influence["recommended_score"] is None
        and influence["confidence"] == "low"
        and influence["gap"] is None
    )
    assert influence["below_required"] is True
    assert all(not c["evidence"] for c in influence["criteria"] if c["judgement"] == "not_evidenced")
    cloud = by_skill(view)["skl-cloud"]
    assert cloud["recommended_score"] == 4 and cloud["gap"] == 0


def test_scoring_is_blind(client: TestClient, token: Any, fake_llm: FakeLlmProvider) -> None:
    score(client, token("priya"))
    prompts = " ".join(
        c.request.messages[0].content for c in fake_llm.calls if c.route_id == "talent.score_row"
    )
    assert prompts and "James" not in prompts and "Miller" not in prompts and "emp-8721" not in prompts
    assert "the employee split the payments domain" in prompts  # manager comment, name masked


def test_without_the_instrument_endpoint_open_responses_are_still_scored(
    container: Container, client: TestClient, token: Any
) -> None:
    container.backend.faults["BE-068"] = "upstream_error"  # type: ignore[attr-defined]
    view = score(client, token("priya")).json()
    assert {"slice": "framework", "reason": "upstream_error"} in view["evaluation"]["provenance"][
        "unavailable_context"
    ]
    assert all(
        c["basis"] != "keyed_option" for r in view["evaluation"]["recommendations"] for c in r["criteria"]
    )


# ── assessment validity (design) ─────────────────────────────────────────────


@pytest.mark.parametrize("method", METHODS)
def test_every_method_produces_a_valid_complete_design(client: TestClient, token: Any, method: str) -> None:
    response = client.post(
        f"{T}/item-drafts", headers=auth(token("priya")), json={"method": method, "role_id": "role-ssa"}
    )
    assert response.status_code == 201, response.text
    envelope = response.json()
    assert envelope["draft"]["kind"] == "assessment_items" and envelope["draft"]["status"] == "open"
    plan = envelope["draft"]["payload"]
    assert plan["method"] == method and plan["objectives"] and plan["validation"]["passed"]
    assert plan["scoring_method"] == scoring.SCORING_RULE_TEXT and plan["evidence_policy"]
    rubrics = {c["skill_id"]: c for c in plan["competencies"]}
    for skill_id, comp in rubrics.items():
        framework = data.SKILLS[skill_id]["levels"]
        assert [(b["level"], b["label"]) for b in comp["bands"]] == [
            (lvl["level"], lvl["label"]) for lvl in framework
        ]
        indicators = {i["id"]: lvl["level"] for lvl in framework for i in lvl["indicators"]}
        assert all(indicators[c["criterion_id"]] == c["level"] for c in comp["criteria"])
    for q in plan["questions"]:
        assert q["type"] in METHOD_QUESTION_TYPES[method]
        criteria = {c["criterion_id"] for c in rubrics[q["skill_id"]]["criteria"]}
        assert q["expected_indicator_ids"] and set(q["expected_indicator_ids"]) <= criteria
        assert q["prompt"] and q["look_fors"] and q["feedback"]["strong"] and q["feedback"]["developing"]
        assert q["evidence_required"]
        assert q["respondent"] == {"self_rating": "subject", "manager_rating": "manager"}.get(
            q["type"], "subject"
        )
    assert set(rubrics) == {q["skill_id"] for q in plan["questions"]}  # every competency is assessed


def test_methods_assess_the_right_competencies(client: TestClient, token: Any) -> None:
    def competencies(**body: Any) -> Any:
        return client.post(f"{T}/item-drafts", headers=auth(token("priya")), json=body)

    leadership = competencies(method="leadership", role_id="role-ssa").json()["draft"]["payload"]
    assert {c["category"] for c in leadership["competencies"]} == {"behavioural"}
    technical = competencies(method="technical", role_id="role-ssa").json()["draft"]["payload"]
    assert "skl-influence" not in {c["skill_id"] for c in technical["competencies"]}
    no_behavioural = competencies(method="leadership", skill_ids=["skl-cloud"])
    assert no_behavioural.status_code == 412
    outside_role = competencies(method="behavioural", role_id="role-ssa", skill_ids=["skl-unknown"])
    assert outside_role.status_code == 400
    assert competencies(method="astrology", role_id="role-ssa").status_code == 400


def _vctx() -> dict[str, Any]:
    from cfp_ai.integrations.backend.dto import SkillDTO

    comps = [design.rubric(SkillDTO.model_validate(data.SKILLS["skl-api-gov"]), 4)]
    return design.validation_context("competency_based", comps, 2)


def _q(**overrides: Any) -> Any:
    values: dict[str, Any] = {
        "question_key": "q1",
        "type": "behavioural",
        "skill_id": "skl-api-gov",
        "prompt": "Tell us about a time you reviewed a partner integration against the API standard.",
        "expected_indicator_ids": ["ind-api-gov-4-2"],
        "look_fors": ["Specific review steps."],
        "feedback": {"strong": "Clear example.", "developing": "Give a specific example."},
        "evidence_required": "A recent example.",
        "estimated_minutes": 10,
    }
    values.update(overrides)
    return design._Question.model_validate(values)


def _sjt(options: list[tuple[str, int]]) -> Any:
    return _q(
        type="situational_judgement",
        prompt="A partner wants customer data next week without expiry rules. What do you do?",
        options=[
            {"option_key": k, "text": f"Option {k}", "score": s, "indicator_ids": [], "rationale": "r"}
            for k, s in options
        ],
    )


@pytest.mark.parametrize(
    ("questions", "code"),
    [
        ([_q(type="self_rating")], "wrong_type"),
        ([_q(expected_indicator_ids=["ind-cloud-4-1"])], "unknown_indicator"),
        ([_q(prompt="How would you review a partner integration?")], "not_behavioural"),
        ([_q(expected_indicator_ids=["ind-api-gov-2-1"])], "target_level_not_covered"),
        ([_q(), _q(question_key="q2"), _q(question_key="q3")], "too_many_questions"),
        ([_q(), _q()], "duplicate"),
        ([_q(type="scenario", prompt="Review this case.")], "missing_model_answer"),
        ([_sjt([("a", 5), ("b", 5), ("c", 1)])], "invalid_key"),
        ([_sjt([("a", 5), ("b", 4), ("c", 3)])], "invalid_key"),
        ([_sjt([("a", 5), ("b", 1)])], "invalid_options"),
        (
            [_q(prompt="Tell us about a time you showed your personality at work and were a culture fit.")],
            "unsupported_inference",
        ),
        ([_q(prompt="Tell us about a time you were ready for promotion.")], "decision_language"),
    ],
)
def test_design_rules(questions: list[Any], code: str) -> None:
    codes = {i.code for i in design.design_rules(questions, _vctx())}
    assert code in codes, codes


def test_valid_design_questions_pass() -> None:
    assert (
        design.design_rules(
            [_q(), _sjt([("a", 5), ("b", 3), ("c", 1)]).model_copy(update={"question_key": "q2"})], _vctx()
        )
        == []
    )


def test_rating_items_must_ask_for_a_rating_and_an_example() -> None:
    vctx = {**_vctx(), "types": ["self_rating"]}
    bad = _q(type="self_rating", prompt="How good are you at API governance?")
    good = _q(type="self_rating", prompt="Rate your API governance from 1 to 5 and give an example.")
    assert "invalid_rating_item" in {i.code for i in design.design_rules([bad], vctx)}
    assert design.design_rules([good], vctx) == []


def test_design_review_edits_and_commit(client: TestClient, token: Any) -> None:
    envelope = client.post(
        f"{T}/item-drafts",
        headers=auth(token("priya")),
        json={"method": "behavioural", "role_id": "role-ssa"},
    ).json()
    draft_id, payload = envelope["draft"]["draft_id"], envelope["draft"]["payload"]
    url = f"/v1/drafts/{draft_id}"
    tampered = copy.deepcopy(payload)
    tampered["competencies"][0]["target_level"] = 1
    bad = client.patch(url, headers=auth(token("priya")), json={"payload": tampered, "expected_version": 1})
    assert bad.status_code == 400 and "fixed_field" in bad.text
    unfair = copy.deepcopy(payload)
    unfair["questions"][0]["prompt"] = "Tell us about a time your personality helped the team."
    assert (
        client.patch(
            url, headers=auth(token("priya")), json={"payload": unfair, "expected_version": 1}
        ).status_code
        == 400
    )
    edited = copy.deepcopy(payload)
    edited["questions"][0]["look_fors"] = ["Names the standard and the review outcome."]
    assert (
        client.patch(
            url, headers=auth(token("priya")), json={"payload": edited, "expected_version": 1}
        ).status_code
        == 200
    )
    accepted = client.post(
        f"{url}/resolution", headers=auth(token("priya")), json={"decision": "accepted"}
    ).json()
    assert accepted["draft"]["status"] == "accepted"
    assert len(accepted["commit_plan"]) == len(payload["questions"])
    first = accepted["commit_plan"][0]
    assert (first["endpoint_id"], first["method"], first["path"]) == ("BE-065", "POST", "/talent/library")
    assert first["body"]["marking_guide"] and first["body"]["expected_indicator_ids"]
    assert first["body"]["source"]["type"] == "ai_edited"


def test_only_hr_designs_assessments(client: TestClient, token: Any) -> None:
    for persona in ("james", "michael"):
        response = client.post(f"{T}/item-drafts", headers=auth(token(persona)), json={"role_id": "role-ssa"})
        assert response.status_code == 403


# ── assessor review and sharing validated results ────────────────────────────


def test_assessor_review_controls(client: TestClient, token: Any) -> None:
    view = score(client, token("priya")).json()
    assert view["status"] == "awaiting_approval" and view["follow_ups"] == []  # nothing shared before review
    sid = view["evaluation"]["scoring_set_id"]
    url = f"{T}/scoring-sets/{sid}/reviews"
    assert client.post(url, headers=auth(token("michael")), json=accept_all(view)).status_code in (403, 404)
    partial = {"decision": "approve", "items": accept_all(view)["items"][:1]}
    assert client.post(url, headers=auth(token("priya")), json=partial).status_code == 400
    no_reason = accept_all(view, **{"row-inf": {"decision": "overridden", "value": 4}})
    assert client.post(url, headers=auth(token("priya")), json=no_reason).status_code == 400
    out_of_range = accept_all(view, **{"row-inf": {"decision": "overridden", "value": 7, "comment": "x"}})
    assert client.post(url, headers=auth(token("priya")), json=out_of_range).status_code == 400
    assert client.get(f"{T}/scoring-sets/{sid}", headers=auth(token("james"))).status_code == 404


def test_rejected_scores_are_neither_committed_nor_shared(client: TestClient, token: Any) -> None:
    view = score(client, token("priya")).json()
    sid = view["evaluation"]["scoring_set_id"]
    done = client.post(
        f"{T}/scoring-sets/{sid}/reviews",
        headers=auth(token("priya")),
        json={"decision": "reject", "comment": "Responses incomplete."},
    ).json()
    assert done["review"]["status"] == "rejected" and done["review"]["commit_plan"] == []
    assert done["follow_ups"] == [] and done["suggestions"] == []


def test_reviewed_results_are_shared_with_development_and_coaching(
    container: Container, client: TestClient, token: Any
) -> None:
    rubric_before = copy.deepcopy(data.TALENT_ASSESSMENTS["dev-james"]["rubric"])
    view = score(client, token("priya")).json()
    sid = view["evaluation"]["scoring_set_id"]
    override = {
        "row-ms": {"decision": "overridden", "value": 4, "comment": "Observed retry design last month."}
    }
    done = client.post(
        f"{T}/scoring-sets/{sid}/reviews", headers=auth(token("priya")), json=accept_all(view, **override)
    ).json()
    assert done["status"] == "succeeded" and done["review"]["status"] == "modified"
    plan = {c["path"].rsplit("/", 1)[1]: c for c in done["review"]["commit_plan"]}
    assert plan["row-ms"]["body"]["score"] == 4 and plan["row-ms"]["body"]["score_source"] == "ai_overridden"
    assert (
        plan["row-api"]["body"]["score_source"] == "ai_accepted" and plan["row-api"]["body"]["criteria_met"]
    )
    assert (
        data.TALENT_ASSESSMENTS["dev-james"]["rubric"] == rubric_before
    )  # nothing written by the AI service
    # Training Plan Agent: a draft plan for the reviewer-confirmed shortfall only (influence 3 < 5).
    [dev] = [f for f in done["follow_ups"] if f["capability"] == "dev_plan.draft_plan"]
    assert dev["status"] == "succeeded" and dev["subject_employee_id"] == "emp-8721"
    # Coaching Agent: coaching is the employee's own, so the result reaches them as a practice suggestion.
    practice = [s for s in done["suggestions"] if s["source_handoff"] == "talent.assessment_reported"]
    assert (
        practice
        and practice[0]["kind"] == "practice_scenario"
        and practice[0]["subject_employee_id"] == "emp-8721"
    )
    record = container.orchestrator.get(make_principal("priya"), done["execution_id"])
    step = next(s for s in record.steps if s.capability == "dev_plan.draft_plan")
    assert step.handoff_payload is not None and step.handoff_payload["confirmed_scores"] == {
        "skl-influence": 3
    }
    assert container.talent_results.reviewed("org-gec", "dev-james") is not None


def test_recruitment_results_are_not_shared(
    client: TestClient, token: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    recruitment = copy.deepcopy(data.TALENT_ASSESSMENTS["promo-robert"])
    recruitment.update(type="recruitment", subject={"type": "candidate", "id": "cand-17"})
    monkeypatch.setitem(data.TALENT_ASSESSMENTS, "promo-robert", recruitment)
    view = score(client, token("priya"), "promo-robert").json()
    override = {
        "row-influence": {"decision": "overridden", "value": 3, "comment": "Limited executive exposure."}
    }
    done = client.post(
        f"{T}/scoring-sets/{view['evaluation']['scoring_set_id']}/reviews",
        headers=auth(token("priya")),
        json=accept_all(view, **override),
    ).json()
    assert done["status"] == "succeeded" and done["follow_ups"] == [] and done["suggestions"] == []


def test_employees_cannot_score_assessments(client: TestClient, token: Any) -> None:
    assert score(client, token("james")).status_code == 403
    assert score(client, token("ama")).status_code in (403, 404)


# ── reporting ────────────────────────────────────────────────────────────────


def _commit(monkeypatch: pytest.MonkeyPatch, scores: dict[str, int]) -> None:
    assessment = copy.deepcopy(data.TALENT_ASSESSMENTS["dev-james"])
    for row in assessment["rubric"]:
        row.update(score=scores[row["row_id"]], score_source="ai_accepted")
    monkeypatch.setitem(data.TALENT_ASSESSMENTS, "dev-james", assessment)


def _review(client: TestClient, token: Any) -> None:
    view = score(client, token("priya")).json()
    client.post(
        f"{T}/scoring-sets/{view['evaluation']['scoring_set_id']}/reviews",
        headers=auth(token("priya")),
        json=accept_all(view),
    )


def test_report_requires_committed_confirmed_scores(client: TestClient, token: Any) -> None:
    response = client.post(f"{T}/assessments/dev-james/report-drafts", headers=auth(token("priya")))
    assert response.status_code == 412


def test_report_from_confirmed_scores(
    client: TestClient, token: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    _review(client, token)
    _commit(monkeypatch, {"row-api": 4, "row-inf": 3, "row-ms": 3})
    response = client.post(f"{T}/assessments/dev-james/report-drafts", headers=auth(token("michael")))
    assert response.status_code == 201, response.text
    envelope = response.json()
    rep = envelope["draft"]["payload"]
    assert (
        envelope["draft"]["kind"] == "assessment_report"
        and envelope["draft"]["subject_employee_id"] == "emp-8721"
    )
    assert rep["objectives"] == data.TALENT_ASSESSMENTS["dev-james"]["objectives"]
    levels = {c["skill_id"]: (c["confirmed_level"], c["gap"]) for c in rep["competencies"]}
    assert levels == {"skl-api-gov": (4, 0), "skl-influence": (3, 2), "skl-microservices": (3, 1)}
    assert rep["strengths"] == ["API Governance"]
    assert [(n["skill_id"], n["priority"]) for n in rep["development_needs"]] == [
        ("skl-influence", "critical"),
        ("skl-microservices", "high"),
    ]
    for r in rep["development_recommendations"]:
        assert all(data.CATALOGUE[c]["status"] == "active" for c in r["catalogue_item_ids"])
    assert all(
        c["evidence"] and c["feedback"] for c in rep["competencies"]
    )  # evidence from the reviewed evaluation
    text = json.dumps(rep).lower()
    assert "ready for promotion" not in text and "potential" not in text
    draft_id = envelope["draft"]["draft_id"]
    own = client.post(
        f"/v1/drafts/{draft_id}/resolution", headers=auth(token("james")), json={"decision": "accepted"}
    )
    assert own.status_code == 403  # the assessed employee cannot approve their own report
    ok = client.post(
        f"/v1/drafts/{draft_id}/resolution", headers=auth(token("priya")), json={"decision": "accepted"}
    ).json()
    [commit] = ok["commit_plan"]
    assert (commit["endpoint_id"], commit["path"]) == ("BE-067", "/talent/assessments/dev-james/reports")


def test_report_does_not_reuse_evidence_for_changed_scores(
    client: TestClient, token: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    _review(client, token)
    _commit(monkeypatch, {"row-api": 4, "row-inf": 2, "row-ms": 3})  # influence committed differently
    rep = client.post(f"{T}/assessments/dev-james/report-drafts", headers=auth(token("priya"))).json()[
        "draft"
    ]["payload"]
    rows = {c["skill_id"]: c for c in rep["competencies"]}
    assert rows["skl-influence"]["confirmed_level"] == 2 and rows["skl-influence"]["evidence"] == []
    assert rows["skl-api-gov"]["evidence"]


def test_report_rules() -> None:
    vctx = {"employee": False, "rows": {"r1": {"confirmed": 3, "required": 4}}, "needs": {}}
    out = report.ReportLLM.model_validate(
        {
            "summary": "Results confirmed at level 5.",
            "competency_feedback": [
                {"rubric_row_id": "r1", "feedback": "Shown at level 5; a natural leader."}
            ],
            "recommendations": [{"skill_id": "s", "recommendation": "Do a course."}],
            "participant_feedback": "Thanks.",
        }
    )
    codes = [i.code for i in report.report_rules(out, vctx)]
    assert (
        codes.count("score_mismatch") == 2 and "unsupported_inference" in codes and "not_applicable" in codes
    )


def test_reviewed_results_are_erased_with_the_employee(
    container: Container, client: TestClient, token: Any
) -> None:
    _review(client, token)
    assert container.talent_results.reviewed("org-gec", "dev-james") is not None
    container.talent_results.erase_subject("org-gec", "emp-8721")
    assert container.talent_results.reviewed("org-gec", "dev-james") is None
