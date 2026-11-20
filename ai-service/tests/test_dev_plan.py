"""AI Training & Development Plan Agent: IDP generation, validation, review workflow, progress
tracking, evidence-driven updates, agent collaboration, events and authorisation."""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from cfp_ai.agents.dev_plan import planning
from cfp_ai.agents.dev_plan.draft_plan import validate_edit
from cfp_ai.api.app import create_app
from cfp_ai.container import Container, build_container, fake_responders
from cfp_ai.integrations.backend.mock import data
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from tests.conftest import auth, make_settings

DRAFTS = "/v1/dev-plans/drafts"
WEBHOOK_SECRET = "whsec-test-0123456789"
REQUIRED_GOAL_FIELDS = {
    "skill_id",
    "current_level",
    "target_level",
    "gap",
    "priority",
    "objective",
    "interventions",
    "resources",
    "milestones",
    "expected_outcomes",
    "success_indicators",
    "start_week",
    "end_week",
}


def draft(client: TestClient, token: str, **body: Any) -> dict[str, Any]:
    response = client.post(DRAFTS, headers=auth(token), json={"employee_id": "emp-8721", **body})
    assert response.status_code == 201, response.text
    envelope: dict[str, Any] = response.json()
    return envelope


def resolve(client: TestClient, token: str, draft_id: str, **body: Any) -> Any:
    return client.post(f"/v1/drafts/{draft_id}/resolution", headers=auth(token), json=body)


# ── IDP generation ───────────────────────────────────────────────────────────


def test_plan_contains_every_required_element(client: TestClient, token: Any) -> None:
    envelope = draft(client, token("james"))
    plan_draft = envelope["draft"]
    assert plan_draft["kind"] == "development_plan" and plan_draft["status"] == "open"
    assert plan_draft["subject_employee_id"] == "emp-8721"
    assert "official development record only after review" in plan_draft["disclaimer"]
    plan = plan_draft["payload"]
    assert plan["employee"]["employee_id"] == "emp-8721"
    assert plan["employee"]["plan_role_id"] == "role-ssa" and plan["employee"]["role_profile_version"] == "3"
    assert plan["development_objectives"] and plan["horizon_weeks"] == 12
    assert plan["validation"]["passed"] is True
    goals = plan["goals"]
    assert goals and all(REQUIRED_GOAL_FIELDS <= set(g) for g in goals)
    # Gaps come from verified data, not the model; met requirements (skl-cloud 4/4) are not planned.
    by_skill = {g["skill_id"]: g for g in goals}
    assert "skl-cloud" not in by_skill
    influence = by_skill["skl-influence"]
    assert (influence["current_level"], influence["target_level"], influence["gap"]) == (3, 5, 2)
    assert influence["current_level_source"] == "verified"
    assert by_skill["skl-api-gov"]["current_level"] is None  # self-assessed only → not used as current level
    # Highest priority first; each goal is measurable and scheduled inside the horizon.
    priorities = [g["priority"] for g in goals]
    assert priorities == sorted(priorities, key=["critical", "high", "medium", "low"].index)
    for goal in goals:
        types = {a["type"] for a in goal["interventions"]}
        assert "workplace_practice" in types and "learning" in types
        assert goal["success_indicators"] and goal["milestones"] and goal["expected_outcomes"]
        assert 1 <= goal["start_week"] <= goal["end_week"] <= 12
    assert plan["evidence_basis"]


def test_organisational_resources_are_prioritised(client: TestClient, token: Any) -> None:
    plan = draft(client, token("james"))["draft"]["payload"]
    for goal in plan["goals"]:
        learning = [a for a in goal["interventions"] if a["type"] == "learning"]
        assert all(a["catalogue_item_id"] in data.CATALOGUE for a in learning)
        assert all(data.CATALOGUE[a["catalogue_item_id"]]["status"] == "active" for a in learning)
        assert {r["catalogue_item_id"] for r in goal["resources"]} == {
            a["catalogue_item_id"] for a in learning
        }
        for resource in goal["resources"]:
            assert resource["title"] == data.CATALOGUE[resource["catalogue_item_id"]]["title"]


