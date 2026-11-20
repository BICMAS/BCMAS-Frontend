"""AI Coaching Agent: all coaching modes, conversation and role-play workflows, privacy and authorisation."""

from __future__ import annotations

import itertools
import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from cfp_ai.agents.coaching.modes import MODES
from cfp_ai.api.app import create_app
from cfp_ai.container import Container, build_container
from cfp_ai.integrations.backend.mock.data import PERSONAS
from cfp_ai.llm.providers.fake_provider import FakeLlmProvider
from cfp_ai.security.injection import UNTRUSTED_INPUT_POLICY
from tests.conftest import auth, make_settings

CONVERSATION_MODES = [
    "career",
    "leadership",
    "performance",
    "behavioural",
    "technical_skills",
    "communication",
    "situational",
]
SCENARIO = "sc_01JDSEED000000000000000001"  # Data Retention Briefing with the CPO
_counter = {"n": 0}


def cid() -> str:
    _counter["n"] += 1
    return f"client-msg-{_counter['n']:06d}"


def start(client: TestClient, token: str, mode: str, **extra: Any) -> dict[str, Any]:
    response = client.post("/v1/coaching/conversations", headers=auth(token), json={"mode": mode, **extra})
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return body


def say(client: TestClient, token: str, conversation_id: str, text: str, client_id: str | None = None) -> Any:
    return client.post(
        f"/v1/coaching/conversations/{conversation_id}/messages",
        headers=auth(token),
        json={"text": text, "client_message_id": client_id or cid()},
    )


def facts_of(fake: FakeLlmProvider, route: str, index: int = -1) -> dict[str, Any]:
    call = [c for c in fake.calls if c.route_id == route][index]
    for message in call.request.messages:
        if "<input_json>" in message.content:
            parsed: dict[str, Any] = json.loads(
                message.content.split("<input_json>\n", 1)[1].split("\n</input_json>")[0]
            )
            return parsed
    return {}


# ════════════════════════════════════════════════════════════════════════════
# Coaching modes
# ════════════════════════════════════════════════════════════════════════════


def test_mode_catalogue_lists_all_eight_modes(client: TestClient, token: Any) -> None:
    modes = client.get("/v1/coaching/modes", headers=auth(token("james"))).json()
    assert [m["mode"] for m in modes] == [*CONVERSATION_MODES, "role_play"]
    assert {m["interaction"] for m in modes} == {"conversation", "role_play"}
    assert all(m["method"] for m in modes)


@pytest.mark.parametrize("mode", CONVERSATION_MODES)
def test_conversation_mode_full_workflow(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider, mode: str
) -> None:
    james = token("james")
    conversation = start(client, james, mode, topic="Growing in my role")
    assert conversation["mode"] == mode and conversation["status"] == "active"
    assert conversation["messages"][0]["role"] == "coach"
    assert conversation["messages"][0]["text"] == MODES[mode].opening  # deterministic opening, no model call
    assert fake_llm.calls == []

    turn = say(
        client, james, conversation["conversation_id"], "I want to get better at presenting technical ideas."
    )
    assert turn.status_code == 200, turn.text
    result = turn.json()
    coaching = result["coaching"]
    # The coach guides: every turn carries one reflective question that appears in the message.
    assert coaching["reflective_question"].endswith("?")
    assert coaching["reflective_question"] in result["assistant_message"]["text"]
    assert coaching["stage"] in {"goal", "reality", "options", "way_forward", "review"}
    call = next(c for c in fake_llm.calls if c.route_id == "coaching.conversation_turn")
    assert call.request.system_blocks[0] == UNTRUSTED_INPUT_POLICY  # every model call starts with the policy
    assert call.request.system_blocks[2] == MODES[mode].guidance  # mode-specific coaching method
    assert facts_of(fake_llm, "coaching.conversation_turn")["method"] == MODES[mode].method

    summary = client.post(
        f"/v1/coaching/conversations/{conversation['conversation_id']}/end", headers=auth(james)
    )
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["mode"] == mode and body["agreed_actions"] and body["reflective_questions"]
    assert body["provenance"]["prompt_version"] == "coaching.summarise@v1"
    assert body["disclaimer"]
    again = client.get(
        f"/v1/coaching/conversations/{conversation['conversation_id']}/summary", headers=auth(james)
    )
    assert again.json()["created_at"] == body["created_at"]
    assert say(client, james, conversation["conversation_id"], "one more").status_code == 409  # ended


