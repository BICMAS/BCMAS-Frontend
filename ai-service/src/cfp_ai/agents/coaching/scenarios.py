"""Scenario library (AI-owned; docs/ai/COACHING_AGENT.md §4).

Scenarios define a persona, hidden constraints, escalation rules and success
criteria linked to skill indicators. Learners see ``CoachScenario`` (no hidden
fields); hr_ld_admin sees ``CoachScenarioAdmin``.

Seed scenarios mirror the frontend prototype's four simulations, mapped to the
mock framework's skill IDs. They are loaded only in dev/test.
"""

from __future__ import annotations

from datetime import UTC, datetime

from ulid import ULID

from cfp_ai.schemas.public import (
    CoachScenario,
    CoachScenarioAdmin,
    PersonaPublic,
    ScenarioAuthoring,
    ScenarioDraftPayload,
    SkillTarget,
    SuccessCriterion,
)

_AVATAR = "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-{n}.jpg"


def _target(skill_id: str, name: str, level: int, label: str) -> SkillTarget:
    return SkillTarget(skill_id=skill_id, skill_name=name, target_level=level, level_label=label)


def _seed() -> list[CoachScenarioAdmin]:
    now = datetime(2026, 11, 1, tzinfo=UTC)
    api = _target("skl-api-gov", "API Governance", 4, "Advanced")
    influence4 = _target("skl-influence", "Strategic Influence", 4, "Advanced")
    influence5 = _target("skl-influence", "Strategic Influence", 5, "Expert")
    cloud = _target("skl-cloud", "Cloud Infrastructure Design", 4, "Advanced")
    return [
        CoachScenarioAdmin(
            scenario_id="sc_01JDSEED000000000000000001",
            version=1,
            status="published",
            updated_at=now,
            title="Data Retention Briefing with the CPO",
            category="role",
            difficulty="intermediate",
            description="Defend an API data-retention design to a privacy-focused Chief Privacy Officer.",
            estimated_minutes=15,
            target_skills=[api, influence4],
            persona=PersonaPublic(name="Dana", role="Chief Privacy Officer", avatar_url=_AVATAR.format(n=1)),
            opening=(
                "I've reviewed the proposal. My main concern is that customer snippets exposed through the "
                "API are stored indefinitely. How does your design enforce expiry?"
            ),
            authoring=ScenarioAuthoring(
                persona_brief="A sceptical but fair CPO who cares about regulatory exposure and evidence.",
                hidden_constraints=[
                    "Will accept the design only if expiry is enforced, not just documented.",
                    "Is worried about partner integrations bypassing retention rules.",
                ],
                escalation_rules=[
                    "If answers stay vague after two turns, ask for the specific policy section.",
                    "If the employee becomes defensive, say the meeting may need to be escalated.",
                ],
                success_criteria=[
                    SuccessCriterion(
                        criterion_id="crit-expiry",
                        skill_id="skl-api-gov",
                        indicator_id="ind-api-gov-4-1",
                        text="Defines enforceable expiry and access rules for customer data.",
                    ),
                    SuccessCriterion(
                        criterion_id="crit-partner",
                        skill_id="skl-api-gov",
                        indicator_id="ind-api-gov-4-2",
                        text="Explains how partner integrations are reviewed against the standard.",
                    ),
                    SuccessCriterion(
                        criterion_id="crit-frame",
                        skill_id="skl-influence",
                        indicator_id=None,
                        text="Frames the constraint as a shared safeguard rather than a defence.",
                    ),
                ],
            ),
        ),
        CoachScenarioAdmin(
            scenario_id="sc_01JDSEED000000000000000002",
            version=1,
            status="published",
            updated_at=now,
            title="Cloud Cost Optimisation Workshop",
            category="technical",
            difficulty="advanced",
            description="Lead an engineering lead through cutting multi-cloud waste without adding risk.",
            estimated_minutes=20,
            target_skills=[cloud],
            persona=PersonaPublic(name="Sam", role="Engineering Lead", avatar_url=_AVATAR.format(n=3)),
            opening=(
                "Our multi-cloud bill jumped 18% this quarter. Walk me through the first three wastes you "
                "would cut, and what you would not touch."
            ),
            authoring=ScenarioAuthoring(
                persona_brief="A pragmatic engineering lead protective of uptime.",
                hidden_constraints=["Will push back on anything that reduces redundancy."],
                escalation_rules=["If the employee proposes cutting redundancy, raise an outage concern."],
                success_criteria=[
                    SuccessCriterion(
                        criterion_id="crit-ha",
                        skill_id="skl-cloud",
                        indicator_id="ind-cloud-4-1",
                        text="Keeps multi-region availability while reducing cost.",
                    ),
                    SuccessCriterion(
                        criterion_id="crit-iac",
                        skill_id="skl-cloud",
                        indicator_id="ind-cloud-4-2",
                        text="Uses reusable infrastructure-as-code standards to prevent waste.",
                    ),
                ],
            ),
        ),
        CoachScenarioAdmin(
            scenario_id="sc_01JDSEED000000000000000003",
            version=1,
            status="published",
            updated_at=now,
            title="Regional Outage: Response Briefing",
            category="technical",
            difficulty="expert",
            description="Brief leadership during a multi-region outage while identifying the root cause.",
            estimated_minutes=25,
            target_skills=[cloud, influence4],
            persona=PersonaPublic(name="Morgan", role="Incident Commander", avatar_url=_AVATAR.format(n=4)),
            opening="EU-West is unresponsive. Leadership is already on the bridge. What is your first priority, "
            "and who do you tell?",
            authoring=ScenarioAuthoring(
                persona_brief="A calm, time-pressured incident commander.",
                hidden_constraints=["Expects a clear first action within the first answer."],
                escalation_rules=["If no first action is named, interrupt and ask again."],
                success_criteria=[
                    SuccessCriterion(
                        criterion_id="crit-priority",
                        skill_id="skl-cloud",
                        indicator_id="ind-cloud-4-1",
                        text="Names a clear first technical priority.",
                    ),
                    SuccessCriterion(
                        criterion_id="crit-comms",
                        skill_id="skl-influence",
                        indicator_id=None,
                        text="Communicates status to leadership clearly and calmly.",
                    ),
                ],
            ),
        ),
        CoachScenarioAdmin(
            scenario_id="sc_01JDSEED000000000000000004",
            version=1,
            status="published",
            updated_at=now,
            title="Vendor Contract Negotiation",
            category="soft",
            difficulty="intermediate",
            description="Balance cost reduction with SLA requirements in a negotiation with a SaaS vendor.",
            estimated_minutes=15,
            target_skills=[influence5],
            persona=PersonaPublic(name="Riley", role="Vendor Director", avatar_url=_AVATAR.format(n=5)),
            opening="We can offer 8% off if you extend the term by two years. Your team wants a tighter SLA. "
            "How do you want to trade those?",
            authoring=ScenarioAuthoring(
                persona_brief="A commercially sharp vendor director looking for a longer commitment.",
                hidden_constraints=["Can concede SLA improvements but not more than 10% discount."],
                escalation_rules=["If the employee anchors aggressively, become more guarded."],
                success_criteria=[
                    SuccessCriterion(
                        criterion_id="crit-trade",
                        skill_id="skl-influence",
                        indicator_id=None,
                        text="Proposes a trade that links term length to SLA commitments.",
                    ),
                    SuccessCriterion(
                        criterion_id="crit-evidence",
                        skill_id="skl-influence",
                        indicator_id=None,
                        text="Uses evidence about outage impact to support the SLA request.",
                    ),
                ],
            ),
        ),
    ]


