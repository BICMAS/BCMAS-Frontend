"""Seed data for the mock backend (dev/test only).

Derived from the frontend prototype (src/config/mock-users.ts, features/me/data,
features/workforce). Shapes follow the PROPOSED backend DTOs.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

T0 = datetime(2026, 11, 1, 9, 0, tzinfo=UTC)
TENANT = "org-gec"
OTHER_TENANT = "org-ths"

# Persona → token claims (used by the dev token endpoint and tests).
PERSONAS: dict[str, dict[str, Any]] = {
    "alex": {"sub": "user-alex", "tenant_id": TENANT, "roles": ["platform_super_admin"], "employee_id": None},
    "sarah": {
        "sub": "user-sarah",
        "tenant_id": TENANT,
        "roles": ["organisation_admin"],
        "employee_id": "emp-2002",
    },
    "priya": {"sub": "user-priya", "tenant_id": TENANT, "roles": ["hr_ld_admin"], "employee_id": "emp-5001"},
    "michael": {
        "sub": "user-michael",
        "tenant_id": TENANT,
        "roles": ["line_manager", "employee"],
        "employee_id": "emp-1001",
    },
    "james": {"sub": "user-james", "tenant_id": TENANT, "roles": ["employee"], "employee_id": "emp-8721"},
    "ama": {"sub": "user-ama", "tenant_id": OTHER_TENANT, "roles": ["employee"], "employee_id": "emp-ths-1"},
}


def _emp(
    id_: str,
    user: str | None,
    name: str,
    title: str,
    dept: tuple[str, str],
    role: str | None,
    version: str | None,
    manager: str | None,
    tenant: str = TENANT,
) -> dict[str, Any]:
    return {
        "id": id_,
        "user_id": user,
        "tenant_id": tenant,
        "name": name,
        "job_title": title,
        "department": {"id": dept[0], "name": dept[1]},
        "role_id": role,
        "role_profile_version": version,
        "manager_id": manager,
        "joined_at": "2019-04-01T00:00:00Z",
    }


IT = ("dept-it", "IT Infrastructure")
PEOPLE = ("dept-people", "People")

EMPLOYEES: dict[str, dict[str, Any]] = {
    e["id"]: e
    for e in [
        _emp(
            "emp-2002", "user-sarah", "Sarah Jenkins", "Organisation Administrator", PEOPLE, None, None, None
        ),
        _emp("emp-5001", "user-priya", "Priya Nair", "Head of L&D", PEOPLE, "role-hld", "1", None),
        _emp(
            "emp-1001", "user-michael", "Michael Kyle", "IT Infrastructure Manager", IT, "role-itm", "2", None
        ),
        _emp(
            "emp-8721",
            "user-james",
            "James Miller",
            "Senior Solutions Architect",
            IT,
            "role-ssa",
            "3",
            "emp-1001",
        ),
        _emp("emp-9042", None, "Robert Chen", "Lead Data Engineer", IT, "role-lde", "1", "emp-1001"),
        _emp("emp-7310", None, "Elena Rodriguez", "HR Specialist", PEOPLE, None, None, "emp-5001"),
        _emp(
            "emp-ths-1",
            "user-ama",
            "Ama Owusu",
            "Clinical Systems Analyst",
            ("dept-ths", "Clinical IT"),
            None,
            None,
            None,
            tenant=OTHER_TENANT,
        ),
    ]
}

FRAMEWORK_LEVELS: list[dict[str, Any]] = [
    {"level": 1, "label": "Foundation", "description": "Basic understanding; needs guidance."},
    {"level": 2, "label": "Developing", "description": "Performs routine tasks independently."},
    {"level": 3, "label": "Proficient", "description": "Applies the skill consistently."},
    {"level": 4, "label": "Advanced", "description": "Subject-matter expert for complex problems."},
    {"level": 5, "label": "Expert", "description": "Strategic leader and recognised authority."},
]

_LEVEL_LABELS = {lvl["level"]: lvl["label"] for lvl in FRAMEWORK_LEVELS}

_INDICATORS: dict[str, dict[int, list[str]]] = {
    "skl-cloud": {
        3: [
            "Configures virtual networks, subnets and security groups following patterns.",
            "Troubleshoots connectivity and performance issues independently.",
        ],
        4: [
            "Designs multi-region, highly available architectures.",
            "Defines reusable Infrastructure-as-Code standards for the team.",
        ],
    },
    "skl-api-gov": {
        2: ["Documents endpoints using the organisation's API template."],
        4: [
            "Defines expiry and access rules for customer data exposed through APIs.",
            "Reviews a partner integration against the API standard.",
        ],
    },
    "skl-influence": {
        3: ["Explains technical trade-offs to non-technical stakeholders."],
        5: ["Shapes executive decisions through evidence-based technical vision."],
    },
    "skl-microservices": {
        3: ["Splits a domain into independently deployable services."],
        4: ["Defines failure handling for synchronous calls between services."],
    },
}


def _skill(id_: str, name: str, description: str, category: str) -> dict[str, Any]:
    levels = []
    for level in range(1, 6):
        texts = _INDICATORS.get(id_, {}).get(level) or [
            f"Demonstrates {name.lower()} at {_LEVEL_LABELS[level].lower()} level."
        ]
        levels.append(
            {
                "level": level,
                "label": _LEVEL_LABELS[level],
                "description": None,
                "indicators": [
                    {"id": f"ind-{id_[4:]}-{level}-{i + 1}", "text": t} for i, t in enumerate(texts)
                ],
            }
        )
    return {
        "id": id_,
        "name": name,
        "description": description,
        "category": category,
        "status": "published",
        "version": "1",
        "levels": levels,
        "updated_at": T0.isoformat(),
    }


SKILLS: dict[str, dict[str, Any]] = {
    s["id"]: s
    for s in [
        _skill(
            "skl-cloud",
            "Cloud Infrastructure Design",
            "Designing and managing secure, scalable cloud architectures.",
            "technical",
        ),
        _skill(
            "skl-api-gov",
            "API Governance",
            "Establishing standards for internal and external API management.",
            "technical",
        ),
        _skill(
            "skl-influence",
            "Strategic Influence",
            "Communicating technical vision to non-technical stakeholders.",
            "behavioural",
        ),
        _skill(
            "skl-microservices",
            "Microservices Design",
            "Designing independently deployable services.",
            "technical",
        ),
    ]
}


def _req(skill: str, level: int, category: str, weight: float = 1.0) -> dict[str, Any]:
    return {"skill_id": skill, "required_level": level, "category": category, "weight": weight}


ROLE_PROFILES: dict[str, dict[str, Any]] = {
    "role-ssa": {
        "role_id": "role-ssa",
        "title": "Senior Solutions Architect",
        "version": "3",
        "status": "published",
        "requirements": [
            _req("skl-cloud", 4, "technical", 1.5),
            _req("skl-api-gov", 4, "technical"),
            _req("skl-microservices", 4, "technical"),
            _req("skl-influence", 5, "behavioural"),
        ],
    },
    "role-lde": {
        "role_id": "role-lde",
        "title": "Lead Data Engineer",
        "version": "1",
        "status": "published",
        "requirements": [
            _req("skl-cloud", 3, "technical"),
            _req("skl-microservices", 3, "technical"),
            _req("skl-api-gov", 2, "technical"),
        ],
    },
    "role-itm": {
        "role_id": "role-itm",
        "title": "IT Infrastructure Manager",
        "version": "2",
        "status": "published",
        "requirements": [_req("skl-cloud", 4, "technical"), _req("skl-influence", 4, "behavioural")],
    },
}

ROLES: dict[str, dict[str, Any]] = {
    "role-ssa": {
        "id": "role-ssa",
        "title": "Senior Solutions Architect",
        "department": {"id": IT[0], "name": IT[1]},
        "status": "published",
        "current_profile_version": "3",
        "overview": "Owns end-to-end solution design for customer-facing platforms.",
        "job_description": {
            "text": "Leads the design of secure, scalable cloud solutions and sets "
            "API standards across delivery teams.",
            "source": "uploaded",
            "file_id": "file-jd-ssa",
            "updated_at": T0.isoformat(),
        },
        "employee_count": 12,
        "updated_at": T0.isoformat(),
    },
}


def _cap(skill: str, verified: int | None, self_assessed: int | None) -> dict[str, Any]:
    return {
        "skill_id": skill,
        "verified_level": verified,
        "verified_at": T0.isoformat() if verified else None,
        "verified_by": "emp-1001" if verified else None,
        "self_assessed_level": self_assessed,
        "self_assessed_at": T0.isoformat() if self_assessed else None,
        "evidence_ids": [],
    }


CAPABILITIES: dict[str, list[dict[str, Any]]] = {
    "emp-8721": [
        _cap("skl-cloud", 4, 3),
        _cap("skl-api-gov", None, 2),
        _cap("skl-influence", 3, 3),
        _cap("skl-microservices", 3, 4),
    ],
    "emp-9042": [_cap("skl-cloud", 3, 3), _cap("skl-microservices", 3, 3)],
    "emp-1001": [_cap("skl-cloud", 4, 4), _cap("skl-influence", 4, 4)],
}

ASSESSMENT_HISTORY: dict[str, list[dict[str, Any]]] = {
    "emp-8721": [
        {
            "cycle_id": "cycle-q3-2026",
            "skill_id": "skl-api-gov",
            "self_rating": 2,
            "manager_rating": 2,
            "final_level": 2,
            "completed_at": "2026-09-30T00:00:00Z",
        }
    ],
}


def _cat(
    id_: str,
    title: str,
    kind: str,
    skills: list[str],
    levels: list[int],
    status: str = "active",
    scenario_id: str | None = None,
    provider: str | None = "Internal",
    minutes: int | None = 120,
) -> dict[str, Any]:
    return {
        "id": id_,
        "title": title,
        "description": f"{title}.",
        "kind": kind,
        "provider": provider,
        "format": None,
        "duration_minutes": minutes,
        "skill_ids": skills,
        "target_levels": levels,
        "tags": [],
        "status": status,
        "scenario_id": scenario_id,
        "updated_at": T0.isoformat(),
    }


CATALOGUE: dict[str, dict[str, Any]] = {
    c["id"]: c
    for c in [
        _cat(
            "cat-api-gov-2024",
            "Advanced API Governance & Ethics 2024",
            "e_learning",
            ["skl-api-gov"],
            [3, 4],
            provider="Coursera",
            minutes=720,
        ),
        _cat(
            "cat-influence-masterclass",
            "Strategic Influence Masterclass",
            "workshop",
            ["skl-influence"],
            [3, 4, 5],
        ),
        _cat("cat-cloud-mentoring", "Cloud Migration Mentoring", "workplace_practice", ["skl-cloud"], [2, 3]),
        _cat(
            "cat-microservices-patterns",
            "Microservices Failure Patterns",
            "e_learning",
            ["skl-microservices"],
            [3, 4],
        ),
        _cat(
            "cat-api-standards-workshop",
            "API Standards Design Workshop",
            "workshop",
            ["skl-api-gov"],
            [3, 4],
            minutes=240,
        ),
        _cat(
            "cat-cloud-architecture-lab",
            "Multi-Region Architecture Lab",
            "practical",
            ["skl-cloud"],
            [4, 5],
            minutes=360,
        ),
        _cat(
            "cat-ai-ethics",
            "AI Ethics & Strategy Masterclass",
            "e_learning",
            ["skl-api-gov"],
            [2, 3],
            status="retired",
        ),
    ]
}

LEARNING_RECORDS: dict[str, list[dict[str, Any]]] = {
    "emp-8721": [
        {
            "id": "lr-55120",
            "record_type": "course",
            "source": "catalogue",
            "catalogue_item_id": "cat-api-gov-2024",
            "title": "Advanced API Governance & Ethics 2024",
            "provider": "Coursera",
            "skill_ids": ["skl-api-gov"],
            "status": "in_progress",
            "progress_pct": 40,
            "started_at": "2026-10-01T09:00:00Z",
            "completed_at": None,
            "expires_at": None,
        },
        {
            "id": "lr-49002",
            "record_type": "certification",
            "source": "external",
            "catalogue_item_id": None,
            "title": "Azure Solutions Architect Expert",
            "provider": "Microsoft",
            "skill_ids": ["skl-cloud"],
            "status": "completed",
            "progress_pct": 100,
            "started_at": None,
            "completed_at": "2025-06-12T00:00:00Z",
            "expires_at": "2027-06-12T00:00:00Z",
        },
    ],
}

DEVELOPMENT_PLANS: dict[str, list[dict[str, Any]]] = {
    "emp-8721": [
        {
            "id": "plan-5501",
            "employee_id": "emp-8721",
            "status": "active",
            "owner_id": "emp-8721",
            "goals": [
                {
                    "id": "goal-5501-1",
                    "skill_id": "skl-api-gov",
                    "from_level": 2,
                    "to_level": 4,
                    "objective": "Advance API governance to Level 4.",
                    "due_date": "2026-12-15T00:00:00Z",
                    "progress_pct": 40,
                    "actions": [
                        {
                            "id": "act-1",
                            "type": "learning",
                            "title": "Advanced API Governance & Ethics 2024",
                            "catalogue_item_id": "cat-api-gov-2024",
                            "scenario_id": None,
                            "status": "in_progress",
                            "due_date": "2026-11-30T00:00:00Z",
                        }
                    ],
                }
            ],
            "source": {"type": "manual"},
            "created_at": T0.isoformat(),
            "updated_at": T0.isoformat(),
        }
    ],
}

# Talent assessments (BE-060 / BE-061). Mirrors the prototype's "promo-robert" promotion assessment.
TALENT_ASSESSMENTS: dict[str, dict[str, Any]] = {
    "promo-robert": {
        "id": "promo-robert",
        "type": "promotion",
        "subject": {"type": "employee", "id": "emp-9042"},
        "role_id": "role-ssa",
        "role_profile_version": "3",
        "status": "submitted",
        "rubric_version": "1",
        "rubric": [
            {"row_id": "row-cloud", "skill_id": "skl-cloud", "required_level": 4, "score": None},
            {"row_id": "row-influence", "skill_id": "skl-influence", "required_level": 5, "score": None},
        ],
        "library_item_ids": ["lib-ssa-practical", "lib-behaviour"],
        "created_by": "emp-5001",
    },
}

ASSESSMENT_RESPONSES: dict[str, list[dict[str, Any]]] = {
    "promo-robert": [
        {
            "item_id": "resp-1",
            "library_item_id": "lib-ssa-practical",
            "item_type": "practical_exercise",
            "response_text": (
                "For payments I designed a highly available active-active architecture across two regions. "
                "I wrote reusable Terraform modules that the team now uses for every new service, and I "
                "defined failover runbooks that we test every quarter."
            ),
            "file_ids": [],
            "submitted_at": "2026-11-10T10:00:00Z",
        },
        {
            "item_id": "resp-2",
            "library_item_id": "lib-behaviour",
            "item_type": "behavioural_assessment",
            "response_text": (
                "When the finance director challenged the migration budget, I reframed the cost as risk "
                "reduction and brought outage data from the last two years. The steering group approved "
                "phase one, but I have not yet presented a technical vision to the executive board."
            ),
            "file_ids": [],
            "submitted_at": "2026-11-10T10:30:00Z",
        },
    ],
}


# Development assessment of James (v1.4 "development" type): multi-method instrument.
TALENT_ASSESSMENTS["dev-james"] = {
    "id": "dev-james",
    "type": "development",
    "subject": {"type": "employee", "id": "emp-8721"},
    "role_id": "role-ssa",
    "role_profile_version": "3",
    "status": "submitted",
    "rubric_version": "1",
    "rubric": [
        {"row_id": "row-api", "skill_id": "skl-api-gov", "required_level": 4, "score": None},
        {"row_id": "row-inf", "skill_id": "skl-influence", "required_level": 5, "score": None},
        {"row_id": "row-ms", "skill_id": "skl-microservices", "required_level": 4, "score": None},
    ],
    "library_item_ids": ["lib-sjt-api", "lib-beh-influence", "lib-tech-ms", "lib-self", "lib-mgr"],
    "created_by": "emp-5001",
    "title": "Senior Solutions Architect capability assessment",
    "objectives": [
        "Establish evidence-based proficiency in the role's priority competencies.",
        "Identify development needs against the role profile.",
    ],
}


def _band(level: int, descriptor: str, indicators: list[str]) -> dict[str, Any]:
    return {"level": level, "descriptor": descriptor, "indicator_ids": indicators}


def _item(
    id_: str,
    type_: str,
    title: str,
    stem: str,
    skill: str,
    target: int,
    expected: list[str],
    guide: list[dict[str, Any]],
    *,
    options: list[dict[str, Any]] | None = None,
    respondent: str = "subject",
) -> dict[str, Any]:
    return {
        "library_item_id": id_,
        "type": type_,
        "title": title,
        "stem": stem,
        "skill_ids": [skill],
        "target_level": target,
        "expected_indicator_ids": expected,
        "options": options,
        "marking_guide": guide,
        "respondent": respondent,
    }


def _option(key: str, text: str, score: int, indicators: list[str]) -> dict[str, Any]:
    return {"option_key": key, "text": text, "score": score, "indicator_ids": indicators}


# BE-068: instruments pinned to assessments (questions, keyed options, marking guides).
ASSESSMENT_ITEMS: dict[str, dict[str, Any]] = {
    i["library_item_id"]: i
    for i in [
        _item(
            "lib-ssa-practical",
            "practical_exercise",
            "Multi-region platform design",
            "Describe a highly available platform you designed and the standards you set for the team.",
            "skl-cloud",
            4,
            ["ind-cloud-4-1", "ind-cloud-4-2"],
            [
                _band(3, "Configures and troubleshoots within patterns.", ["ind-cloud-3-1", "ind-cloud-3-2"]),
                _band(
                    4,
                    "Designs multi-region systems; sets IaC standards.",
                    ["ind-cloud-4-1", "ind-cloud-4-2"],
                ),
            ],
        ),
        _item(
            "lib-behaviour",
            "behavioural_assessment",
            "Influencing a senior decision",
            "Tell us about a time you changed a senior stakeholder's decision. What did you do?",
            "skl-influence",
            5,
            ["ind-influence-3-1", "ind-influence-5-1"],
            [
                _band(3, "Explains trade-offs to non-technical stakeholders.", ["ind-influence-3-1"]),
                _band(5, "Shapes executive decisions with an evidence-based vision.", ["ind-influence-5-1"]),
            ],
        ),
        _item(
            "lib-sjt-api",
            "situational_judgement",
            "Partner API exposing customer data",
            "A partner asks for a new endpoint returning customer records next week. The request has no data "
            "expiry rules. What do you do first?",
            "skl-api-gov",
            4,
            ["ind-api-gov-4-1", "ind-api-gov-4-2"],
            [
                _band(2, "Follows documentation practice only.", ["ind-api-gov-2-1"]),
                _band(4, "Sets data rules and reviews integrations.", ["ind-api-gov-4-1", "ind-api-gov-4-2"]),
            ],
            options=[
                _option("a", "Ship it and add rules later.", 1, []),
                _option("b", "Document the endpoint with the API template.", 2, ["ind-api-gov-2-1"]),
                _option(
                    "c",
                    "Review the integration against the API standard before agreeing.",
                    4,
                    ["ind-api-gov-4-2"],
                ),
                _option(
                    "d",
                    "Define expiry and access rules, then review the integration against the standard.",
                    5,
                    ["ind-api-gov-4-1", "ind-api-gov-4-2"],
                ),
            ],
        ),
        _item(
            "lib-beh-influence",
            "behavioural_assessment",
            "Explaining a technical trade-off",
            "Describe a time you explained a technical trade-off to non-technical stakeholders.",
            "skl-influence",
            5,
            ["ind-influence-3-1", "ind-influence-5-1"],
            [
                _band(3, "Explains trade-offs to non-technical stakeholders.", ["ind-influence-3-1"]),
                _band(5, "Shapes executive decisions with an evidence-based vision.", ["ind-influence-5-1"]),
            ],
        ),
        _item(
            "lib-tech-ms",
            "practical_exercise",
            "Failure handling between services",
            "Explain how you would split the ordering domain and handle failures between the services.",
            "skl-microservices",
            4,
            ["ind-microservices-3-1", "ind-microservices-4-1"],
            [
                _band(3, "Splits a domain into deployable services.", ["ind-microservices-3-1"]),
                _band(4, "Defines failure handling for synchronous calls.", ["ind-microservices-4-1"]),
            ],
        ),
        _item(
            "lib-self",
            "self_assessment",
            "Self-assessment: API governance",
            "Rate your API governance proficiency (1-5) and give a work example that shows it.",
            "skl-api-gov",
            4,
            ["ind-api-gov-4-1", "ind-api-gov-4-2"],
            [],
        ),
        _item(
            "lib-mgr",
            "manager_assessment",
            "Manager assessment: microservices",
            "Rate the employee's microservices proficiency (1-5) and describe what you observed.",
            "skl-microservices",
            4,
            ["ind-microservices-3-1", "ind-microservices-4-1"],
            [],
            respondent="manager",
        ),
    ]
}


def _resp(
    item_id: str, library_item_id: str, item_type: str, text: str | None, **extra: Any
) -> dict[str, Any]:
    return {
        "item_id": item_id,
        "library_item_id": library_item_id,
        "item_type": item_type,
        "response_text": text,
        "file_ids": [],
        "submitted_at": "2026-11-12T09:00:00Z",
        **extra,
    }


ASSESSMENT_RESPONSES["dev-james"] = [
    _resp("resp-sjt", "lib-sjt-api", "situational_judgement", None, selected_option_key="d"),
    _resp(
        "resp-beh",
        "lib-beh-influence",
        "behavioural_assessment",
        "I explained the latency versus cost trade-off of caching to the product and finance leads using a "
        "one-page comparison. They chose the regional cache option.",
    ),
    _resp(
        "resp-tech",
        "lib-tech-ms",
        "practical_exercise",
        "I would split ordering into cart, checkout and fulfilment services that deploy independently. "
        "I have not yet designed retries or timeouts for them.",
    ),
    _resp(
        "resp-self",
        "lib-self",
        "self_assessment",
        "I document every endpoint with the organisation's API template.",
        rating=4,
    ),
    _resp(
        "resp-mgr",
        "lib-mgr",
        "manager_assessment",
        "James split the payments domain into independently deployable services last quarter.",
        rating=3,
        respondent="manager",
    ),
]

# BE-012 (PROPOSED, v1.6): organisational structure.
ORG_UNITS: list[dict[str, Any]] = [
    {
        "id": "org-gec",
        "name": "Global Engineering Co",
        "type": "organisation",
        "parent_id": None,
        "manager_employee_id": "emp-2002",
        "headcount": 7,
        "updated_at": T0.isoformat(),
    },
    {
        "id": "dept-it",
        "name": "IT Infrastructure",
        "type": "department",
        "parent_id": "org-gec",
        "manager_employee_id": "emp-1001",
        "headcount": 3,
        "updated_at": T0.isoformat(),
    },
    {
        "id": "dept-people",
        "name": "People",
        "type": "department",
        "parent_id": "org-gec",
        "manager_employee_id": "emp-5001",
        "headcount": 3,
        "updated_at": T0.isoformat(),
    },
]

# BE-032 (PROPOSED, v1.6): authorised performance summaries (no review free text, ever).
PERFORMANCE: dict[str, dict[str, Any]] = {
    "emp-8721": {
        "employee_id": "emp-8721",
        "period": "2026-H1",
        "visibility": "full",
        "goals": [
            {"title": "Publish the API governance standard", "status": "at_risk", "rating": "Partially met"},
            {"title": "Migrate payments to multi-region", "status": "achieved", "rating": "Exceeded"},
        ],
        "overall_rating": "Meets expectations",
        "withheld_fields": [],
        "as_of": T0.isoformat(),
    },
}
