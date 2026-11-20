"""T4 ``talent.draft_report`` — assessment report from assessor-confirmed scores (draft → review).

Inputs are the scores committed to the backend (BE-060 rubric, ``score`` + ``score_source``);
the AI never reports its own unreviewed recommendations. Criterion evidence comes from the
reviewed evaluation when its final scores match the committed ones. Strengths, gaps and
development needs are deterministic. The model writes the summary, per-competency feedback,
development recommendations (organisational resources only) and participant feedback. The
report never contains a readiness band or a hiring/promotion decision. Accepted reports are
attached to the assessment by the frontend (BE-067).
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import replace
from typing import Any, Literal

from pydantic import BaseModel, Field

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.common import input_json_block, provenance
from cfp_ai.agents.steps import CommitInstruction, StepInput, StepOutput
from cfp_ai.agents.talent import scoring
from cfp_ai.agents.talent.models import (
    AssessmentReport,
    DevelopmentNeed,
    DevelopmentRecommendation,
    ReportCompetency,
)
from cfp_ai.auth.principal import Principal
from cfp_ai.context.models import CapabilityContext
from cfp_ai.drafts.service import DraftEnvelope, DraftRecord, KindHandler
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.llm.types import LlmMessage, LlmRequest
from cfp_ai.schemas.public import ApprovalPolicy, ValidationIssue
from cfp_ai.validation.structured import generate_validated

SPEC = replace(declared("talent.draft_report"), implemented=True, optional_endpoints=("BE-022", "BE-040"))
ROUTE = "talent.report"
PROMPT_VERSION = "talent.report@v1"
COMMIT_ENDPOINT = "BE-067"
DISCLAIMER = (
    "AI-assisted assessment report based only on assessor-confirmed scores and submitted evidence. It does "
    "not make hiring or promotion decisions and becomes part of the assessment record only after review."
)
_LEVEL = re.compile(r"\blevel\s+([1-5])\b", re.IGNORECASE)

SYSTEM_PROMPT = """You write an assessment report for an assessor to review. Scores are FINAL and
confirmed by the assessor; never change, re-interpret or add scores. Using only <input_json>:
- summary (max 150 words): what was assessed and the confirmed results across competencies;
- competency_feedback: one entry per rubric_row_id, specific and constructive, referring to the criteria met
  and missing and the evidence given; mention only the confirmed or required level for that competency;
- recommendations: for each development need, one practical recommendation, using only the catalogue and
  scenario IDs offered for that skill (may be empty);