def test_options_focus_horizon_and_validation(client: TestClient, token: Any) -> None:
    plan = draft(client, token("james"), focus_skill_ids=["skl-influence"], horizon_weeks=8)["draft"][
        "payload"
    ]
    assert [g["skill_id"] for g in plan["goals"]] == ["skl-influence"] and plan["horizon_weeks"] == 8
    bad = client.post(
        DRAFTS, headers=auth(token("james")), json={"employee_id": "emp-8721", "focus_skill_ids": ["skl-x"]}
    )
    assert bad.status_code == 400
    too_long = client.post(
        DRAFTS, headers=auth(token("james")), json={"employee_id": "emp-8721", "horizon_weeks": 99}
    )
    assert too_long.status_code == 400


def test_invalid_model_output_is_repaired(client: TestClient, token: Any, fake_llm: FakeLlmProvider) -> None:
    original = fake_llm.responders["dev_plan.generate"]
    calls = {"n": 0}

    def skip_org_learning_first(request: Any, output_model: Any) -> dict[str, Any]:
        calls["n"] += 1
        out: dict[str, Any] = original(request, output_model)
        if calls["n"] == 1:  # first attempt ignores the organisation's catalogue
            for goal in out["goals"]:
                goal["interventions"] = [a for a in goal["interventions"] if a["type"] != "learning"]
        return out

    fake_llm.responders["dev_plan.generate"] = skip_org_learning_first
    plan = draft(client, token("james"))["draft"]["payload"]
    assert calls["n"] == 2
    assert plan["validation"]["passed"] is True and plan["validation"]["repaired"] is True
    assert all(any(a["type"] == "learning" for a in g["interventions"]) for g in plan["goals"])


def _inputs() -> tuple[planning.PlanningInputs, dict[str, Any]]:
    spec = planning.GoalSpec("skl-x", "X", "technical", 2, "verified", 4, 2, "high", "gap 2")
    spec.catalogue = []
    spec.indicators = [("ind-x-4", 4, "Does X")]
    inputs = planning.PlanningInputs(
        context=None,  # type: ignore[arg-type]
        goals=[spec],
        horizon_weeks=8,
        hours_per_week=1,
        evidence=[],
        completed_items=set(),
    )
    vctx = planning.validation_context(inputs)
    vctx["goal_skills"]["skl-x"]["catalogue"] = ["cat-1"]
    vctx["catalogue_minutes"] = {"cat-1": 1200}
    return inputs, vctx


def _goal(**overrides: Any) -> planning._Goal:
    values: dict[str, Any] = {
        "skill_id": "skl-x",
        "objective": "o",
        "interventions": [
            {
                "action_key": "a1",
                "type": "learning",
                "title": "t",
                "description": "d",
                "catalogue_item_id": "cat-1",
                "due_in_days": 14,
            },
            {
                "action_key": "a2",
                "type": "workplace_practice",
                "title": "t",
                "description": "d",
                "due_in_days": 50,
            },
        ],
        "milestones": [{"milestone_key": "m", "title": "t", "due_week": 4, "measure": "m"}],
        "expected_outcomes": ["e"],
        "success_indicator_ids": ["ind-x-4"],
        "start_week": 1,
        "end_week": 8,
    }
    values.update(overrides)
    return planning._Goal.model_validate(values)