@pytest.mark.parametrize(
    ("mode", "category"),
    [("technical_skills", "technical"), ("leadership", "behavioural"), ("communication", "behavioural")],
)
def test_mode_scopes_skills_to_its_focus(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider, mode: str, category: str
) -> None:
    from cfp_ai.integrations.backend.mock.data import ROLE_PROFILES

    james = token("james")
    conversation = start(client, james, mode)
    say(client, james, conversation["conversation_id"], "Let's start.")
    allowed = set(facts_of(fake_llm, "coaching.conversation_turn")["allowed_skill_ids"])
    expected = {r["skill_id"] for r in ROLE_PROFILES["role-ssa"]["requirements"] if r["category"] == category}
    assert allowed == expected


def test_focus_skills_are_validated_against_the_role(client: TestClient, token: Any) -> None:
    james = token("james")
    bad = client.post(
        "/v1/coaching/conversations",
        headers=auth(james),
        json={"mode": "technical_skills", "focus_skill_ids": ["skl-influence"]},
    )  # behavioural skill
    assert bad.status_code == 400
    ok = start(client, james, "technical_skills", focus_skill_ids=["skl-api-gov"])
    assert ok["focus_skills"][0]["skill_id"] == "skl-api-gov" and ok["focus_skills"][0]["target_level"] == 4
    assert ok["messages"][0]["text"].startswith("We'll focus on API Governance.")


def test_situational_coaching_can_suggest_a_rehearsal(client: TestClient, token: Any) -> None:
    james = token("james")
    conversation = start(client, james, "situational")
    result = say(
        client, james, conversation["conversation_id"], "I have a tough CPO meeting on Friday."
    ).json()
    action = result["suggested_actions"][0]
    assert action["type"] == "open_scenario" and action["ref_id"].startswith("sc_")


# ════════════════════════════════════════════════════════════════════════════
# Guide, don't lecture — structural enforcement
# ════════════════════════════════════════════════════════════════════════════


