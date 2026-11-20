"""Deterministic gap calculator (AI_TECHNICAL_SPEC.md §5.3). No LLM involved.

    gap      = required_level − (verified_level or 0)
    priority = critical  if gap ≥ 2
               high      if gap == 1 and (never verified or weight ≥ 1.5)
               medium    if gap == 1
               low       if gap ≤ 0 and self-assessed < required
               (excluded otherwise)

Ordering: priority, then category (technical, behavioural, knowledge), then
weight (desc), then skill name. Thresholds are pending L&D sign-off.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from cfp_ai.integrations.backend.dto import CapabilityLevelDTO, RoleRequirementDTO, SkillDTO
from cfp_ai.schemas.public import GapPriority, SkillGap

_PRIORITY_RANK: dict[str, int] = {"critical": 0, "high": 1, "medium": 2, "low": 3}
_CATEGORY_RANK: dict[str, int] = {"technical": 0, "behavioural": 1, "knowledge": 2}
HIGH_WEIGHT = 1.5


def _priority(
    gap: int, verified: int | None, self_assessed: int | None, required: int, weight: float
) -> GapPriority | None:
    if gap >= 2:
        return "critical"
    if gap == 1:
        return "high" if verified is None or weight >= HIGH_WEIGHT else "medium"
    if self_assessed is not None and self_assessed < required:
        return "low"
    return None


def compute_gaps(
    requirements: Sequence[RoleRequirementDTO],
    capability_levels: Sequence[CapabilityLevelDTO],
    skills: Mapping[str, SkillDTO],
) -> list[SkillGap]:
    by_skill = {c.skill_id: c for c in capability_levels}
    rows: list[tuple[tuple[int, int, float, str], SkillGap]] = []
    for req in requirements:
        cap = by_skill.get(req.skill_id)
        verified = cap.verified_level if cap else None
        self_assessed = cap.self_assessed_level if cap else None
        weight = req.weight if req.weight is not None else 1.0
        gap = req.required_level - (verified or 0)
        priority = _priority(gap, verified, self_assessed, req.required_level, weight)
        if priority is None:
            continue
        name = skills[req.skill_id].name if req.skill_id in skills else req.skill_id
        sort_key = (_PRIORITY_RANK[priority], _CATEGORY_RANK.get(req.category, 9), -weight, name.lower())
        rows.append(
            (
                sort_key,
                SkillGap(
                    skill_id=req.skill_id,
                    skill_name=name,
                    category=req.category,
                    required_level=req.required_level,
                    verified_level=verified,
                    self_assessed_level=self_assessed,
                    gap=gap,
                    priority=priority,
                ),
            )
        )
    rows.sort(key=lambda row: row[0])
    return [gap for _, gap in rows]