def test_plan_rules() -> None:
    _, vctx = _inputs()
    codes = lambda goals: {i.code for i in planning.plan_rules(goals, vctx)}  # noqa: E731
    assert codes([_goal()]) == {"over_capacity"}  # 1200 min over 8 weeks > 60 min/week
    vctx["hours_per_week"] = None
    assert codes([_goal()]) == set()
    assert codes([]) == {"missing_goal"}
    only_practice = _goal(interventions=[_goal().interventions[1].model_dump()])
    assert codes([only_practice]) == {"org_resource_missing"}
    only_learning = _goal(interventions=[_goal().interventions[0].model_dump()])
    assert codes([only_learning]) == {"missing_assignment"}
    external = _goal().interventions[0].model_dump() | {"catalogue_item_id": "udemy-123"}
    assert "unknown_id" in codes([_goal(interventions=[external, _goal().interventions[1].model_dump()])])
    assert "invalid_timeline" in codes([_goal(start_week=6, end_week=3)])
    assert "outside_horizon" in codes(
        [
            _goal(
                interventions=[
                    _goal().interventions[0].model_dump(),
                    _goal().interventions[1].model_dump() | {"due_in_days": 90},
                ]
            )
        ]
    )
    assert "unknown_indicator" in codes([_goal(success_indicator_ids=["ind-other"])])


# ── review workflow ──────────────────────────────────────────────────────────


def test_employee_cannot_approve_their_own_plan(client: TestClient, token: Any) -> None:
    envelope = draft(client, token("james"))
    assert (
        envelope["can_resolve"] is False and envelope["draft"]["approval_policy"]["mode"] == "role_approval"
    )
    denied = resolve(client, token("james"), envelope["draft"]["draft_id"], decision="accepted")
    assert denied.status_code == 403


def test_manager_approval_produces_a_commit_plan_not_a_write(client: TestClient, token: Any) -> None:
    plans_before = copy.deepcopy(data.DEVELOPMENT_PLANS)
    envelope = draft(client, token("james"))
    draft_id = envelope["draft"]["draft_id"]
    view = client.get(f"/v1/drafts/{draft_id}", headers=auth(token("michael"))).json()
    assert view["can_resolve"] is True
    accepted = resolve(client, token("michael"), draft_id, decision="accepted")
    assert accepted.status_code == 200, accepted.text
    body = accepted.json()
    assert body["draft"]["status"] == "accepted"
    [commit] = body["commit_plan"]
    assert (commit["endpoint_id"], commit["method"], commit["path"]) == (
        "BE-052",
        "POST",
        "/development-plans",
    )
    assert commit["endpoint_status"] == "mocked"  # proposed in production: needs backend confirmation
    payload = commit["body"]
    assert payload["employee_id"] == "emp-8721" and payload["source"] == {
        "type": "ai",
        "draft_id": draft_id,
        "model": body["draft"]["provenance"]["model"],
        "prompt_version": "dev_plan.generate@v1",
    }
    assert all(g["actions"] and g["milestones"] and g["success_indicator_ids"] for g in payload["goals"])
    assert data.DEVELOPMENT_PLANS == plans_before  # the AI service never writes official records
    # A second resolution conflicts; the frontend reports the backend commit afterwards.
    assert resolve(client, token("priya"), draft_id, decision="rejected").status_code == 409
    ref = {"system": "backend", "resource_type": "development_plan", "resource_id": "plan-7001"}
    assert (
        client.post(
            f"/v1/drafts/{draft_id}/commit-report", headers=auth(token("james")), json={"committed_ref": ref}
        ).status_code
        == 403
    )
    done = client.post(
        f"/v1/drafts/{draft_id}/commit-report", headers=auth(token("michael")), json={"committed_ref": ref}
    )
    assert done.status_code == 200 and done.json()["draft"]["status"] == "committed"


