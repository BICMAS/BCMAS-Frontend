"""Assessor-reviewed evaluations (AI-held working data; in memory until shared storage exists).

The backend stays the record of scores (BE-063 commit by the frontend). This store keeps the
criterion-level evidence behind a reviewed evaluation, so a report can cite it, and lets the
API find the orchestrator execution that holds a scoring set's approval.
"""

from __future__ import annotations

from dataclasses import dataclass

from cfp_ai.agents.talent.models import ReviewedEvaluation


@dataclass(frozen=True)
class ScoringSetRef:
    execution_id: str
    approval_id: str | None
    subject_type: str
    subject_id: str


class TalentResultStore:
    def __init__(self) -> None:
        self._reviewed: dict[tuple[str, str], ReviewedEvaluation] = {}
        self._sets: dict[tuple[str, str], ScoringSetRef] = {}

    def save_reviewed(self, tenant_id: str, reviewed: ReviewedEvaluation) -> None:
        self._reviewed[(tenant_id, reviewed.assessment_id)] = reviewed

    def reviewed(self, tenant_id: str, assessment_id: str) -> ReviewedEvaluation | None:
        return self._reviewed.get((tenant_id, assessment_id))

    def reviewed_for_subject(self, tenant_id: str, employee_id: str) -> list[ReviewedEvaluation]:
        rows = [
            r
            for (t, _), r in self._reviewed.items()
            if t == tenant_id and r.subject_type == "employee" and r.subject_id == employee_id
        ]
        return sorted(rows, key=lambda r: r.reviewed_at, reverse=True)

    def link_scoring_set(self, tenant_id: str, scoring_set_id: str, ref: ScoringSetRef) -> None:
        self._sets[(tenant_id, scoring_set_id)] = ref

    def scoring_set(self, tenant_id: str, scoring_set_id: str) -> ScoringSetRef | None:
        return self._sets.get((tenant_id, scoring_set_id))

    def erase_subject(self, tenant_id: str, employee_id: str) -> int:
        doomed = [
            k
            for k, r in self._reviewed.items()
            if k[0] == tenant_id and r.subject_type == "employee" and r.subject_id == employee_id
        ]
        for key in doomed:
            del self._reviewed[key]
        sets = [
            k
            for k, r in self._sets.items()
            if k[0] == tenant_id and r.subject_type == "employee" and r.subject_id == employee_id
        ]
        for key in sets:
            del self._sets[key]
        return len(doomed) + len(sets)
