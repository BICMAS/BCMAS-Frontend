"""T3 ``talent.recommend_scores`` — assessment response evaluation and evidence-based scoring.

For every rubric row (competency) the agent evaluates all relevant responses: open text,
keyed situational-judgement choices and self/manager assessments. It then determines a
proficiency level with a deterministic rule over framework criteria (``scoring.py``), so every
score is traceable to defined criteria and verbatim evidence.

Governance (AI_TECHNICAL_SPEC.md §5.3, §14.7):
  * blind: response text is redacted and the subject's name masked; no identity is sent;
  * evidence is only what the participant (or their manager) submitted; quotes are verified
    verbatim; no potential or personal attributes are inferred (validated);
  * never a readiness band or hiring/promotion decision (validated);
  * per-item assessor review is required; the approved result is a commit plan (BE-063,
    PROPOSED) — nothing is written by the AI service;
  * only *reviewed* results are shared with the Development Plan and Coaching agents.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import replace
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel
from ulid import ULID

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.common import input_json_block, provenance
from cfp_ai.agents.steps import (
    ApprovalDecisionInput,
    ApprovalItem,
    ApprovalRequestSpec,
    CommitInstruction,
    HandoffRequest,
    ReviewOutcome,
    StepInput,
    StepOutput,
)
from cfp_ai.agents.talent import scoring
from cfp_ai.agents.talent.models import (
    AssessmentEvaluation,
    CompetencyScore,
    EvidenceRef,
    ReviewedEvaluation,
    ReviewedRow,
)
from cfp_ai.context.models import CapabilityContext
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.dto import (
    AssessmentItemDTO,
    AssessmentResponseDTO,
    SkillDTO,
    TalentAssessmentDTO,
)
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.llm.types import LlmMessage, LlmRequest
from cfp_ai.observability.context import principal_hash
from cfp_ai.observability.logging import redact
from cfp_ai.schemas.public import ApprovalPolicy, ContextGap
from cfp_ai.validation.structured import generate_validated

SPEC = replace(declared("talent.recommend_scores"), implemented=True, optional_endpoints=("BE-068", "BE-010"))
ROUTE = "talent.score_row"
PROMPT_VERSION = "talent.score_row@v2"
COMMIT_ENDPOINT = "BE-063"
DISCLAIMER = (
    "AI-recommended scores for assessor consideration, derived from framework criteria and the submitted "
    "evidence only. Each score requires an assessor decision; hiring and promotion decisions are made by "
    "authorised people."
)
_SCOREABLE_STATUSES = frozenset({"submitted", "awaiting_review", "completed", "reviewed"})
_DEVELOPMENT_TYPES = frozenset({"promotion", "development"})

SYSTEM_PROMPT = """You assist a trained assessor. For ONE competency, judge each evaluation criterion
(a framework indicator) against the participant's responses. The participant is anonymous.