def test_edits_are_revalidated_and_versioned(client: TestClient, token: Any) -> None:
    envelope = draft(client, token("james"))
    draft_id, payload = envelope["draft"]["draft_id"], envelope["draft"]["payload"]
    url = f"/v1/drafts/{draft_id}"

    tampered = copy.deepcopy(payload)
    tampered["goals"][0]["target_level"] = 2  # verified-data fields are fixed
    bad = client.patch(url, headers=auth(token("james")), json={"payload": tampered, "expected_version": 1})
    assert bad.status_code == 400 and "fixed_field" in bad.text

    no_assignment = copy.deepcopy(payload)
    no_assignment["goals"][0]["interventions"] = [
        a for a in no_assignment["goals"][0]["interventions"] if a["type"] != "workplace_practice"
    ]
    assert (
        client.patch(
            url, headers=auth(token("james")), json={"payload": no_assignment, "expected_version": 1}
        ).status_code
        == 400
    )

    edited = copy.deepcopy(payload)
    edited["goals"][0]["objective"] = "Lead the API standards review for the payments platform."
    ok = client.patch(url, headers=auth(token("james")), json={"payload": edited, "expected_version": 1})
    assert ok.status_code == 200 and ok.json()["version"] == 2
    stale = client.patch(url, headers=auth(token("james")), json={"payload": edited, "expected_version": 1})
    assert stale.status_code == 409

    edited["goals"][0]["expected_outcomes"] = ["Publishes the API standard."]
    resolved = resolve(
        client,
        token("michael"),
        draft_id,
        decision="edited",
        edited_payload=edited,
        reason="Narrowed the outcome",
        expected_version=2,
    )
    assert resolved.status_code == 200, resolved.text
    body = resolved.json()
    assert body["draft"]["status"] == "edited"
    assert body["commit_plan"][0]["body"]["source"]["type"] == "ai_edited"
    actions = [e["action"] for e in body["review_history"]]
    assert actions[0] == "created" and "edit_proposed" in actions


def test_validate_edit_checks_resources_against_interventions(client: TestClient, token: Any) -> None:
    envelope = draft(client, token("james"))
    record = client.app.state.container.drafts.record("org-gec", envelope["draft"]["draft_id"])  # type: ignore[attr-defined]
    from cfp_ai.agents.dev_plan.models import IndividualDevelopmentPlan

    plan = IndividualDevelopmentPlan.model_validate(envelope["draft"]["payload"])
    assert validate_edit(plan, record.validation_context) == []
    plan.goals[0].resources = []
    assert {i.code for i in validate_edit(plan, record.validation_context)} == {"resources_mismatch"}


def test_drafts_expire_and_are_private(client: TestClient, token: Any) -> None:
    envelope = draft(client, token("james"))
    draft_id = envelope["draft"]["draft_id"]
    assert client.get(f"/v1/drafts/{draft_id}", headers=auth(token("ama"))).status_code == 404
    listed = client.get(
        "/v1/drafts", headers=auth(token("michael")), params={"subject_employee_id": "emp-8721"}
    )
    assert [d["draft"]["draft_id"] for d in listed.json()] == [draft_id]
    record = client.app.state.container.drafts.record("org-gec", draft_id)  # type: ignore[attr-defined]
    record.draft = record.draft.model_copy(update={"expires_at": datetime.now(UTC) - timedelta(minutes=1)})
    assert (
        client.get(f"/v1/drafts/{draft_id}", headers=auth(token("james"))).json()["draft"]["status"]
        == "expired"
    )
    assert resolve(client, token("michael"), draft_id, decision="accepted").status_code == 409


# ── authorisation ────────────────────────────────────────────────────────────


def test_only_authorised_people_can_draft(client: TestClient, token: Any) -> None:
    def status(persona: str, employee: str) -> int:
        return client.post(DRAFTS, headers=auth(token(persona)), json={"employee_id": employee}).status_code

    assert status("james", "emp-9042") == 403  # not their own record
    assert status("michael", "emp-9042") == 201  # direct report
    assert status("priya", "emp-8721") == 201  # HR, same tenant
    assert status("ama", "emp-8721") in (403, 404)  # other tenant
    no_entitlement = token("james", ai_entitlements=["ai_coaching"])
    assert (
        client.post(DRAFTS, headers=auth(no_entitlement), json={"employee_id": "emp-8721"}).status_code == 403
    )


# ── D2 / D3 ──────────────────────────────────────────────────────────────────


