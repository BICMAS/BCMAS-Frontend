"""Collaborative multi-agent workflows: successful execution, checkpoints, partial failures, retries,
recovery (including after a restart), duplicate prevention, audit trails, authorisation and observability."""

from __future__ import annotations

import asyncio
import copy
from collections.abc import Iterator
from dataclasses import replace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from cfp_ai.api.app import create_app
from cfp_ai.container import Container, build_container, fake_responders
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.mock import data
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.workflows.engine import StageContext, StageResult
from tests.conftest import auth, make_principal, make_settings

W = "/v1/workflows"
A = {"type": "assessment_to_development", "assessment_id": "dev-james"}


@pytest.fixture
def wf_container(tmp_path: Any) -> Container:
    return build_container(
        make_settings(workflow_retry_backoff_s=0, workflow_store_path=str(tmp_path / "wf.db")),
        providers={"fake": FakeLlmProvider(responders=fake_responders())},
    )


@pytest.fixture
def wf(wf_container: Container) -> Iterator[TestClient]:
    with TestClient(create_app(container=wf_container)) as client:
        yield client


def h(container: Container, persona: str) -> dict[str, str]:
    return auth(container.verifier.mint(data.PERSONAS[persona]))  # type: ignore[attr-defined]


def stages(record: dict[str, Any]) -> dict[str, str]:
    return {s["key"]: s["status"] for s in record["stages"]}


def event_types(record: dict[str, Any]) -> list[str]:
    return [e["type"] for e in record["events"]]


def review_all(client: TestClient, c: Container, record: dict[str, Any], **override: dict[str, Any]) -> Any:
    sid = record["data"]["scoring"]["scoring_set_id"]
    view = client.get(f"/v1/talent/scoring-sets/{sid}", headers=h(c, "priya")).json()
    items = []
    for rec in view["evaluation"]["recommendations"]:
        item = {"item_id": rec["rubric_row_id"], "decision": "accepted"}
        item.update(override.get(rec["rubric_row_id"], {}))
        items.append(item)
    return client.post(
        f"/v1/talent/scoring-sets/{sid}/reviews",
        headers=h(c, "priya"),
        json={"decision": "approve", "items": items},
    )


def run_a_to_plan_approval(client: TestClient, c: Container) -> dict[str, Any]:
    started = client.post(W, headers=h(c, "james"), json=A).json()
    client.post(f"{W}/{started['workflow_id']}/advance", headers=h(c, "priya"))
    record = client.get(f"{W}/{started['workflow_id']}", headers=h(c, "priya")).json()
    assert review_all(client, c, record).status_code == 200
    return client.get(f"{W}/{started['workflow_id']}", headers=h(c, "priya")).json()


def flaky(
    c: Container, workflow: str, stage: str, failures: int, code: str = "upstream_unavailable"
) -> dict[str, int]:
    """Make one stage fail ``failures`` times with ``code`` before running normally."""
    service = c.workflows
    definition = service._definitions[workflow]
    calls = {"n": 0}
    stage_defs = []
    for s in definition.stages:
        if s.key == stage:
            original = s.run

            async def run(ctx: StageContext, _original: Any = original) -> StageResult:
                calls["n"] += 1
                if calls["n"] <= failures:
                    raise AppError(code)  # type: ignore[arg-type]
                result: StageResult = await _original(ctx)
                return result

            s = replace(s, run=run)
        stage_defs.append(s)
    service._definitions[workflow] = replace(definition, stages=tuple(stage_defs))
    return calls


# ── Workflow A: capability assessment → development ──────────────────────────