SEED_TENANT = "org-gec"


class ScenarioStore:
    def __init__(self, *, seed: bool) -> None:
        self._items: dict[tuple[str, str], CoachScenarioAdmin] = {}
        if seed:
            for scenario in _seed():
                self._items[(SEED_TENANT, scenario.scenario_id)] = scenario

    def list(self, tenant_id: str, *, include_unpublished: bool = False) -> list[CoachScenarioAdmin]:
        rows = [
            s
            for (t, _), s in self._items.items()
            if t == tenant_id and (include_unpublished or s.status == "published")
        ]
        return sorted(rows, key=lambda s: s.title)

    def get(self, tenant_id: str, scenario_id: str) -> CoachScenarioAdmin | None:
        return self._items.get((tenant_id, scenario_id))

    def publish(self, tenant_id: str, payload: ScenarioDraftPayload) -> CoachScenarioAdmin:
        scenario = CoachScenarioAdmin(
            scenario_id=f"sc_{ULID()}",
            version=1,
            status="published",
            updated_at=datetime.now(UTC),
            **payload.model_dump(),
        )
        self._items[(tenant_id, scenario.scenario_id)] = scenario
        return scenario


def public_view(scenario: CoachScenarioAdmin) -> CoachScenario:
    """Learner view: hidden persona constraints and success criteria are removed."""
    return CoachScenario.model_validate(scenario.model_dump(exclude={"authoring"}))