def test_learning_recommendations_use_the_organisation_catalogue(client: TestClient, token: Any) -> None:
    response = client.get("/v1/dev-plans/recommendations/learning", headers=auth(token("james")))
    assert response.status_code == 200
    body = response.json()
    assert body["provenance"]["model"] == "none"  # deterministic ranking
    items = body["recommendations"]
    ids = [r["catalogue_item_id"] for r in items]
    assert ids[0] == "cat-api-gov-2024" and items[0]["fit_reason"].startswith("Continue")  # in progress
    assert "cat-ai-ethics" not in ids  # retired
    assert all(i in data.CATALOGUE for i in ids)
    scoped = client.get(
        "/v1/dev-plans/recommendations/learning",
        headers=auth(token("james")),
        params={"skill_id": "skl-influence", "limit": 1},
    ).json()["recommendations"]
    assert [r["catalogue_item_id"] for r in scoped] == ["cat-influence-masterclass"]
    outside_role = client.get(
        "/v1/dev-plans/recommendations/learning",
        headers=auth(token("james")),
        params={"skill_id": "skl-unknown"},
    )
    assert outside_role.status_code == 400
    for_report = client.get(
        "/v1/dev-plans/recommendations/learning",
        headers=auth(token("james")),
        params={"employee_id": "emp-9042"},
    )
    assert for_report.status_code == 403


def test_gap_insights_endpoint(client: TestClient, token: Any) -> None:
    response = client.get("/v1/dev-plans/gaps/emp-8721", headers=auth(token("michael")))
    assert response.status_code == 200, response.text
    assert client.get("/v1/dev-plans/gaps/emp-8721", headers=auth(token("ama"))).status_code in (403, 404)


# ── D4: progress tracking and evidence-driven updates ─────────────────────────


def test_progress_is_tracked_against_verified_data(client: TestClient, token: Any) -> None:
    response = client.get("/v1/dev-plans/plans/plan-5501/progress", headers=auth(token("james")))
    assert response.status_code == 200, response.text
    report = response.json()
    [goal] = report["goals"]
    assert goal["skill_id"] == "skl-api-gov" and goal["current_verified_level"] is None
    assert goal["status"] in ("on_track", "at_risk") and goal["actions_total"] == 1
    assert client.get("/v1/dev-plans/plans/plan-5501/progress", headers=auth(token("ama"))).status_code in (
        403,
        404,
    )