def test_lecturing_and_invented_references_are_repaired(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    james = token("james")
    conversation = start(client, james, "performance")
    fake_llm.queue.extend(
        [
            {
                "message": (
                    "Here is what to do:\n- Read the standard\n- Write a policy\n- Present it\n- Get sign-off"
                ),
                "reflective_question": "Do this now.",
                "coaching_move": "suggest_action",
                "stage": "way_forward",
                "suggested_actions": [{"type": "view_learning", "label": "Course", "ref_id": "cat-invented"}],
            },
            {
                "message": "What would progress look like for you this month?",
                "reflective_question": "What would progress look like for you this month?",
                "coaching_move": "question",
                "stage": "goal",
            },
        ]
    )
    result = say(
        client, james, conversation["conversation_id"], "Tell me what to do about my API gap."
    ).json()
    assert result["coaching"]["coaching_move"] == "question"
    repair = (
        [c for c in fake_llm.calls if c.route_id == "coaching.conversation_turn"][1]
        .request.messages[-1]
        .content
    )
    assert "not_a_question" in repair and "lecturing" in repair and "unknown_id" in repair


def test_conversation_history_is_sent_with_strict_alternation(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    james = token("james")
    conversation = start(client, james, "career")
    for text in ("I want to lead a platform team.", "Probably in two years."):
        say(client, james, conversation["conversation_id"], text)
    messages = [c for c in fake_llm.calls if c.route_id == "coaching.conversation_turn"][-1].request.messages
    roles = [m.role for m in messages]
    assert roles[-1] == "user" and all(a != b for a, b in itertools.pairwise(roles))
    assert messages[-1].content.endswith("Probably in two years.")


def test_turns_are_idempotent_and_capped(token: Any) -> None:
    fake = FakeLlmProvider(responders=__import__("cfp_ai.container", fromlist=["x"]).fake_responders())
    container = build_container(make_settings(coaching_max_conversation_turns=2), providers={"fake": fake})
    with TestClient(create_app(container=container)) as client:
        james = container.verifier.mint(PERSONAS["james"])  # type: ignore[attr-defined]
        conversation = start(client, james, "career")
        first = say(client, james, conversation["conversation_id"], "Hello", client_id="retry-me-0001").json()
        again = say(client, james, conversation["conversation_id"], "Hello", client_id="retry-me-0001").json()
        assert first == again and len(fake.calls) == 1
        assert first["turns_remaining"] == 1
        say(client, james, conversation["conversation_id"], "Second")
        assert say(client, james, conversation["conversation_id"], "Third").status_code == 409


# ════════════════════════════════════════════════════════════════════════════
# Safety
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize(
    ("text", "flag"),
    [
        ("Honestly some days I want to hurt myself.", "wellbeing_concern"),
        ("My manager has been bullying me in meetings.", "formal_complaint"),
    ],
)
def test_wellbeing_guard_redirects_without_the_model(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider, text: str, flag: str
) -> None:
    james = token("james")
    conversation = start(client, james, "career")
    result = say(client, james, conversation["conversation_id"], text).json()
    assert result["coaching"]["safety_flag"] == flag
    assert fake_llm.calls == []  # no model call for crisis or complaint messages
    assert (
        "beyond what I can help" in result["assistant_message"]["text"]
        or "HR" in result["assistant_message"]["text"]
    )
    # Flagged messages are excluded from summaries and memory: nothing else to summarise.
    end = client.post(
        f"/v1/coaching/conversations/{conversation['conversation_id']}/end", headers=auth(james)
    )
    assert end.status_code == 412


def test_model_detected_concern_is_replaced_by_safe_response(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    james = token("james")
    conversation = start(client, james, "performance")
    fake_llm.queue.append(
        {
            "message": "I hear you. What support would help?",
            "coaching_move": "reflect",
            "reflective_question": "What support would help?",
            "stage": "reality",
            "safety_flag": "wellbeing_concern",
        }
    )
    result = say(client, james, conversation["conversation_id"], "Everything feels too much lately.").json()
    assert result["coaching"]["safety_flag"] == "wellbeing_concern"
    assert "employee assistance" in result["assistant_message"]["text"]
    assert result["suggested_actions"] == []


# ════════════════════════════════════════════════════════════════════════════
# Summaries, learning interventions, memory (privacy controls)
# ════════════════════════════════════════════════════════════════════════════


def test_summary_recommends_only_real_catalogue_items(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    james = token("james")
    conversation = start(client, james, "technical_skills", focus_skill_ids=["skl-api-gov"])
    say(client, james, conversation["conversation_id"], "I want to own our API standards.")
    fake_llm.queue.extend(
        [
            {
                "summary": "s",
                "learning_recommendations": [{"catalogue_item_id": "cat-made-up", "reason": "r"}],
                "memory_facts": [{"kind": "theme", "text": "Mentioned a health issue affecting focus"}],
            },
            {
                "summary": "You explored API standards.",
                "learning_recommendations": [
                    {"catalogue_item_id": "cat-api-gov-2024", "reason": "Targets level 4."}
                ],
                "development_opportunities": [
                    {"skill_id": "skl-api-gov", "description": "Own the standard."}
                ],
                "memory_facts": [{"kind": "goal", "text": "Wants to own API standards for the team"}],
            },
        ]
    )
    summary = client.post(
        f"/v1/coaching/conversations/{conversation['conversation_id']}/end", headers=auth(james)
    ).json()
    repair = [c for c in fake_llm.calls if c.route_id == "coaching.summarise"][1].request.messages[-1].content
    assert "unknown_id" in repair and "sensitive_memory" in repair
    assert summary["learning_recommendations"][0] == {
        "catalogue_item_id": "cat-api-gov-2024",
        "title": "Advanced API Governance & Ethics 2024",
        "kind": "e_learning",
        "reason": "Targets level 4.",
    }
    assert summary["development_opportunities"][0]["skill_name"] == "API Governance"
    candidates = {i["id"] for i in facts_of(fake_llm, "coaching.summarise")["candidate_learning"]}
    assert "cat-ai-ethics" not in candidates  # retired items are never offered


def test_learner_memory_is_used_only_with_consent(
    client: TestClient, token: Any, fake_llm: FakeLlmProvider
) -> None:
    james = token("james")
    first = start(client, james, "career")
    say(client, james, first["conversation_id"], "I like learning from real examples.")
    summary = client.post(
        f"/v1/coaching/conversations/{first['conversation_id']}/end", headers=auth(james)
    ).json()
    assert summary["memory_facts_saved"] == 1
    memory = client.get("/v1/me/learner-memory", headers=auth(james)).json()
    assert memory[0]["source_session_id"] == first["conversation_id"]

    with_memory = start(client, james, "performance")
    say(client, james, with_memory["conversation_id"], "Next goal.")
    assert facts_of(fake_llm, "coaching.conversation_turn")["learner_memory"] == [memory[0]["text"]]
    assert facts_of(fake_llm, "coaching.conversation_turn")["coaching_history"][0]["kind"] == "conversation"

    private = start(client, james, "performance", use_memory=False)
    say(client, james, private["conversation_id"], "Something private.")
    assert facts_of(fake_llm, "coaching.conversation_turn")["learner_memory"] == []
    private_summary = client.post(
        f"/v1/coaching/conversations/{private['conversation_id']}/end", headers=auth(james)
    ).json()
    assert private_summary["memory_facts_saved"] == 0

    assert (
        client.delete(f"/v1/me/learner-memory/{memory[0]['fact_id']}", headers=auth(james)).status_code == 204
    )
    assert client.get("/v1/me/learner-memory", headers=auth(james)).json() == []


def test_deleting_a_conversation_erases_transcript_and_derived_memory(client: TestClient, token: Any) -> None:
    james = token("james")
    conversation = start(client, james, "career")
    say(client, james, conversation["conversation_id"], "I want to lead.")
    client.post(f"/v1/coaching/conversations/{conversation['conversation_id']}/end", headers=auth(james))
    assert client.get("/v1/me/learner-memory", headers=auth(james)).json()
    assert (
        client.delete(
            f"/v1/coaching/conversations/{conversation['conversation_id']}", headers=auth(james)
        ).status_code
        == 204
    )
    assert (
        client.get(
            f"/v1/coaching/conversations/{conversation['conversation_id']}", headers=auth(james)
        ).status_code
        == 404
    )
    assert client.get("/v1/me/learner-memory", headers=auth(james)).json() == []


async def test_retention_purge_and_subject_erasure(container: Container) -> None:
    from cfp_ai.agents.coaching.models import StartConversationRequest
    from tests.conftest import make_principal

    james = make_principal("james")
    service = container.coaching
    old = await service.start_conversation(james, StartConversationRequest(mode="career"))
    fresh = await service.start_conversation(james, StartConversationRequest(mode="leadership"))
    state = container.coaching._store.conversation("org-gec", old.conversation_id)
    assert state is not None
    state.created_at = datetime.now(UTC) - timedelta(days=400)
    assert await service.purge_expired() == {"conversations": 1, "sessions": 0}
    assert [c.conversation_id for c in await service.list_conversations(james)] == [fresh.conversation_id]
    assert (await service.erase_employee("org-gec", "emp-8721"))["conversations"] == 1
    assert await service.list_conversations(james) == []


# ════════════════════════════════════════════════════════════════════════════
# Authorised information only
# ════════════════════════════════════════════════════════════════════════════


def test_coach_reads_only_the_callers_own_data(
    client: TestClient, token: Any, container: Container, fake_llm: FakeLlmProvider
) -> None:
    james = token("james")
    conversation = start(client, james, "performance")
    say(client, james, conversation["conversation_id"], "Help me with my goal.")
    backend: Any = container.backend
    assert {subject for _, subject in backend.calls} == {"user-james"}  # read as James, nobody else
    prompt = " ".join(m.content for c in fake_llm.calls for m in c.request.messages)
    assert "James Miller" not in prompt and "Robert Chen" not in prompt and "Michael Kyle" not in prompt
    # There is no way to coach about someone else: the API has no subject field.
    response = client.post(
        "/v1/coaching/conversations",
        headers=auth(james),
        json={"mode": "career", "subject_employee_id": "emp-9042"},
    )
    assert response.status_code == 400


def test_transcripts_are_owner_only(client: TestClient, token: Any) -> None:
    conversation = start(client, token("james"), "career")
    for persona in ("michael", "priya"):
        url = f"/v1/coaching/conversations/{conversation['conversation_id']}"
        assert client.get(url, headers=auth(token(persona))).status_code == 404
        assert say(client, token(persona), conversation["conversation_id"], "hi").status_code == 404


def test_access_requires_role_and_entitlement(client: TestClient, token: Any) -> None:
    assert (
        client.post(
            "/v1/coaching/conversations", headers=auth(token("alex")), json={"mode": "career"}
        ).status_code
        == 403
    )  # platform admin, not an employee user
    no_entitlement = token("james", ai_entitlements=["ai_dev_plans"])
    response = client.post(
        "/v1/coaching/conversations", headers=auth(no_entitlement), json={"mode": "career"}
    )
    assert response.status_code == 403 and response.json()["error"]["code"] == "entitlement_required"


def test_manager_sees_summaries_never_transcripts(client: TestClient, token: Any) -> None:
    james = token("james")
    conversation = start(client, james, "leadership")
    say(client, james, conversation["conversation_id"], "I want to delegate better.")
    client.post(f"/v1/coaching/conversations/{conversation['conversation_id']}/end", headers=auth(james))
    view = client.get("/v1/coaching/team/emp-8721/activity", headers=auth(token("michael")))
    assert view.status_code == 200
    entry = view.json()[0]
    assert entry["kind"] == "conversation" and entry["key_themes"] and "messages" not in entry
    assert "delegate" not in json.dumps(entry)  # no transcript text
    assert (
        client.get("/v1/coaching/team/emp-7310/activity", headers=auth(token("michael"))).status_code == 403
    )
    assert client.get("/v1/coaching/team/emp-8721/activity", headers=auth(james)).status_code == 403


def test_manager_view_can_be_disabled(token: Any) -> None:
    container = build_container(
        make_settings(coaching_manager_can_view_summaries=False), providers={"fake": FakeLlmProvider()}
    )
    with TestClient(create_app(container=container)) as client:
        michael = container.verifier.mint(PERSONAS["michael"])  # type: ignore[attr-defined]
        assert client.get("/v1/coaching/team/emp-8721/activity", headers=auth(michael)).status_code == 403


def test_manager_brief_endpoint(client: TestClient, token: Any) -> None:
    brief = client.post(
        "/v1/coaching/manager-briefs", headers=auth(token("michael")), json={"employee_id": "emp-8721"}
    )
    assert brief.status_code == 200 and brief.json()["talking_points"]
    assert (
        client.post(
            "/v1/coaching/manager-briefs", headers=auth(token("michael")), json={"employee_id": "emp-7310"}
        ).status_code
        == 403
    )


# ════════════════════════════════════════════════════════════════════════════
# Interactive role-play
# ════════════════════════════════════════════════════════════════════════════


def test_learners_never_see_hidden_scenario_details(client: TestClient, token: Any) -> None:
    learner = client.get("/v1/coaching/scenarios", headers=auth(token("james"))).json()
    assert len(learner) == 4 and all("authoring" not in s for s in learner)
    admin = client.get(f"/v1/coaching/scenarios/{SCENARIO}", headers=auth(token("priya"))).json()
    assert admin["authoring"]["hidden_constraints"]


def test_recommended_scenarios_target_the_largest_gaps(client: TestClient, token: Any) -> None:
    body = client.get("/v1/coaching/scenarios/recommended", headers=auth(token("james"))).json()
    first = body["recommendations"][0]
    assert first["target_skill_id"] == "skl-api-gov" and first["gap"] == 4
    assert first["scenario"]["scenario_id"] == SCENARIO


@pytest.fixture
def roleplay(client: TestClient, token: Any) -> Iterator[tuple[str, str]]:
    james = token("james")
    session = client.post(
        "/v1/coaching/sessions", headers=auth(james), json={"scenario_id": SCENARIO, "mode": "practice"}
    )
    assert session.status_code == 201, session.text
    body = session.json()
    assert body["messages"][0]["text"].startswith("I've reviewed the proposal")
    yield james, body["session_id"]


def test_roleplay_turn_json_and_hidden_observer(
    client: TestClient, roleplay: tuple[str, str], fake_llm: FakeLlmProvider
) -> None:
    james, session_id = roleplay
    turn = client.post(
        f"/v1/coaching/sessions/{session_id}/messages",
        headers=auth(james),
        json={
            "text": "Snippets expire after 24 hours and partner access is reviewed quarterly.",
            "client_message_id": cid(),
        },
    )
    assert turn.status_code == 200, turn.text
    result = turn.json()
    assert result["coach_message"]["text"].startswith("That's a fair point")
    assert result["session_status"] == "active" and result["remaining_s"] > 0
    persona_call = next(c for c in fake_llm.calls if c.route_id == "coaching.persona_turn")
    assert "Will accept the design only if expiry is enforced" in persona_call.request.messages[0].content
    assert "James" not in " ".join(
        m.content for m in persona_call.request.messages
    )  # no personal data to the persona
    session = client.get(f"/v1/coaching/sessions/{session_id}", headers=auth(james)).json()
    assert [m["role"] for m in session["messages"]] == [
        "coach",
        "user",
        "coach",
    ]  # observer notes stay hidden


def test_roleplay_turn_streams_sse(client: TestClient, roleplay: tuple[str, str]) -> None:
    james, session_id = roleplay
    with client.stream(
        "POST",
        f"/v1/coaching/sessions/{session_id}/messages",
        headers={**auth(james), "Accept": "text/event-stream"},
        json={"text": "We enforce expiry with a scheduled purge.", "client_message_id": cid()},
    ) as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        raw = "".join(response.iter_text())
    events = [block.split("\n")[0].removeprefix("event: ") for block in raw.strip().split("\n\n")]
    assert events[0] == "meta" and events[-2:] == ["result", "done"] and events.count("delta") >= 3
    deltas = "".join(
        json.loads(b.split("data: ", 1)[1])["text"]
        for b in raw.strip().split("\n\n")
        if b.startswith("event: delta")
    )
    assert deltas.strip().startswith("That's a fair point")


def test_conversation_turn_streams_sse(client: TestClient, token: Any) -> None:
    james = token("james")
    conversation = start(client, james, "communication")
    with client.stream(
        "POST",
        f"/v1/coaching/conversations/{conversation['conversation_id']}/messages",
        headers={**auth(james), "Accept": "text/event-stream"},
        json={"text": "I need to brief the board.", "client_message_id": cid()},
    ) as response:
        raw = "".join(response.iter_text())
    blocks = raw.strip().split("\n\n")
    assert blocks[0].startswith("event: meta") and blocks[-1].startswith("event: done")
    result = json.loads(blocks[-2].split("data: ", 1)[1])
    assert result["coaching"]["reflective_question"].endswith("?")


def test_roleplay_evaluation_is_evidence_based(
    client: TestClient, roleplay: tuple[str, str], fake_llm: FakeLlmProvider
) -> None:
    james, session_id = roleplay
    text = "Customer snippets expire after 24 hours, enforced by a scheduled purge job we audit monthly."
    client.post(
        f"/v1/coaching/sessions/{session_id}/messages",
        headers=auth(james),
        json={"text": text, "client_message_id": cid()},
    )
    response = client.post(f"/v1/coaching/sessions/{session_id}/end", headers=auth(james))
    assert response.status_code == 200, response.text
    evaluation = response.json()
    assert evaluation["overall_practice_score"] == 72
    assert {o["skill_id"] for o in evaluation["skill_observations"]} == {"skl-api-gov", "skl-influence"}
    quote = evaluation["skill_observations"][0]["evidence"][0]["quote"]
    assert quote in text  # verbatim from the employee
    assert evaluation["next_steps"][0]["ref_id"] != SCENARIO
    assert "verified" in evaluation["disclaimer"]
    facts = facts_of(fake_llm, "coaching.evaluate")
    assert (
        facts["observer_notes"] and facts["observer_notes"][0]["criteria"][0]["criterion_id"] == "crit-expiry"
    )
    # Evaluation → handoff (coaching.session_evaluated) → plan-review suggestion for the employee.
    suggestions = client.get("/v1/suggestions", headers=auth(james)).json()["items"]
    assert suggestions[0]["source_handoff"] == "coaching.session_evaluated"
    sessions = client.get("/v1/coaching/sessions", headers=auth(james)).json()
    assert sessions[0]["practice_score"] == 72
    metrics = client.get("/v1/coaching/metrics/me", headers=auth(james)).json()
    assert metrics["total_sessions"] == 1 and metrics["average_practice_score"] == 72
    assert (
        client.post(
            f"/v1/coaching/sessions/{session_id}/messages",
            headers=auth(james),
            json={"text": "more", "client_message_id": cid()},
        ).status_code
        == 409
    )


def test_evaluation_rejects_fabricated_quotes(
    client: TestClient, roleplay: tuple[str, str], fake_llm: FakeLlmProvider
) -> None:
    james, session_id = roleplay
    reply = client.post(
        f"/v1/coaching/sessions/{session_id}/messages",
        headers=auth(james),
        json={"text": "We purge data after a day.", "client_message_id": cid()},
    ).json()
    message_id = reply["user_message"]["message_id"]
    fake_llm.queue.append(
        {
            "overall_practice_score": 90,
            "skill_observations": [
                {
                    "skill_id": "skl-api-gov",
                    "observed_level": 5,
                    "evidence": [
                        {"message_id": message_id, "quote": "I designed a world-class governance programme"}
                    ],
                },
                {"skill_id": "skl-influence", "observed_level": 4, "evidence": []},
            ],
        }
    )
    evaluation = client.post(f"/v1/coaching/sessions/{session_id}/end", headers=auth(james)).json()
    assert evaluation["overall_practice_score"] == 72  # fabricated output rejected; repaired result used
    repair = [c for c in fake_llm.calls if c.route_id == "coaching.evaluate"][1].request.messages[-1].content
    assert "quote_not_in_source" in repair


def test_cannot_evaluate_an_empty_roleplay(client: TestClient, roleplay: tuple[str, str]) -> None:
    james, session_id = roleplay
    assert client.post(f"/v1/coaching/sessions/{session_id}/end", headers=auth(james)).status_code == 412


def test_roleplay_wellbeing_pause(
    client: TestClient, roleplay: tuple[str, str], fake_llm: FakeLlmProvider
) -> None:
    james, session_id = roleplay
    result = client.post(
        f"/v1/coaching/sessions/{session_id}/messages",
        headers=auth(james),
        json={"text": "I can't go on like this.", "client_message_id": cid()},
    ).json()
    assert result["coach_message"]["text"].startswith("(Pausing the role-play.)") and result["suggest_end"]
    assert not [c for c in fake_llm.calls if c.route_id == "coaching.persona_turn"]


def test_roleplay_time_limit(client: TestClient, roleplay: tuple[str, str], container: Container) -> None:
    james, session_id = roleplay
    state = container.coaching._store.session("org-gec", session_id)
    assert state is not None
    state.started_at = datetime.now(UTC) - timedelta(hours=1)
    response = client.post(
        f"/v1/coaching/sessions/{session_id}/messages",
        headers=auth(james),
        json={"text": "Hello", "client_message_id": cid()},
    )
    assert response.status_code == 409


def test_roleplay_sessions_are_owner_only(client: TestClient, roleplay: tuple[str, str], token: Any) -> None:
    _, session_id = roleplay
    assert (
        client.get(f"/v1/coaching/sessions/{session_id}", headers=auth(token("michael"))).status_code == 404
    )


def test_scenario_publishing_is_governed(client: TestClient, token: Any) -> None:
    payload = {
        "from_draft_id": None,
        "scenario": {
            "title": "Escalating a Delivery Risk",
            "description": "Raise a delivery risk with a sponsor.",
            "category": "soft",
            "difficulty": "intermediate",
            "estimated_minutes": 10,
            "target_skills": [
                {
                    "skill_id": "skl-influence",
                    "skill_name": "Strategic Influence",
                    "target_level": 4,
                    "level_label": "Advanced",
                }
            ],
            "persona": {"name": "Alex", "role": "Programme Sponsor", "avatar_url": None},
            "opening": "You wanted to talk about the release date?",
            "authoring": {
                "persona_brief": "Busy sponsor.",
                "hidden_constraints": [],
                "escalation_rules": [],
                "success_criteria": [
                    {
                        "criterion_id": "c1",
                        "text": "States the risk and options.",
                        "skill_id": "skl-influence",
                        "indicator_id": None,
                    }
                ],
            },
        },
    }
    assert (
        client.post("/v1/coaching/scenarios", headers=auth(token("james")), json=payload).status_code == 403
    )
    mismatch = json.loads(json.dumps(payload))
    mismatch["scenario"]["authoring"]["success_criteria"][0]["skill_id"] = "skl-cloud"
    assert (
        client.post("/v1/coaching/scenarios", headers=auth(token("priya")), json=mismatch).status_code == 400
    )
    created = client.post("/v1/coaching/scenarios", headers=auth(token("priya")), json=payload)
    assert created.status_code == 201
    titles = [s["title"] for s in client.get("/v1/coaching/scenarios", headers=auth(token("james"))).json()]
    assert "Escalating a Delivery Risk" in titles


def test_capabilities_report_coaching_available(client: TestClient, token: Any) -> None:
    caps = {
        c["capability"]: c
        for c in client.get("/v1/capabilities", headers=auth(token("james"))).json()["capabilities"]
    }
    for capability in (
        "coaching.conversation_turn",
        "coaching.roleplay_turn",
        "coaching.evaluate_session",
        "coaching.recommend_scenarios",
    ):
        assert caps[capability]["availability"] in ("available", "degraded"), capability