- participant_feedback: respectful, developmental feedback addressed to the participant.
Do not state readiness, recommend hiring or promotion, rank people, or infer potential, personality or
personal attributes. Do not invent evidence."""


class _Feedback(BaseModel):
    rubric_row_id: str
    feedback: str = Field(max_length=1200)


class _Recommendation(BaseModel):
    skill_id: str
    recommendation: str = Field(max_length=800)
    catalogue_item_ids: list[str] = Field(default_factory=list)
    scenario_ids: list[str] = Field(default_factory=list)


class ReportLLM(BaseModel):
    summary: str = Field(max_length=4000)
    competency_feedback: list[_Feedback]
    recommendations: list[_Recommendation] = Field(default_factory=list)
    participant_feedback: str = Field(max_length=3000)


def report_rules(output: Any, vctx: dict[str, Any]) -> list[ValidationIssue]:
    """Applied to model output and to assessor edits of the narrative."""
    issues: list[ValidationIssue] = []
    rows: dict[str, dict[str, int]] = vctx["rows"]
    needs: dict[str, dict[str, list[str]]] = vctx["needs"]
    feedback = {f.rubric_row_id: f.feedback for f in output.competency_feedback}
    for missing in sorted(set(rows) - set(feedback)):
        issues.append(ValidationIssue(code="missing_feedback", path="competency_feedback", message=missing))
    for i, f in enumerate(output.competency_feedback):
        path = f"competency_feedback[{i}]"
        row = rows.get(f.rubric_row_id)
        if row is None:
            issues.append(ValidationIssue(code="unknown_id", path=path, message=f"'{f.rubric_row_id}'"))
            continue
        for level in _LEVEL.findall(f.feedback):
            if int(level) not in (row["confirmed"], row["required"]):
                issues.append(
                    ValidationIssue(
                        code="score_mismatch", path=path, message=f"level {level} is not a confirmed result"
                    )
                )
        issues.extend(scoring.language_issues(f.feedback, path))
    allowed_levels = {v for r in rows.values() for v in r.values()}
    for level in _LEVEL.findall(output.summary):
        if int(level) not in allowed_levels:
            issues.append(ValidationIssue(code="score_mismatch", path="summary", message=f"level {level}"))
    seen = [r.skill_id for r in output.recommendations]
    if vctx["employee"]:
        for missing in sorted(set(needs) - set(seen)):
            issues.append(
                ValidationIssue(code="missing_recommendation", path="recommendations", message=missing)
            )
    elif output.recommendations:
        issues.append(
            ValidationIssue(
                code="not_applicable", path="recommendations", message="no development plans for candidates"
            )
        )
    for i, r in enumerate(output.recommendations):
        path = f"recommendations[{i}]"
        need = needs.get(r.skill_id)
        if need is None:
            issues.append(
                ValidationIssue(
                    code="unknown_id", path=path, message=f"{r.skill_id} is not a development need"
                )
            )
            continue
        for cid in r.catalogue_item_ids:
            if cid not in need["catalogue"]:
                issues.append(
                    ValidationIssue(code="unknown_id", path=path, message=f"'{cid}' was not offered")
                )
        for sid in r.scenario_ids:
            if sid not in need["scenarios"]:
                issues.append(
                    ValidationIssue(code="unknown_id", path=path, message=f"'{sid}' was not offered")
                )
        issues.extend(scoring.language_issues(r.recommendation, path))
    issues.extend(scoring.language_issues(output.summary, "summary"))
    issues.extend(scoring.language_issues(output.participant_feedback, "participant_feedback"))
    return issues


class DraftReportCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = DraftEnvelope

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        if self.deps.drafts is None:
            raise AppError("ai_unavailable", internal_detail="draft service not configured")
        assessment_id = step.args.get("assessment_id")
        if not assessment_id:
            raise AppError("invalid_request", "assessment_id is required.")
        backend = self.deps.backend
        try:
            assessment = await backend.get_assessment(ctx.principal, assessment_id)
        except BackendError as exc:
            raise exc.to_app_error() from exc
        unscored = [r.row_id for r in assessment.rubric if r.score is None]
        if unscored:
            raise AppError(
                "precondition_failed",
                "Every competency needs an assessor-confirmed score committed before reporting.",
                internal_detail=f"unscored={unscored}",
            )
        is_employee = assessment.subject.type == "employee"
        skill_ids = sorted({r.skill_id for r in assessment.rubric})
        names = {s: s for s in skill_ids}
        try:
            for skill in await asyncio.gather(*(backend.get_skill(ctx.principal, s) for s in skill_ids)):
                names[skill.id] = skill.name
        except BackendError:
            pass  # names are cosmetic; IDs remain
        reviewed = (
            self.deps.talent_results.reviewed(ctx.principal.tenant_id, assessment_id)
            if self.deps.talent_results
            else None
        )
        evaluated = {s.rubric_row_id: s for s in reviewed.evaluation.recommendations} if reviewed else {}
        finals = {r.rubric_row_id: r.final_score for r in reviewed.rows} if reviewed else {}
        competencies: list[ReportCompetency] = []
        for row in assessment.rubric:
            assert row.score is not None
            ev = evaluated.get(row.row_id) if finals.get(row.row_id) == row.score else None
            competencies.append(
                ReportCompetency(
                    rubric_row_id=row.row_id,
                    skill_id=row.skill_id,
                    skill_name=names[row.skill_id],
                    required_level=row.required_level,
                    confirmed_level=row.score,
                    score_source=row.score_source or "human",
                    gap=max(0, row.required_level - row.score),
                    criteria_met=[c.text for c in ev.criteria if c.judgement == "met"] if ev else [],
                    criteria_missing=[
                        c.text for c in ev.criteria if c.judgement != "met" and c.level <= row.required_level
                    ]
                    if ev
                    else [],
                    evidence=list(ev.evidence[:4]) if ev else [],
                    feedback="",
                )
            )
        needs = [
            DevelopmentNeed(
                skill_id=c.skill_id,
                skill_name=c.skill_name,
                gap=c.gap,
                priority="critical" if c.gap >= 2 else "high",
            )
            for c in competencies
            if c.gap > 0
        ]
        candidates = await self._resources(ctx, needs) if is_employee else {}
        vctx: dict[str, Any] = {
            "employee": is_employee,
            "rows": {
                c.rubric_row_id: {"confirmed": c.confirmed_level, "required": c.required_level}
                for c in competencies
            },
            "needs": {
                n.skill_id: candidates.get(n.skill_id, {"catalogue": [], "scenarios": []}) for n in needs
            },
        }
        facts = {
            "assessment": {
                "type": assessment.type,
                "title": assessment.title,
                "objectives": assessment.objectives,
            },
            "competencies": [
                {
                    "rubric_row_id": c.rubric_row_id,
                    "skill_name": c.skill_name,
                    "required_level": c.required_level,
                    "confirmed_level": c.confirmed_level,
                    "criteria_met": c.criteria_met,
                    "criteria_missing": c.criteria_missing,
                    "evidence": [q.quote for q in c.evidence],
                }
                for c in competencies
            ],
            "development_needs": [
                {
                    "skill_id": n.skill_id,
                    "skill_name": n.skill_name,
                    "gap": n.gap,
                    **vctx["needs"][n.skill_id],
                }
                for n in needs
            ]
            if is_employee
            else [],
        }
        request = LlmRequest(
            route_id=ROUTE,
            system_blocks=(SYSTEM_PROMPT,),
            messages=(LlmMessage("user", input_json_block(facts)),),
            metadata={"tenant_id": ctx.principal.tenant_id, "capability": SPEC.capability},
        )
        result = await generate_validated(
            self.deps.gateway,
            ROUTE,
            request,
            ReportLLM,
            [lambda out: report_rules(out, vctx)],
            metrics=self.deps.metrics,
            deadline=ctx.deadline,
        )
        out = result.output
        feedback = {f.rubric_row_id: f.feedback for f in out.competency_feedback}
        report = AssessmentReport(
            assessment_id=assessment.id,
            assessment_type=assessment.type,
            title=assessment.title,
            subject={"type": assessment.subject.type, "id": assessment.subject.id},
            objectives=assessment.objectives,
            methods=reviewed.evaluation.methods if reviewed else [],
            summary=out.summary,
            competencies=[c.model_copy(update={"feedback": feedback[c.rubric_row_id]}) for c in competencies],
            strengths=[c.skill_name for c in competencies if c.gap == 0],
            development_needs=needs,
            development_recommendations=[
                DevelopmentRecommendation(**r.model_dump()) for r in out.recommendations
            ],
            participant_feedback=out.participant_feedback,
            evidence_basis=(
                "Assessor-confirmed scores committed to the assessment record"
                + ("; criterion evidence from the reviewed AI evaluation." if evaluated else ".")
            ),
            validation=result.report,
        )
        approvers: list[Any] = ["hr_ld_admin", "line_manager"] if is_employee else ["hr_ld_admin"]
        envelope = self.deps.drafts.create(
            ctx.principal,
            kind="assessment_report",
            capability=SPEC.capability,
            subject_employee_id=assessment.subject.id if is_employee else None,
            payload=report,
            provenance=provenance(
                SPEC.capability, model=result.model, prompt_version=PROMPT_VERSION, context=None
            ),
            approval_policy=ApprovalPolicy(
                mode="role_approval",
                approver_roles=approvers,
                commit_target="backend",
                commit_endpoint_id=COMMIT_ENDPOINT,
            ),
            disclaimer=DISCLAIMER,
            validation_context={
                **vctx,
                "fixed": [c.model_dump(exclude={"feedback"}) for c in report.competencies],
            },
        )
        return StepOutput(
            summary=f"Draft assessment report for {len(competencies)} competency(ies); awaiting review.",
            output_type="DraftEnvelope",
            data=envelope.model_dump(mode="json"),
        )

    async def _resources(
        self, ctx: RunContext, needs: list[DevelopmentNeed]
    ) -> dict[str, dict[str, list[str]]]:
        """Organisational resources only: active catalogue items (BE-040) and published scenarios."""
        if not needs:
            return {}
        try:
            catalogue = await self.deps.backend.list_catalogue(ctx.principal, [n.skill_id for n in needs])
        except BackendError:
            catalogue = []
        scenarios = self.deps.scenarios.list(ctx.principal.tenant_id) if self.deps.scenarios else []
        return {
            n.skill_id: {
                "catalogue": [c.id for c in catalogue if n.skill_id in c.skill_ids and c.status == "active"][
                    :3
                ],
                "scenarios": [
                    s.scenario_id for s in scenarios if n.skill_id in {t.skill_id for t in s.target_skills}
                ][:2],
            }
            for n in needs
        }


# ── draft kind handler ───────────────────────────────────────────────────────


class _EditView(BaseModel):
    summary: str
    competency_feedback: list[_Feedback]
    recommendations: list[_Recommendation]
    participant_feedback: str


def validate_edit(model: BaseModel, vctx: dict[str, Any]) -> list[ValidationIssue]:
    assert isinstance(model, AssessmentReport)
    view = _EditView(
        summary=model.summary,
        competency_feedback=[
            _Feedback(rubric_row_id=c.rubric_row_id, feedback=c.feedback) for c in model.competencies
        ],
        recommendations=[_Recommendation(**r.model_dump()) for r in model.development_recommendations],
        participant_feedback=model.participant_feedback,
    )
    issues = report_rules(view, vctx)
    if [c.model_dump(exclude={"feedback"}) for c in model.competencies] != vctx["fixed"]:
        issues.append(
            ValidationIssue(
                code="fixed_field", path="competencies", message="confirmed scores and evidence are fixed"
            )
        )
    return issues


def commit_report(
    record: DraftRecord, model: BaseModel, principal: Principal, source: Literal["ai", "ai_edited"]
) -> list[CommitInstruction]:
    """BE-067 POST /talent/assessments/{id}/reports, executed by the frontend after approval."""
    assert isinstance(model, AssessmentReport)
    return [
        CommitInstruction(
            endpoint_id=COMMIT_ENDPOINT,
            method="POST",
            path=f"/talent/assessments/{model.assessment_id}/reports",
            body={
                "report": model.model_dump(mode="json", exclude={"validation"}),
                "source": {
                    "type": source,
                    "draft_id": record.draft.draft_id,
                    "model": record.draft.provenance.model,
                    "prompt_version": record.draft.provenance.prompt_version,
                },
            },
            endpoint_status="unknown",
        )
    ]


HANDLER = KindHandler(
    kind="assessment_report", payload_model=AssessmentReport, validate=validate_edit, commit=commit_report
)