def test_new_verified_level_marks_the_goal_complete(
    client: TestClient, token: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    caps = [dict(c) for c in data.CAPABILITIES["emp-8721"]]
    for cap in caps:
        if cap["skill_id"] == "skl-api-gov":
            cap.update(verified_level=4, verified_at=datetime.now(UTC).isoformat(), verified_by="emp-1001")
    monkeypatch.setitem(data.CAPABILITIES, "emp-8721", caps)
    response = client.post(
        "/v1/dev-plans/plans/plan-5501/review",
        headers=auth(token("michael")),
        json={"trigger": "capability_verified"},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["progress"]["goals"][0]["status"] == "achieved"
    assert any(e["source"] == "verified_levels" for e in result["progress"]["new_evidence"])
    adjustment = result["adjustment"]["draft"]
    assert adjustment["kind"] == "plan_adjustment" and adjustment["status"] == "open"
    ops = {(c["op"], c["goal_ref"]) for c in adjustment["payload"]["changes"]}
    assert ("mark_goal_complete", "goal-5501-1") in ops
    assert adjustment["payload"]["trigger"] == "capability_verified"
    # The adjustment needs the same review; approval yields a BE-053 PATCH for the frontend.
    draft_id = adjustment["draft_id"]
    assert resolve(client, token("james"), draft_id, decision="accepted").status_code == 403
    accepted = resolve(client, token("michael"), draft_id, decision="accepted").json()
    [commit] = accepted["commit_plan"]
    assert (commit["endpoint_id"], commit["method"], commit["path"]) == (
        "BE-053",
        "PATCH",
        "/development-plans/plan-5501",
    )


def test_retired_learning_is_removed_and_new_gaps_are_added(
    client: TestClient, token: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    plans = copy.deepcopy(data.DEVELOPMENT_PLANS["emp-8721"])
    plans[0]["goals"][0]["actions"][0]["catalogue_item_id"] = (
        "cat-ai-ethics"  # retired since the plan was made
    )
    monkeypatch.setitem(data.DEVELOPMENT_PLANS, "emp-8721", plans)
    result = client.post(
        "/v1/dev-plans/plans/plan-5501/review", headers=auth(token("james")), json={"trigger": "manual"}
    ).json()
    changes = result["adjustment"]["draft"]["payload"]["changes"]
    assert any(c["op"] == "remove_action" and c["action_ref"] == "act-1" for c in changes)
    added = [c["goal"] for c in changes if c["op"] == "add_goal"]
    assert "skl-influence" in {g["skill_id"] for g in added}  # critical gap not covered by the plan
    for goal in added:  # new goals follow the same rules: org learning + workplace assignment
        types = {a["type"] for a in goal["actions"]}
        assert {"learning", "workplace_practice"} <= types


def test_review_rejects_unknown_trigger_and_foreign_plans(client: TestClient, token: Any) -> None:
    bad = client.post(
        "/v1/dev-plans/plans/plan-5501/review", headers=auth(token("james")), json={"trigger": "x"}
    )
    assert bad.status_code == 400
    assert client.post(
        "/v1/dev-plans/plans/plan-5501/review", headers=auth(token("ama")), json={}
    ).status_code in (403, 404)


# ── collaboration through the orchestrator ───────────────────────────────────


def test_reviewed_promotion_assessment_hands_off_a_plan_draft(client: TestClient, token: Any) -> None:
    url = "/v1/orchestrator/executions"
    record = client.post(
        url,
        headers=auth(token("priya")),
        json={"capability": "talent.recommend_scores", "args": {"assessment_id": "promo-robert"}},
    ).json()
    approval = record["steps"][0]["approval"]
    decision = {
        "decision": "approve",
        "items": [
            {"item_id": "row-cloud", "decision": "overridden", "value": 4, "comment": "meets"},
            {"item_id": "row-influence", "decision": "overridden", "value": 3, "comment": "limited exposure"},
        ],
    }
    done = client.post(
        f"{url}/{record['execution_id']}/approvals/{approval['approval_id']}/decision",
        headers=auth(token("priya")),
        json=decision,
    ).json()
    assert done["status"] == "succeeded", done
    plan_steps = [s for s in done["steps"] if s["capability"] == "dev_plan.draft_plan"]
    assert len(plan_steps) == 1
    step = plan_steps[0]
    assert step["origin"] == "handoff" and step["subject_employee_id"] == "emp-9042"
    assert step["status"] == "succeeded", step
    plan = step["output"]["draft"]["payload"]
    assert plan["employee"]["plan_role_id"] == "role-ssa"  # the assessed (promotion) role
    goals = {g["skill_id"]: g for g in plan["goals"]}
    assert set(goals) == {"skl-influence"}  # only the reviewer-confirmed shortfall
    assert (
        goals["skl-influence"]["current_level"] == 3
        and goals["skl-influence"]["current_level_source"] == "assessment"
    )
    assert any(e["source"] == "assessment" for e in plan["evidence_basis"])
    assert step["output"]["draft"]["status"] == "open"  # still needs review


def test_critical_goals_hand_off_to_coaching_practice(client: TestClient, token: Any) -> None:
    record = client.post(
        "/v1/orchestrator/executions",
        headers=auth(token("james")),
        json={"capability": "dev_plan.draft_plan", "subject_employee_id": "emp-8721"},
    ).json()
    assert record["status"] == "succeeded", record
    capabilities = [s["capability"] for s in record["steps"]]
    practice = [s for s in record["steps"] if s["capability"] == "coaching.recommend_scenarios"]
    suggested = [s for s in record["suggestions"] if s["kind"] == "practice_scenario"]
    assert practice or suggested, capabilities
    if practice:
        assert practice[0]["origin"] == "handoff" and practice[0]["handoff_payload"]["skill_ids"]


# ── backend events (BE-080, proposed) ────────────────────────────────────────


@pytest.fixture
def events_client() -> Iterator[tuple[TestClient, Container]]:
    container = build_container(
        make_settings(webhook_secret=WEBHOOK_SECRET),
        providers={"fake": FakeLlmProvider(responders=fake_responders())},
    )
    with TestClient(create_app(container=container)) as test_client:
        yield test_client, container


def send_event(
    client: TestClient, event: dict[str, Any], *, secret: str = WEBHOOK_SECRET, skew: int = 0
) -> Any:
    body = json.dumps(event).encode()
    timestamp = str(int(time.time()) - skew)
    signature = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "X-CFP-Event-Id": event["event_id"],
        "X-CFP-Timestamp": timestamp,
        "X-CFP-Signature": f"sha256={signature}",
    }
    return client.post("/v1/events", content=body, headers=headers)


def event(type_: str, data_: dict[str, Any], event_id: str = "evt-1") -> dict[str, Any]:
    return {
        "event_id": event_id,
        "type": type_,
        "tenant_id": "org-gec",
        "occurred_at": datetime.now(UTC).isoformat(),
        "subject": {"type": "employee", "id": data_.get("employee_id", "emp-8721")},
        "data": data_,
    }


def test_events_require_a_valid_fresh_signature(events_client: tuple[TestClient, Container]) -> None:
    client, _ = events_client
    sample = event("learning.record.completed", {"employee_id": "emp-8721"})
    assert send_event(client, sample, secret="wrong").status_code == 401
    assert send_event(client, sample, skew=3600).status_code == 401
    assert send_event(client, sample).status_code == 202


def test_events_are_disabled_without_a_secret(client: TestClient) -> None:
    assert send_event(client, event("learning.record.completed", {})).status_code == 503


def test_capability_verified_suggests_a_plan_review_once(events_client: tuple[TestClient, Container]) -> None:
    client, container = events_client
    sample = event(
        "capability.verified", {"employee_id": "emp-8721", "skill_id": "skl-api-gov", "verified_level": 4}
    )
    assert send_event(client, sample).status_code == 202
    assert send_event(client, sample).status_code == 202  # at-least-once delivery: de-duplicated
    suggestions = container.suggestions.list_for_subject("org-gec", "emp-8721")
    assert [(s.kind, s.source_handoff) for s in suggestions] == [
        ("plan_review", "talent.assessment_reported")
    ]


def test_plan_created_event_confirms_the_draft_commit(
    events_client: tuple[TestClient, Container], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, container = events_client
    mint = container.verifier.mint  # type: ignore[attr-defined]
    envelope = draft(client, mint(data.PERSONAS["james"]))
    draft_id = envelope["draft"]["draft_id"]
    assert resolve(client, mint(data.PERSONAS["michael"]), draft_id, decision="accepted").status_code == 200
    created = event(
        "development_plan.created",
        {"plan_id": "plan-7002", "employee_id": "emp-8721", "source": {"type": "ai", "draft_id": draft_id}},
    )
    assert send_event(client, created).status_code == 202
    record = container.drafts.record("org-gec", draft_id)
    assert record is not None and record.draft.status == "committed"
    assert record.draft.resolution is not None and record.draft.resolution.committed_ref is not None
    assert record.draft.resolution.committed_ref.resource_id == "plan-7002"


def test_employee_deleted_erases_ai_held_plan_data(events_client: tuple[TestClient, Container]) -> None:
    client, container = events_client
    mint = container.verifier.mint  # type: ignore[attr-defined]
    draft_id = draft(client, mint(data.PERSONAS["james"]))["draft"]["draft_id"]
    assert (
        send_event(client, event("employee.deleted", {"employee_id": "emp-8721"}, "evt-del")).status_code
        == 202
    )
    assert container.drafts.record("org-gec", draft_id) is None
    assert container.suggestions.list_for_subject("org-gec", "emp-8721", status=None) == []