For every criterion in <input_json>.criteria return exactly one judgement:
- met: the responses clearly show the behaviour described;
- partial: some but not all of it is shown, or it is shown only in a limited way;
- not_met: the responses address it but show it is not (yet) done;
- not_evidenced: the responses do not address it.
met and partial need 1-3 quotes copied VERBATIM from the responses, each with its response_item_id;
not_evidenced has no quotes. Use only evidence in the responses: never assume, never fill gaps, and never
infer potential, personality or personal attributes. Self-assessment text is the participant's own claim.
Write a rationale (max 120 words) about the evidence and criteria, not the person. Do not give a score, a
readiness view, or a hiring or promotion recommendation."""


class RecommendScoresCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = AssessmentEvaluation

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        assessment_id = step.args.get("assessment_id")
        if not assessment_id:
            raise AppError("invalid_request", "assessment_id is required.")
        backend = self.deps.backend
        try:
            assessment, responses = await asyncio.gather(
                backend.get_assessment(ctx.principal, assessment_id),
                backend.get_assessment_responses(ctx.principal, assessment_id),
            )
        except BackendError as exc:
            raise exc.to_app_error() from exc
        if assessment.status not in _SCOREABLE_STATUSES:
            raise AppError("precondition_failed", "The assessment has not been submitted yet.")
        if not responses:
            raise AppError("precondition_failed", "The assessment has no responses to evaluate.")
        wanted = set(step.args.get("rubric_row_ids", "").split(",")) - {""}
        rows = [r for r in assessment.rubric if not wanted or r.row_id in wanted]
        if not rows:
            raise AppError("invalid_request", "No rubric rows match the request.")
        gaps: list[ContextGap] = []
        items = await self._items(ctx, assessment_id, gaps)
        mask = await self._name_mask(ctx, assessment)
        skill_ids = sorted({r.skill_id for r in rows})
        try:
            skills = dict(
                zip(
                    skill_ids,
                    await asyncio.gather(*(backend.get_skill(ctx.principal, s) for s in skill_ids)),
                    strict=True,
                )
            )
        except BackendError as exc:
            raise exc.to_app_error() from exc
        inputs = [self._row_inputs(row, skills[row.skill_id], items, responses, mask) for row in rows]
        if not any(i.texts or i.keyed_judgements or i.ratings for i in inputs):
            raise AppError("precondition_failed", "The responses do not relate to the rubric competencies.")
        judged = await asyncio.gather(*(self._judge(ctx, i) for i in inputs))
        scores = [scoring.competency_score(i, j) for i, (j, _) in zip(inputs, judged, strict=True)]
        model = next((m for _, m in judged if m != "none"), "none")
        evaluation = AssessmentEvaluation(
            scoring_set_id=f"scs_{ULID()}",
            assessment_id=assessment.id,
            assessment_type=assessment.type,
            rubric_version=assessment.rubric_version,
            objectives=assessment.objectives,
            methods=sorted({i.type for i in items.values()} | {r.item_type for r in responses}),
            scoring_rule=scoring.SCORING_RULE_TEXT,
            recommendations=scores,
            approval_policy=ApprovalPolicy(
                mode="per_item_review",
                approver_roles=["hr_ld_admin"],
                commit_target="backend",
                commit_endpoint_id=COMMIT_ENDPOINT,
            ),
            provenance=provenance(
                SPEC.capability, model=model, prompt_version=PROMPT_VERSION, context=None, extra_gaps=gaps
            ),
            disclaimer=DISCLAIMER,
        )
        undetermined = sum(s.recommended_score is None for s in scores)
        approval = ApprovalRequestSpec(
            mode="per_item_review",
            approver_roles=["hr_ld_admin"],
            summary=(
                f"Review evidence-based scores for {len(scores)} competency(ies)"
                + (f"; {undetermined} need an assessor judgement" if undetermined else "")
                + "."
            ),
            items=[
                ApprovalItem(
                    item_id=s.rubric_row_id,
                    label=f"{s.skill_name} (required level {s.required_level})",
                    proposal={
                        "recommended_score": s.recommended_score,
                        "confidence": s.confidence,
                        "determination": s.determination,
                        "indicators_met": s.indicators_met,
                        "indicators_missing": s.indicators_missing,
                        "rating_claims": [c.model_dump() for c in s.rating_claims],
                    },
                )
                for s in scores
            ],
            commit_endpoint_id=COMMIT_ENDPOINT,
        )
        return StepOutput(
            summary=(
                f"Evidence-based scores for {len(scores)} competency(ies) from {len(responses)} response(s); "
                "assessor review required."
            ),
            output_type="AssessmentEvaluation",
            data=evaluation.model_dump(mode="json"),
            approval=approval,
            metadata={
                "assessment_type": assessment.type,
                "subject": assessment.subject.model_dump(),
                "role_id": assessment.role_id,
            },
        )

    # ── evidence assembly ────────────────────────────────────────────────

    async def _items(
        self, ctx: RunContext, assessment_id: str, gaps: list[ContextGap]
    ) -> dict[str, AssessmentItemDTO]:
        """BE-068 (PROPOSED): without it, open responses are still judged; keyed SJT scoring is skipped."""
        try:
            items = await self.deps.backend.get_assessment_items(ctx.principal, assessment_id)
        except BackendError as exc:
            gaps.append(
                ContextGap(
                    slice="framework",
                    reason="backend_unconfirmed" if exc.kind == "not_callable" else "upstream_error",
                )
            )
            return {}
        return {i.library_item_id: i for i in items}

    async def _name_mask(self, ctx: RunContext, assessment: TalentAssessmentDTO) -> re.Pattern[str] | None:
        """Blind scoring: mask an employee subject's name in responses (e.g. in manager comments)."""
        if assessment.subject.type != "employee":
            return None
        try:
            employee = await self.deps.backend.get_employee(ctx.principal, assessment.subject.id)
        except BackendError:
            return None
        parts = [re.escape(p) for p in employee.name.split() if len(p) > 1]
        return re.compile(r"\b(" + "|".join(parts) + r")\b", re.IGNORECASE) if parts else None

    @staticmethod
    def _row_inputs(
        row: Any,
        skill: SkillDTO,
        items: dict[str, AssessmentItemDTO],
        responses: list[AssessmentResponseDTO],
        mask: re.Pattern[str] | None,
    ) -> scoring.RowInputs:
        related = [i for i in items.values() if row.skill_id in i.skill_ids]
        criteria = scoring.select_criteria(
            skill, row.required_level, (ind for i in related for ind in i.expected_indicator_ids)
        )
        levels = {c.criterion_id: c.level for c in criteria}
        inputs = scoring.RowInputs(row=row, skill=skill, criteria=criteria)
        for response in sorted(responses, key=lambda r: r.item_id):
            item = items.get(response.library_item_id)
            if item is not None and row.skill_id not in item.skill_ids:
                continue  # the item evidences other competencies
            if response.selected_option_key and item is not None and item.options:
                for ind, (judgement, ref) in scoring.keyed_judgements(
                    item, response.item_id, response.selected_option_key, levels
                ).items():
                    current = inputs.keyed_judgements.get(ind)
                    if current is None or scoring._RANK[judgement] > scoring._RANK[current[0]]:
                        inputs.keyed_judgements[ind] = (judgement, ref)
                inputs.keyed.append(
                    EvidenceRef(
                        kind="keyed_option",
                        response_item_id=response.item_id,
                        respondent=response.respondent,
                        item_type=response.item_type,
                        option_key=response.selected_option_key,
                        option_score=next(
                            (o.score for o in item.options if o.option_key == response.selected_option_key),
                            None,
                        ),
                    )
                )
            if response.rating is not None and response.item_type in (
                "self_assessment",
                "manager_assessment",
            ):
                inputs.ratings.append((response.respondent, response.item_id, response.rating))
            if response.response_text:
                text = redact(response.response_text)
                if mask is not None:
                    text = mask.sub("the employee", text)
                inputs.texts.append(
                    scoring.ResponseText(
                        response_item_id=response.item_id,
                        respondent=response.respondent,
                        item_type=response.item_type,
                        question=item.stem if item else "",
                        text=text,
                    )
                )
        return inputs

    async def _judge(
        self, ctx: RunContext, inputs: scoring.RowInputs
    ) -> tuple[scoring.RowJudgement | None, str]:
        if not inputs.texts:
            return None, "none"
        facts = {
            "competency": {
                "skill_id": inputs.skill.id,
                "skill_name": inputs.skill.name,
                "required_level": inputs.row.required_level,
            },
            "criteria": [
                {"criterion_id": c.criterion_id, "level": c.level, "text": c.text} for c in inputs.criteria
            ],
            "responses": [
                {
                    "response_item_id": t.response_item_id,
                    "respondent": t.respondent,
                    "item_type": t.item_type,
                    "question": t.question,
                    "text": t.text,
                }
                for t in inputs.texts
            ],
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
            scoring.RowJudgement,
            [scoring.judgement_validator(inputs.criteria, inputs.texts)],
            metrics=self.deps.metrics,
            deadline=ctx.deadline,
        )
        return result.output, result.model

    # ── assessor review ──────────────────────────────────────────────────

    def apply_review(
        self, ctx: RunContext, output: StepOutput, decision: ApprovalDecisionInput
    ) -> ReviewOutcome:
        evaluation = AssessmentEvaluation.model_validate(output.data)
        if decision.decision == "reject":
            return ReviewOutcome(
                status="rejected",
                data={"scoring_set": output.data, "reviews": [], "comment": decision.comment},
            )
        by_row = {s.rubric_row_id: s for s in evaluation.recommendations}
        decided = {item.item_id: item for item in decision.items}
        missing, unknown = sorted(set(by_row) - set(decided)), sorted(set(decided) - set(by_row))
        if missing or unknown:
            raise AppError(
                "invalid_request",
                "Every rubric row needs exactly one decision.",
                internal_detail=f"missing={missing} unknown={unknown}",
            )
        rows: list[ReviewedRow] = []
        commit_plan: list[CommitInstruction] = []
        any_override = False
        for row_id, rec in by_row.items():
            item = decided[row_id]
            final: int | None
            if item.decision == "overridden":
                if item.value is None or not 1 <= item.value <= 5:
                    raise AppError("invalid_request", f"An overridden score for {row_id} must be 1-5.")
                if not item.comment:
                    raise AppError("invalid_request", f"Explain the override for {row_id} in a comment.")
                final, any_override = item.value, True
                source = "ai_overridden" if rec.recommended_score is not None else "human"
            else:
                final, source = rec.recommended_score, "ai_accepted"
            rows.append(
                ReviewedRow(
                    rubric_row_id=row_id,
                    skill_id=rec.skill_id,
                    decision=item.decision,
                    recommended_score=rec.recommended_score,
                    final_score=final,
                    comment=item.comment,
                )
            )
            if final is None:
                continue  # accepted "no demonstrated level": nothing to commit for this row
            commit_plan.append(
                CommitInstruction(
                    endpoint_id=COMMIT_ENDPOINT,
                    method="PATCH",
                    path=f"/talent/assessments/{evaluation.assessment_id}/rubric/{row_id}",
                    body={
                        "score": final,
                        "score_source": source,
                        "ai_scoring_set_id": evaluation.scoring_set_id,
                        "scoring_rule": scoring.SCORING_RULE,
                        "criteria_met": rec.indicators_met,
                        "reviewer_id": ctx.principal.subject,
                        "comment": item.comment,
                    },
                    endpoint_status="unknown",  # filled in by the orchestrator from the endpoint registry
                )
            )
        subject = output.metadata.get("subject") or {}
        if self.deps.talent_results is not None:
            self.deps.talent_results.save_reviewed(
                ctx.principal.tenant_id,
                ReviewedEvaluation(
                    assessment_id=evaluation.assessment_id,
                    scoring_set_id=evaluation.scoring_set_id,
                    subject_type=str(subject.get("type", "")),
                    subject_id=str(subject.get("id", "")),
                    role_id=output.metadata.get("role_id"),
                    reviewed_at=datetime.now(UTC),
                    reviewer_hash=principal_hash(ctx.principal.subject),
                    rows=rows,
                    evaluation=evaluation,
                ),
            )
        status: Literal["approved", "modified"] = (
            "modified" if any_override or decision.decision == "modify" else "approved"
        )
        reviews = [
            {
                "rubric_row_id": r.rubric_row_id,
                "decision": r.decision,
                "final_score": r.final_score,
                "comment": r.comment,
            }
            for r in rows
        ]
        return ReviewOutcome(
            status=status,
            data={"scoring_set": output.data, "reviews": reviews, "comment": decision.comment},
            commit_plan=commit_plan,
            handoffs=share_results(output, by_row, rows),
        )


