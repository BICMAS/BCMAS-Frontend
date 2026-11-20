"""Evaluation gates (docs/ai/QA_REPORT.md §5).

* Offline suites: every metric of ``cfp_ai.evals`` must meet its threshold.
* End-to-end quality: training-recommendation relevance and gap explainability measured
  through the public API on the mock backend.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from cfp_ai.evals import run_all
from cfp_ai.evals.runner import DATASETS, load
from cfp_ai.integrations.backend.mock import data
from tests.conftest import auth

MIN_CASES = {
    "gap_identification": 10,
    "scoring_rule": 10,
    "routing": 20,
    "coaching_safety": 15,
    "prompt_injection": 30,
    "decision_language": 15,
    "sensitive_memory": 10,
}


@pytest.mark.parametrize(("name", "minimum"), sorted(MIN_CASES.items()))
def test_datasets_are_large_enough_and_labelled(name: str, minimum: int) -> None:
    cases = load(DATASETS, name)
    assert len(cases) >= minimum
    assert len({c["id"] for c in cases}) == len(cases)  # unique ids


@pytest.mark.parametrize("result", run_all(), ids=lambda r: r.suite)
def test_offline_suite_meets_thresholds(result: Any) -> None:
    failed = [f"{m.name}={m.value} (threshold {m.threshold})" for m in result.metrics if not m.passed]
    assert not failed, f"{result.suite}: {failed}; misses: {result.failures}"


def _learning_state(employee_id: str) -> tuple[set[str], set[str]]:
    """(completed catalogue ids, inactive catalogue ids) from the mock source of truth."""
    completed = {
        r["catalogue_item_id"]
        for r in data.LEARNING_RECORDS.get(employee_id, [])
        if r["status"] == "completed" and r["catalogue_item_id"]
    }
    inactive = {cid for cid, c in data.CATALOGUE.items() if c["status"] != "active"}
    return completed, inactive


def test_training_recommendation_relevance(client: TestClient, token: Any) -> None:
    gaps = client.get("/v1/dev-plans/gaps/emp-8721", headers=auth(token("james"))).json()["gaps"]
    gap_skills = {g["skill_id"] for g in gaps}
    recs = client.get(
        "/v1/dev-plans/recommendations/learning", headers=auth(token("james")), params={"limit": 20}
    ).json()["recommendations"]
    assert recs
    completed, inactive = _learning_state("emp-8721")

    relevant = sum(r["skill_id"] in gap_skills for r in recs)
    assert relevant / len(recs) == 1.0  # precision: every item addresses an actual gap
    assert not {r["catalogue_item_id"] for r in recs} & (completed | inactive)  # never completed/retired
    for r in recs:  # explainable: a reason and a citation of the organisational resource
        assert r["fit_reason"]
        assert [c["source_id"] for c in r["citations"]] == [r["catalogue_item_id"]]

    # Coverage: every critical/high gap with an available organisational resource is addressed.
    available = {
        sid for cid, c in data.CATALOGUE.items() if cid not in completed | inactive for sid in c["skill_ids"]
    }
    urgent = {g["skill_id"] for g in gaps if g["priority"] in ("critical", "high")} & available
    covered = {r["skill_id"] for r in recs}
    assert urgent <= covered

    # Ranking: larger gaps rank before smaller ones (ignoring the "continue" boost for in-progress items).
    gap_size = {g["skill_id"]: g["gap"] for g in gaps}
    fresh = [gap_size[r["skill_id"]] for r in recs if not r["fit_reason"].startswith("Continue")]
    assert fresh == sorted(fresh, reverse=True)


def test_gap_explanations_are_grounded(client: TestClient, token: Any) -> None:
    body = client.get("/v1/dev-plans/gaps/emp-8721", headers=auth(token("michael"))).json()
    assert body["gaps"]
    for gap in body["gaps"]:
        assert gap["why_it_matters"] and gap["priority_rationale"]
        assert gap["citations"], gap["skill_id"]
        assert gap["gap"] == gap["required_level"] - (gap["verified_level"] or 0)