def test_workflow_a_end_to_end(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    started = wf.post(W, headers=h(c, "james"), json=A)
    assert started.status_code == 201
    record = started.json()
    wid = record["workflow_id"]
    # 1. The employee initiates; conducting the assessment needs an HR assessor.
    assert record["status"] == "awaiting_input" and record["awaiting"]["actor"] == "assessor"
    assert stages(record)["initiate"] == "succeeded" and stages(record)["conduct"] == "awaiting"
    # 2-3. The assessor advances: the Talent agent evaluates against the rubrics, then waits for review.
    record = wf.post(f"{W}/{wid}/advance", headers=h(c, "priya")).json()
    assert stages(record)["evaluate"] == "succeeded"
    assert record["awaiting"]["ref_type"] == "scoring_set" and record["awaiting"]["actor"] == "assessor"
    # Assessor review auto-advances the workflow: gaps → IDP (Training Plan Agent) → waits for the manager.
    review = review_all(wf, c, record)
    assert (
        review.json()["follow_ups"] == [] and review.json()["suggestions"] == []
    )  # the workflow sequences agents
    record = wf.get(f"{W}/{wid}", headers=h(c, "michael")).json()
    assert [g["skill_id"] for g in record["data"]["gaps"]] == ["skl-influence", "skl-microservices"]
    draft_id = record["data"]["plan_draft_id"]
    assert record["awaiting"] == {
        "stage": "plan_approval",
        "actor": "manager_or_hr",
        "action": "Review and approve the development plan",
        "ref_type": "draft",
        "ref_id": draft_id,
    }
    plan = wf.get(f"/v1/drafts/{draft_id}", headers=h(c, "michael")).json()["draft"]["payload"]
    influence = next(g for g in plan["goals"] if g["skill_id"] == "skl-influence")
    assert (
        influence["current_level"] == 3 and influence["current_level_source"] == "verified"
    )  # verified wins
    assert any(
        e["source"] == "assessment" and e["skill_id"] == "skl-influence" for e in plan["evidence_basis"]
    )
    # 6. The employee cannot approve their own plan; the manager does, which auto-advances.
    assert (
        wf.post(
            f"/v1/drafts/{draft_id}/resolution", headers=h(c, "james"), json={"decision": "accepted"}
        ).status_code
        == 403
    )
    assert (
        wf.post(
            f"/v1/drafts/{draft_id}/resolution", headers=h(c, "michael"), json={"decision": "accepted"}
        ).status_code
        == 200
    )
    record = wf.get(f"{W}/{wid}", headers=h(c, "james")).json()
    assert stages(record)["plan_approval"] == "succeeded" and record["awaiting"]["actor"] == "subject"
    # 7. Coaching is the employee's own: they start it; the Coaching agent opens a development conversation.
    record = wf.post(f"{W}/{wid}/advance", headers=h(c, "james")).json()
    assert record["status"] == "completed" and all(s == "succeeded" for s in stages(record).values())
    coaching = record["stages"][-1]["output"]
    assert coaching["scenarios"] and coaching["conversation_id"]
    conversation = asyncio.run(
        c.coaching.get_conversation(make_principal("james"), coaching["conversation_id"])
    )
    assert conversation.mode == "performance"
    # Audit trail: every stage transition and checkpoint, with pseudonymised actors.
    types = event_types(record)
    assert types[0] == "started" and types[-1] == "workflow_completed"
    assert types.count("checkpoint_waiting") >= 3 and "stage_failed" not in types
    assert all(e["actor_hash"] and "james" not in e["actor_hash"] for e in record["events"])
    # Only one plan draft and one evaluation were created (no duplicate actions).
    drafts = asyncio.run(c.drafts.list(make_principal("priya"), subject_employee_id="emp-8721"))
    assert [d.draft.draft_id for d in drafts if d.draft.kind == "development_plan"] == [draft_id]


def test_workflow_a_waits_for_submitted_responses(
    wf: TestClient, wf_container: Container, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = wf_container
    pending = copy.deepcopy(data.TALENT_ASSESSMENTS["dev-james"])
    pending["status"] = "in_progress"
    monkeypatch.setitem(data.TALENT_ASSESSMENTS, "dev-james", pending)
    wid = wf.post(W, headers=h(c, "james"), json=A).json()["workflow_id"]
    record = wf.post(f"{W}/{wid}/advance", headers=h(c, "priya")).json()
    assert record["awaiting"]["actor"] == "subject" and "submit" in record["awaiting"]["action"].lower()
    pending["status"] = "submitted"
    record = wf.post(f"{W}/{wid}/advance", headers=h(c, "priya")).json()
    assert stages(record)["conduct"] == "succeeded" and stages(record)["evaluate"] == "succeeded"


def test_rejected_scores_end_the_workflow_without_development_actions(
    wf: TestClient, wf_container: Container
) -> None:
    c = wf_container
    wid = wf.post(W, headers=h(c, "james"), json=A).json()["workflow_id"]
    record = wf.post(f"{W}/{wid}/advance", headers=h(c, "priya")).json()
    sid = record["data"]["scoring"]["scoring_set_id"]
    wf.post(
        f"/v1/talent/scoring-sets/{sid}/reviews",
        headers=h(c, "priya"),
        json={"decision": "reject", "comment": "Incomplete"},
    )
    record = wf.get(f"{W}/{wid}", headers=h(c, "james")).json()
    assert record["status"] == "completed" and record["outcome"] == "assessment_rejected"
    assert {
        k: v for k, v in stages(record).items() if k in ("generate_idp", "plan_approval", "start_coaching")
    } == {"generate_idp": "skipped", "plan_approval": "skipped", "start_coaching": "skipped"}


def test_no_gaps_completes_without_a_plan(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    wid = wf.post(W, headers=h(c, "james"), json=A).json()["workflow_id"]
    record = wf.post(f"{W}/{wid}/advance", headers=h(c, "priya")).json()
    override = {
        "row-inf": {"decision": "overridden", "value": 5, "comment": "Board-level evidence on file."},
        "row-ms": {"decision": "overridden", "value": 4, "comment": "Observed failure handling design."},
    }
    review_all(wf, c, record, **override)
    record = wf.get(f"{W}/{wid}", headers=h(c, "james")).json()
    assert record["outcome"] == "no_development_needs" and stages(record)["generate_idp"] == "skipped"


def test_rejected_plan_fails_and_recovers_by_regenerating(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    record = run_a_to_plan_approval(wf, c)
    wid, first = record["workflow_id"], record["data"]["plan_draft_id"]
    wf.post(
        f"/v1/drafts/{first}/resolution",
        headers=h(c, "michael"),
        json={"decision": "rejected", "reason": "Too broad"},
    )
    record = wf.get(f"{W}/{wid}", headers=h(c, "michael")).json()
    assert record["status"] == "failed"
    failed = next(s for s in record["stages"] if s["key"] == "plan_approval")
    assert failed["error"]["code"] == "plan_rejected" and failed["error"]["retry_from"] == "generate_idp"
    assert (
        wf.post(f"{W}/{wid}/advance", headers=h(c, "michael")).json()["status"] == "failed"
    )  # no silent re-run
    record = wf.post(f"{W}/{wid}/retry", headers=h(c, "michael")).json()
    second = record["data"]["plan_draft_id"]
    assert second != first and record["awaiting"]["ref_id"] == second
    assert "retry_requested" in event_types(record)


# ── Workflow B: personal development ─────────────────────────────────────────


def test_workflow_b_end_to_end(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    record = wf.post(
        W, headers=h(c, "james"), json={"type": "personal_development", "objectives": ["Lead API standards"]}
    ).json()
    s = stages(record)
    assert [
        s[k] for k in ("profile", "objectives", "analyse_gaps", "recommend_learning", "generate_plan")
    ] == ["succeeded"] * 5
    assert record["data"]["profile"]["role_id"] == "role-ssa" and "name" not in record["data"]["profile"]
    assert "Lead API standards" in record["data"]["objectives"]["objectives"]
    draft_id = record["data"]["plan_draft_id"]
    wf.post(f"/v1/drafts/{draft_id}/resolution", headers=h(c, "michael"), json={"decision": "accepted"})
    record = wf.post(f"{W}/{record['workflow_id']}/advance", headers=h(c, "james")).json()
    activities = next(st for st in record["stages"] if st["key"] == "coaching_activities")["output"]
    assert activities["activity_suggestion_ids"]
    pending = c.suggestions.list_for_subject("org-gec", "emp-8721")
    assert {p.suggestion_id for p in pending} >= set(activities["activity_suggestion_ids"])
    assert record["awaiting"]["stage"] == "monitor_progress"  # waits for the plan to be committed
    ref = {"system": "backend", "resource_type": "development_plan", "resource_id": "plan-5501"}
    wf.post(f"/v1/drafts/{draft_id}/commit-report", headers=h(c, "michael"), json={"committed_ref": ref})
    record = wf.get(f"{W}/{record['workflow_id']}", headers=h(c, "james")).json()
    assert record["status"] == "completed"
    assert record["stages"][-1]["output"]["plan_id"] == "plan-5501"


def test_optional_stage_failure_is_tolerated(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    c.backend.faults["BE-040"] = "forbidden"  # type: ignore[attr-defined]
    record = wf.post(W, headers=h(c, "james"), json={"type": "personal_development"}).json()
    learning = next(s for s in record["stages"] if s["key"] == "recommend_learning")
    assert (
        learning["status"] == "failed"
        and learning["error"]["retryable"] is False
        and learning["attempts"] == 1
    )
    assert stages(record)["generate_plan"] == "succeeded"  # the workflow carried on
    draft_id = record["data"]["plan_draft_id"]
    wf.post(f"/v1/drafts/{draft_id}/resolution", headers=h(c, "michael"), json={"decision": "accepted"})
    wf.post(f"{W}/{record['workflow_id']}/advance", headers=h(c, "james"))
    ref = {"system": "backend", "resource_type": "development_plan", "resource_id": "plan-5501"}
    wf.post(f"/v1/drafts/{draft_id}/commit-report", headers=h(c, "michael"), json={"committed_ref": ref})
    record = wf.get(f"{W}/{record['workflow_id']}", headers=h(c, "james")).json()
    assert record["status"] == "completed_with_warnings"


# ── Workflow C: continuous development ───────────────────────────────────────


def test_workflow_c_end_to_end(
    wf: TestClient, wf_container: Container, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = wf_container
    learning = copy.deepcopy(data.LEARNING_RECORDS["emp-8721"])
    learning.append(
        {
            **learning[0],
            "id": "lr-new",
            "catalogue_item_id": "cat-influence-masterclass",
            "title": "Strategic Influence Masterclass",
            "skill_ids": ["skl-influence"],
            "status": "completed",
            "progress_pct": 100,
            "completed_at": "2026-11-15T00:00:00Z",
        }
    )
    monkeypatch.setitem(data.LEARNING_RECORDS, "emp-8721", learning)
    record = wf.post(W, headers=h(c, "james"), json={"type": "continuous_development"}).json()
    assert record["status"] == "completed", record
    s = stages(record)
    assert all(v == "succeeded" for v in s.values())
    reassess = record["data"]["reassessment"]
    influence = next(r for r in reassess if r["skill_id"] == "skl-influence")
    assert any("Strategic Influence Masterclass" in reason for reason in influence["reasons"])
    assert influence["suggested_methods"] == ["leadership"]
    update = record["stages"][-1]["output"]
    assert update["plan_id"] == "plan-5501" and update["trigger"] in (
        "assessment_reported",
        "learning_completed",
    )


def test_shared_context_respects_each_viewer(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    hr = wf.post(
        W, headers=h(c, "priya"), json={"type": "continuous_development", "subject_employee_id": "emp-8721"}
    ).json()
    coaching = next(s for s in hr["stages"] if s["key"] == "coaching_history")
    assert coaching["status"] == "skipped" and "private" in coaching["summary"]
    wf.post(f"{W}/{hr['workflow_id']}/cancel", headers=h(c, "priya"))
    manager = wf.post(
        W, headers=h(c, "michael"), json={"type": "continuous_development", "subject_employee_id": "emp-8721"}
    ).json()
    assert next(s for s in manager["stages"] if s["key"] == "coaching_history")["status"] == "succeeded"
    # No access without a relation: another employee, or another tenant.
    assert (
        wf.post(
            W,
            headers=h(c, "james"),
            json={"type": "continuous_development", "subject_employee_id": "emp-9042"},
        ).status_code
        == 403
    )
    assert wf.post(
        W, headers=h(c, "ama"), json={"type": "continuous_development", "subject_employee_id": "emp-8721"}
    ).status_code in (403, 404)
    assert wf.get(f"{W}/{manager['workflow_id']}", headers=h(c, "ama")).status_code == 404


# ── duplicate prevention ─────────────────────────────────────────────────────


def test_duplicate_starts_and_idempotency(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    first = wf.post(W, headers={**h(c, "james"), "Idempotency-Key": "k-1"}, json=A)
    again = wf.post(W, headers=h(c, "james"), json=A)  # same type and employee while active
    replay = wf.post(W, headers={**h(c, "james"), "Idempotency-Key": "k-1"}, json=A)
    assert first.status_code == 201 and again.status_code == 200 and replay.status_code == 200
    assert first.json()["workflow_id"] == again.json()["workflow_id"] == replay.json()["workflow_id"]
    assert "duplicate_start_prevented" in event_types(again.json())
    conflict = wf.post(
        W, headers={**h(c, "james"), "Idempotency-Key": "k-1"}, json={"type": "personal_development"}
    )
    assert conflict.status_code == 409
    # A cancelled workflow no longer blocks a new one.
    wf.post(f"{W}/{first.json()['workflow_id']}/cancel", headers=h(c, "james"))
    assert wf.post(W, headers=h(c, "james"), json=A).status_code == 201


async def test_concurrent_advances_run_each_stage_once(wf_container: Container) -> None:
    c = wf_container
    james, priya = make_principal("james"), make_principal("priya")
    from cfp_ai.workflows.models import StartWorkflowRequest

    record, _ = await c.workflows.start(james, StartWorkflowRequest(**A), "r0")  # type: ignore[arg-type]
    calls = flaky(c, "assessment_to_development", "evaluate", failures=0)
    await asyncio.gather(*(c.workflows.advance(priya, record.workflow_id, f"r{i}") for i in range(3)))
    assert calls["n"] == 1
    stored = await c.workflows.get(priya, record.workflow_id)
    assert stored.stage("evaluate").attempts == 1


# ── retries and recovery ─────────────────────────────────────────────────────


def test_transient_failures_are_retried(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    calls = flaky(c, "personal_development", "analyse_gaps", failures=2)
    record = wf.post(W, headers=h(c, "james"), json={"type": "personal_development"}).json()
    gaps = next(s for s in record["stages"] if s["key"] == "analyse_gaps")
    assert calls["n"] == 3 and gaps["status"] == "succeeded" and gaps["attempts"] == 3
    assert event_types(record).count("stage_retry_scheduled") == 2
    retries = c.metrics.registry.get_sample_value(
        "ai_workflow_retries_total", {"workflow": "personal_development", "stage": "analyse_gaps"}
    )
    assert retries == 2


def test_exhausted_retries_fail_and_recover_on_request(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    flaky(c, "personal_development", "analyse_gaps", failures=3)  # = retry_attempts
    record = wf.post(W, headers=h(c, "james"), json={"type": "personal_development"}).json()
    assert record["status"] == "failed"
    failed = next(s for s in record["stages"] if s["key"] == "analyse_gaps")
    assert failed["error"]["code"] == "upstream_unavailable" and failed["error"]["retryable"] is True
    assert stages(record)["generate_plan"] == "pending"  # nothing after the failure ran
    recovered = wf.post(f"{W}/{record['workflow_id']}/retry", headers=h(c, "james")).json()
    assert (
        stages(recovered)["analyse_gaps"] == "succeeded" and recovered["awaiting"]["stage"] == "plan_approval"
    )
    assert stages(recovered)["profile"] == "succeeded"  # completed stages were not re-run
    assert next(s for s in recovered["stages"] if s["key"] == "profile")["attempts"] == 1


def test_backend_outage_fails_then_recovers(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    c.backend.faults["BE-023"] = "upstream_error"  # type: ignore[attr-defined]  # role profiles
    record = wf.post(W, headers=h(c, "james"), json={"type": "personal_development"}).json()
    assert record["status"] == "failed" and stages(record)["profile"] == "failed"
    c.backend.faults.pop("BE-023")  # type: ignore[attr-defined]
    recovered = wf.post(f"{W}/{record['workflow_id']}/retry", headers=h(c, "james")).json()
    assert stages(recovered)["profile"] == "succeeded"


def test_state_survives_a_restart_and_interrupted_stages_resume(tmp_path: Any) -> None:
    path = str(tmp_path / "restart.db")
    settings = make_settings(workflow_retry_backoff_s=0, workflow_store_path=path)
    first = build_container(settings, providers={"fake": FakeLlmProvider(responders=fake_responders())})
    james = make_principal("james")
    from cfp_ai.workflows.models import StartWorkflowRequest

    service = first.workflows
    definition = service._definitions["continuous_development"]

    async def crash(ctx: StageContext) -> StageResult:
        raise asyncio.CancelledError  # the process dies mid-stage

    service._definitions["continuous_development"] = replace(
        definition,
        stages=tuple(replace(s, run=crash) if s.key == "remaining_gaps" else s for s in definition.stages),
    )
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(service.start(james, StartWorkflowRequest(type="continuous_development"), "r1"))
    first.workflow_store.close()  # type: ignore[attr-defined]

    second = build_container(settings, providers={"fake": FakeLlmProvider(responders=fake_responders())})
    [stored] = second.workflow_store.list_records("org-gec", subject_employee_id="emp-8721")
    assert stored.stage("remaining_gaps").status == "running"  # write-ahead state was persisted
    assert stored.stage("assessment_results").status == "succeeded"
    resumed = asyncio.run(second.workflows.advance(james, stored.workflow_id, "r2"))
    assert resumed.status == "completed"
    assert "stage_recovered" in [e.type for e in resumed.events]
    assert resumed.stage("assessment_results").attempts == 1  # not repeated


# ── visibility, cancellation, observability, erasure ─────────────────────────


def test_visibility_cancellation_and_audit_endpoint(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    wid = wf.post(W, headers=h(c, "james"), json=A).json()["workflow_id"]
    for persona, visible in (("james", True), ("michael", True), ("priya", True), ("ama", False)):
        assert (wf.get(f"{W}/{wid}", headers=h(c, persona)).status_code == 200) is visible
    assert [
        r["workflow_id"]
        for r in wf.get(W, headers=h(c, "michael"), params={"subject_employee_id": "emp-8721"}).json()
    ] == [wid]
    trail = wf.get(f"{W}/{wid}/events", headers=h(c, "james")).json()
    assert trail[0]["type"] == "started" and all(e["at"] for e in trail)
    cancelled = wf.post(f"{W}/{wid}/cancel", headers=h(c, "michael")).json()
    assert cancelled["status"] == "cancelled"
    assert wf.post(f"{W}/{wid}/advance", headers=h(c, "priya")).json()["status"] == "cancelled"
    assert wf.post(f"{W}/{wid}/cancel", headers=h(c, "james")).status_code == 409


def test_definitions_and_metrics(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    defs = {d["type"]: d for d in wf.get(f"{W}/definitions", headers=h(c, "james")).json()}
    assert [s["key"] for s in defs["assessment_to_development"]["stages"]] == [
        "initiate",
        "conduct",
        "evaluate",
        "assessor_review",
        "identify_gaps",
        "generate_idp",
        "plan_approval",
        "start_coaching",
    ]
    assert (
        len(defs["personal_development"]["stages"]) == 8
        and len(defs["continuous_development"]["stages"]) == 7
    )
    wf.post(W, headers=h(c, "james"), json={"type": "continuous_development"})
    sample = c.metrics.registry.get_sample_value
    assert sample("ai_workflows_total", {"workflow": "continuous_development", "status": "started"}) == 1
    assert sample("ai_workflows_total", {"workflow": "continuous_development", "status": "completed"}) == 1
    assert (
        sample(
            "ai_workflow_stages_total",
            {"workflow": "continuous_development", "stage": "remaining_gaps", "status": "succeeded"},
        )
        == 1
    )
    assert (
        sample(
            "ai_workflow_stage_duration_seconds_count",
            {"workflow": "continuous_development", "stage": "remaining_gaps"},
        )
        == 1
    )


def test_workflows_are_erased_with_the_employee(wf: TestClient, wf_container: Container) -> None:
    c = wf_container
    wf.post(W, headers=h(c, "james"), json={"type": "continuous_development"})
    assert c.workflows.erase_subject("org-gec", "emp-8721") == 1
    assert wf.get(W, headers=h(c, "james")).json() == []
