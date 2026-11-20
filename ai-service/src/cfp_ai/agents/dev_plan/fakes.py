"""Offline fake responder for ``dev_plan.generate`` (dev/test only).

Builds a plan from the facts in ``<input_json>`` that satisfies the plan rules: one goal
per selected skill, organisational catalogue learning first, a workplace assignment, a
coaching scenario when one exists, milestones and indicators inside the horizon.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from cfp_ai.agents.common import extract_input_json
from cfp_ai.llm.types import LlmRequest


def generate(request: LlmRequest, output_model: type[BaseModel] | None) -> dict[str, Any]:
    facts = extract_input_json(request)
    horizon = int(facts["horizon_weeks"])
    goals: list[dict[str, Any]] = []
    for index, goal in enumerate(facts["goals"]):
        skill, name, target = goal["skill_id"], goal["skill_name"], goal["target_level"]
        start = 1 if index == 0 else min(horizon, 1 + index * 2)
        end = horizon
        mid = (start + end) // 2
        indicators = [i["id"] for i in goal["indicator_options"] if i["level"] == target] or [
            goal["indicator_options"][-1]["id"]
        ]
        interventions: list[dict[str, Any]] = [
            {
                "action_key": f"{skill}-assignment",
                "type": "workplace_practice",
                "title": f"Lead a live piece of work that needs {name}",
                "description": f"Agree a real assignment that needs {name} at level {target}.",
                "success_indicator_ids": indicators[:1],
                "due_in_days": end * 7,
            }
        ]
        if goal["catalogue_options"]:
            item = goal["catalogue_options"][0]
            interventions.insert(
                0,
                {
                    "action_key": f"{skill}-learning",
                    "type": "learning",
                    "title": item["title"],
                    "description": "Complete the organisation's course and apply one idea at work.",
                    "catalogue_item_id": item["id"],
                    "due_in_days": max(7, mid * 7),
                },
            )
        if goal["scenario_options"]:
            scenario = goal["scenario_options"][0]
            interventions.append(
                {
                    "action_key": f"{skill}-practice",
                    "type": "coaching_scenario",
                    "title": f"Practise: {scenario['title']}",
                    "description": "Rehearse in an AI role-play and review the feedback with your manager.",
                    "scenario_id": scenario["id"],
                    "due_in_days": max(7, mid * 7),
                }
            )
        goals.append(
            {
                "skill_id": skill,
                "objective": f"Demonstrate {name} at level {target} in day-to-day work.",
                "interventions": interventions,
                "milestones": [
                    {
                        "milestone_key": f"{skill}-m1",
                        "title": "Learning applied",
                        "due_week": mid,
                        "measure": "One work example discussed with the manager.",
                    },
                    {
                        "milestone_key": f"{skill}-m2",
                        "title": "Target level evidenced",
                        "due_week": end,
                        "measure": f"Evidence submitted for level {target} review.",
                        "success_indicator_ids": indicators[:1],
                    },
                ],
                "expected_outcomes": [f"Works at level {target} in {name} without close support."],
                "success_indicator_ids": indicators[:2],
                "start_week": start,
                "end_week": end,
            }
        )
    return {
        "development_objectives": [
            f"Reach the {facts.get('plan_role') or 'role'} requirements in the priority gaps."
        ],
        "rationale": "Goals follow the platform's gap priorities; organisational resources are used first.",
        "goals": goals,
    }


RESPONDERS = {"dev_plan.generate": generate}
