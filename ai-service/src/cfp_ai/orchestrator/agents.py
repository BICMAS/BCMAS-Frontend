"""Agent registration (docs/ai/ORCHESTRATION.md §4).

An agent is a named group of capabilities. Capabilities are registered with the
CapabilityRegistry (declared from the catalogue, implemented by agent modules);
this module describes the three agents and reports what each can do for a
given principal.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel

from cfp_ai.agents.registry import CapabilityRegistry
from cfp_ai.auth.principal import Principal
from cfp_ai.schemas.public import CapabilityStatus


@dataclass(frozen=True)
class AgentDefinition:
    name: Literal["coaching", "dev_plan", "talent_assessment"]
    title: str
    description: str


AGENTS: tuple[AgentDefinition, ...] = (
    AgentDefinition(
        "coaching",
        "AI Coaching Agent",
        "Practice scenarios, coaching conversations and manager coaching support.",
    ),
    AgentDefinition(
        "dev_plan",
        "AI Training & Development Plan Agent",
        "Skill-gap analysis, learning recommendations and development plans.",
    ),
    AgentDefinition(
        "talent_assessment",
        "AI Talent Assessment Agent",
        "Assessment content, scoring assistance and readiness reporting for human reviewers.",
    ),
)


class AgentSummary(BaseModel):
    name: str
    title: str
    description: str
    capabilities: list[CapabilityStatus]


def describe_agents(registry: CapabilityRegistry, principal: Principal) -> list[AgentSummary]:
    statuses = registry.public_status(principal)
    return [
        AgentSummary(
            name=agent.name,
            title=agent.title,
            description=agent.description,
            capabilities=[s for s in statuses if s.agent == agent.name],
        )
        for agent in AGENTS
    ]