def share_results(
    output: StepOutput, by_row: dict[str, CompetencyScore], rows: list[ReviewedRow]
) -> list[HandoffRequest]:
    """``talent.assessment_reported`` → Development Plan and Coaching agents (validated results only).

    Only for employee subjects of promotion/development assessments, and only reviewer-confirmed
    scores below the required level. This is evidence for development, never a readiness decision.
    """
    subject = output.metadata.get("subject") or {}
    if output.metadata.get("assessment_type") not in _DEVELOPMENT_TYPES or subject.get("type") != "employee":
        return []
    below = {
        by_row[r.rubric_row_id].skill_id: r.final_score
        for r in rows
        if r.final_score is not None and r.final_score < by_row[r.rubric_row_id].required_level
    }
    if not below:
        return []
    required = {s.skill_id: s.required_level for s in by_row.values()}
    assessment_id = output.data.get("assessment_id")
    names = ", ".join(sorted(s.skill_name for s in by_row.values() if s.skill_id in below))
    return [
        HandoffRequest(
            type="talent.assessment_reported",
            target_capability="dev_plan.draft_plan",
            subject_employee_id=subject["id"],
            title="Draft a development plan from assessment evidence",
            detail=f"{len(below)} skill(s) scored below the role requirement in a reviewed assessment.",
            payload={
                "assessment_id": assessment_id,
                "role_id": output.metadata.get("role_id"),
                "development_skill_ids": sorted(below),
                "confirmed_scores": below,
            },
        ),
        HandoffRequest(
            type="talent.assessment_reported",
            target_capability="coaching.recommend_scenarios",
            subject_employee_id=subject["id"],
            title="Practise competencies from a reviewed assessment",
            detail=f"Coaching practice for: {names}.",
            payload={
                "assessment_id": assessment_id,
                "skill_ids": sorted(below),
                "target_levels": {s: required[s] for s in below},
            },
        ),
    ]
