"""Integration: HTTP → orchestrator → real agent capabilities → mock backend → fake LLM."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from cfp_ai.integrations.backend.mock import data
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from tests.conftest import auth

URL = "/v1/orchestrator/executions"


def run(client: TestClient, token: str, **body: Any) -> dict[str, Any]:
    response = client.post(URL, headers=auth(token), json=body)
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


def test_agents_endpoint_lists_three_agents(client: TestClient, token: Any) -> None:
    body = client.get("/v1/orchestrator/agents", headers=auth(token("michael"))).json()
    agents = {a["name"]: a for a in body}
    assert set(agents) == {"coaching", "dev_plan", "talent_assessment"}
    brief = next(c for c in agents["coaching"]["capabilities"] if c["capability"] == "coaching.manager_brief")
    assert brief["availability"] == "available"


def test_employee_asks_about_own_gaps(client: TestClient, token: Any) -> None:
    record = run(client, token("james"), message="Why do I have skill gaps for my role?")
    assert record["status"] == "succeeded", record
    step = record["steps"][0]
    assert (step["capability"], step["agent"], step["subject_employee_id"]) == (
        "dev_plan.explain_gaps",
        "dev_plan",
        "emp-8721",
    )
    gaps = step["output"]["gaps"]
    assert gaps[0]["skill_id"] == "skl-api-gov" and gaps[0]["priority"] == "critical"
    assert gaps[0]["citations"] and gaps[0]["citations"][0]["source_type"] == "indicator"
    # Critical gaps → handoff to the Coaching Agent, which now recommends practice scenarios.
    practice = record["steps"][1]
    assert (practice["capability"], practice["origin"], practice["status"]) == (
        "coaching.recommend_scenarios",
        "handoff",
        "succeeded",
    )
    recommended = practice["output"]["recommendations"]
    assert recommended and recommended[0]["target_skill_id"] in {g["skill_id"] for g in gaps}
    assert "authoring" not in recommended[0]["scenario"]  # hidden persona details never leave the library
    assert record["suggestions"] == []


def test_manager_coordinates_two_agents(client: TestClient, token: Any, fake_llm: FakeLlmProvider) -> None:
    fake_llm.queue.append(
        {
            "steps": [
                {"capability": "dev_plan.explain_gaps", "subject": "requested"},
                {
                    "capability": "coaching.manager_brief",
                    "subject": "requested",
                    "depends_on_previous": True,
                    "only_if_previous_has": "gaps",
                },
            ]
        }
    )
    record = run(
        client,
        token("michael"),
        message="Explain James's gaps and prepare my coaching brief",
        subject_employee_id="emp-8721",
    )
    assert record["status"] == "succeeded", record
    assert [(s["agent"], s["status"]) for s in record["steps"]] == [
        ("dev_plan", "succeeded"),
        ("coaching", "succeeded"),
    ]
    brief = record["steps"][1]["output"]
    assert brief["focus_skills"][0]["skill_id"] in {
        g["skill_id"] for g in record["steps"][0]["output"]["gaps"]
    }
    assert brief["disclaimer"]
    prompt_text = " ".join(c.request.messages[0].content for c in fake_llm.calls)
    assert "James Miller" not in prompt_text  # pseudonymised for every agent


def test_manager_cannot_reach_non_report(client: TestClient, token: Any) -> None:
    record = run(
        client, token("michael"), capability="coaching.manager_brief", subject_employee_id="emp-7310"
    )
    assert record["status"] == "failed"
    assert record["steps"][0]["status"] == "denied"
    assert record["steps"][0]["error"]["code"] == "forbidden"


def test_talent_scoring_requires_human_review(client: TestClient, token: Any) -> None:
    rubric_before = [dict(r) for r in data.TALENT_ASSESSMENTS["promo-robert"]["rubric"]]
    record = run(
        client, token("priya"), capability="talent.recommend_scores", args={"assessment_id": "promo-robert"}
    )
    assert record["status"] == "awaiting_approval", record
    step = record["steps"][0]
    output = step["output"]
    assert output["blind"] is True and len(output["recommendations"]) == 2
    assert "ready" not in str(output).lower().replace("already", "")  # no readiness band anywhere
    approval = step["approval"]
    assert approval["mode"] == "per_item_review" and {i["item_id"] for i in approval["items"]} == {
        "row-cloud",
        "row-influence",
    }

    pending = client.get("/v1/orchestrator/approvals", headers=auth(token("priya"))).json()
    assert [p["execution_id"] for p in pending] == [record["execution_id"]]
    decision_url = f"{URL}/{record['execution_id']}/approvals/{approval['approval_id']}/decision"
    decision = {
        "decision": "approve",
        "items": [
            {"item_id": "row-cloud", "decision": "accepted"},
            {
                "item_id": "row-influence",
                "decision": "overridden",
                "value": 3,
                "comment": "limited exec exposure",
            },
        ],
    }
    assert client.post(decision_url, headers=auth(token("james")), json=decision).status_code == 403
    done = client.post(decision_url, headers=auth(token("priya")), json=decision)
    assert done.status_code == 200, done.text
    result = done.json()
    assert result["status"] == "succeeded"
    reviewed = result["steps"][0]["approval"]
    assert reviewed["status"] == "modified"
    plan = {c["path"]: c for c in reviewed["commit_plan"]}
    influence = plan["/talent/assessments/promo-robert/rubric/row-influence"]
    # No assessed influence level is demonstrated, so the AI gave no score: the value is the assessor's.
    assert influence["body"]["score"] == 3 and influence["body"]["score_source"] == "human"
    cloud = plan["/talent/assessments/promo-robert/rubric/row-cloud"]
    assert cloud["body"]["score"] == 4 and cloud["body"]["score_source"] == "ai_accepted"
    assert influence["endpoint_id"] == "BE-063" and influence["endpoint_status"] == "mocked"
    # The orchestrator did not write anything: the official rubric is unchanged.
    assert data.TALENT_ASSESSMENTS["promo-robert"]["rubric"] == rubric_before


def test_employee_cannot_request_talent_scoring(client: TestClient, token: Any) -> None:
    record = run(
        client, token("james"), capability="talent.recommend_scores", args={"assessment_id": "promo-robert"}
    )
    assert record["steps"][0]["status"] == "denied" and record["status"] == "failed"


def test_execution_visibility_and_listing(client: TestClient, token: Any) -> None:
    record = run(client, token("james"), capability="dev_plan.explain_gaps")
    own = client.get(f"{URL}/{record['execution_id']}", headers=auth(token("james")))
    assert own.status_code == 200 and own.json()["events"][0]["type"] == "created"
    assert client.get(f"{URL}/{record['execution_id']}", headers=auth(token("michael"))).status_code == 404
    listed = client.get(URL, headers=auth(token("james"))).json()["items"]
    assert [r["execution_id"] for r in listed] == [record["execution_id"]]


def test_clarification_is_returned_not_guessed(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    fake_llm.queue.append({"steps": [], "clarification": "What would you like to know?"})
    record = run(client, token("james"), message="hmm")
    assert record["status"] == "needs_clarification"
    assert record["clarification"] == "What would you like to know?" and record["steps"] == []


def test_request_validation(client: TestClient, token: Any) -> None:
    response = client.post(URL, headers=auth(token("james")), json={"allow_handoffs": True})
    assert response.status_code == 400 and response.json()["error"]["code"] == "invalid_request"
