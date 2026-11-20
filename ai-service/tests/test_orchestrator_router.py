"""Agent routing: explicit, LLM (validated), keyword fallback, clarification."""

from __future__ import annotations

from typing import Any

from cfp_ai.container import Container
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.llm.types import ProviderRefusal, ProviderUnavailable
from cfp_ai.orchestrator.models import OrchestrationRequest
from tests.conftest import make_principal

JAMES = make_principal("james")
MICHAEL = make_principal("michael")
PRIYA = make_principal("priya")


def offered_ids(container: Container, principal: Any) -> list[str]:
    return [s.capability for s in container.router.offered(principal)]


def test_only_capabilities_the_principal_can_use_are_offered(container: Container) -> None:
    # Interactive coaching (conversations, role-play, evaluation) is never offered: it has its own endpoints.
    assert offered_ids(container, JAMES) == [
        "coaching.recommend_scenarios",
        "dev_plan.draft_plan",
        "dev_plan.explain_gaps",
        "dev_plan.recommend_learning",
        "dev_plan.review_plan",
    ]
    assert set(offered_ids(container, MICHAEL)) == {
        "coaching.manager_brief",
        "coaching.recommend_scenarios",
        "dev_plan.draft_plan",
        "dev_plan.explain_gaps",
        "dev_plan.recommend_learning",
        "dev_plan.review_plan",
        "talent.draft_report",  # for direct reports' promotion/development assessments
    }
    assert set(offered_ids(container, PRIYA)) == {
        "coaching.recommend_scenarios",
        "dev_plan.draft_plan",
        "dev_plan.explain_gaps",
        "dev_plan.recommend_learning",
        "dev_plan.review_plan",
        "talent.draft_items",
        "talent.draft_report",
        "talent.recommend_scores",
    }


async def test_explicit_capability_skips_the_model(container: Container, fake_llm: FakeLlmProvider) -> None:
    plan = await container.router.plan(JAMES, OrchestrationRequest(capability="dev_plan.explain_gaps"))
    assert plan.method == "explicit"
    assert plan.steps[0].subject_employee_id == "emp-8721"  # defaults to self
    assert fake_llm.calls == []


async def test_llm_routing_maps_symbolic_subjects(container: Container, fake_llm: FakeLlmProvider) -> None:
    fake_llm.queue.append(
        {
            "steps": [
                {"capability": "dev_plan.explain_gaps", "subject": "requested", "rationale": "gaps"},
                {
                    "capability": "coaching.manager_brief",
                    "subject": "requested",
                    "rationale": "brief",
                    "depends_on_previous": True,
                    "only_if_previous_has": "gaps",
                },
            ]
        }
    )
    plan = await container.router.plan(
        MICHAEL,
        OrchestrationRequest(
            message="Explain James's gaps and help me coach him", subject_employee_id="emp-8721"
        ),
    )
    assert plan.method == "llm"
    assert [(s.capability, s.subject_employee_id) for s in plan.steps] == [
        ("dev_plan.explain_gaps", "emp-8721"),
        ("coaching.manager_brief", "emp-8721"),
    ]
    assert plan.steps[1].depends_on_previous and plan.steps[1].condition_field == "gaps"
    prompt = fake_llm.calls[0].request.messages[0].content
    assert "talent.recommend_scores" not in prompt  # never offered to a line manager


async def test_invalid_routing_is_repaired(container: Container, fake_llm: FakeLlmProvider) -> None:
    fake_llm.queue.extend(
        [
            {
                "steps": [
                    {"capability": "talent.recommend_scores", "subject": "none"},
                    {"capability": "dev_plan.explain_gaps", "subject": "requested"},
                ]
            },
            {"steps": [{"capability": "dev_plan.explain_gaps", "subject": "self"}]},
        ]
    )
    plan = await container.router.plan(JAMES, OrchestrationRequest(message="what are my gaps"))
    assert [s.capability for s in plan.steps] == ["dev_plan.explain_gaps"]
    repair = fake_llm.calls[1].request.messages[-1].content
    assert "unknown_id" in repair and "invalid_subject" in repair  # no invented subject when none selected


async def test_model_outage_falls_back_to_keywords(container: Container, fake_llm: FakeLlmProvider) -> None:
    fake_llm.queue.append(ProviderUnavailable("down"))
    plan = await container.router.plan(
        MICHAEL,
        OrchestrationRequest(
            message="prepare a brief for my 1:1 and show the skill gaps", subject_employee_id="emp-8721"
        ),
    )
    assert plan.method == "keyword_fallback"
    assert [s.capability for s in plan.steps] == ["coaching.manager_brief", "dev_plan.explain_gaps"]
    assert all(s.origin == "keyword_router" for s in plan.steps)


async def test_unclear_request_asks_for_clarification(
    container: Container, fake_llm: FakeLlmProvider
) -> None:
    fake_llm.queue.append({"steps": [], "clarification": "Which employee do you mean?"})
    plan = await container.router.plan(MICHAEL, OrchestrationRequest(message="help"))
    assert plan.steps == [] and plan.clarification == "Which employee do you mean?"


async def test_missing_required_args_ask_for_them(container: Container, fake_llm: FakeLlmProvider) -> None:
    fake_llm.queue.append({"steps": [{"capability": "talent.recommend_scores", "subject": "none"}]})
    plan = await container.router.plan(PRIYA, OrchestrationRequest(message="score the assessment"))
    assert plan.steps == []
    assert plan.clarification is not None and "assessment_id" in plan.clarification


async def test_refusal_returns_clarification(container: Container, fake_llm: FakeLlmProvider) -> None:
    fake_llm.queue.append(ProviderRefusal("cyber"))
    plan = await container.router.plan(JAMES, OrchestrationRequest(message="something unsafe"))
    assert plan.steps == [] and plan.clarification == "I can't help with that request."


async def test_nobody_without_capabilities_gets_clarification(container: Container) -> None:
    alex = make_principal("alex")  # platform admin: no tenant AI capabilities
    plan = await container.router.plan(alex, OrchestrationRequest(message="gaps"))
    assert plan.steps == [] and plan.clarification is not None
