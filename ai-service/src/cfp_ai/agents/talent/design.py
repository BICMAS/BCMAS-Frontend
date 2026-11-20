"""T1 ``talent.draft_items`` — competency-based assessment design (draft → assessor review).

Supports eight methods: competency-based (multi-method), behavioural, situational judgement,
scenario-based, technical, leadership, self-assessment and manager assessment. The framework
supplies the competencies, proficiency bands and evaluation criteria (indicators). The model
writes objectives, questions, keyed options, look-fors, model answers and feedback, choosing
indicators only from the criteria. Design rules validate model output and every assessor
edit. Accepted designs are committed to the assessment library by the frontend (BE-065).
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Sequence
from dataclasses import replace
from typing import Any, Literal

from pydantic import BaseModel, Field

from cfp_ai.agents.base import Capability, RunContext
from cfp_ai.agents.catalogue import declared
from cfp_ai.agents.common import input_json_block, provenance
from cfp_ai.agents.steps import CommitInstruction, StepInput, StepOutput
from cfp_ai.agents.talent import scoring
from cfp_ai.agents.talent.models import (
    LIBRARY_TYPE,
    METHOD_CATEGORIES,
    METHOD_QUESTION_TYPES,
    RESPONDENT,
    AssessmentDesign,
    AssessmentQuestion,
    CompetencyRubric,
    QuestionFeedback,
    QuestionOption,
    QuestionType,
    RubricBand,
)
from cfp_ai.auth.principal import Principal
from cfp_ai.context.models import CapabilityContext
from cfp_ai.drafts.service import DraftEnvelope, DraftRecord, KindHandler
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.dto import SkillDTO
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.llm.types import LlmMessage, LlmRequest
from cfp_ai.schemas.public import ApprovalPolicy, ValidationIssue
from cfp_ai.validation.structured import generate_validated

SPEC = replace(
    declared("talent.draft_items"),
    implemented=True,
    required_endpoints=("BE-022",),
    optional_endpoints=("BE-041",),
)
ROUTE = "talent.draft_items"
PROMPT_VERSION = "talent.design@v1"
COMMIT_ENDPOINT = "BE-065"
DISCLAIMER = (
    "AI-drafted assessment design. It is used only after an assessor has reviewed and approved it; "
    "competencies, proficiency bands and criteria come from the organisation's framework."
)
EVIDENCE_POLICY = (
    "Only evidence submitted in responses counts: verbatim quotes, keyed option choices and observed "
    "examples. Ratings are compared with the evidence, never used as evidence. No inference about potential "
    "or personal attributes."
)
METHODS = tuple(METHOD_QUESTION_TYPES)
_PAST_EXPERIENCE = re.compile(
    r"\b(tell (?:us|me) about a time|describe a (?:time|situation|recent)|give an example|share an example|"
    r"think of a time|when have you)\b",
    re.IGNORECASE,
)
_RATING = re.compile(r"\b(rate|rating)\b", re.IGNORECASE)
_EXAMPLE = re.compile(r"\b(example|observed|evidence|instance)\b", re.IGNORECASE)

SYSTEM_PROMPT = """You are an occupational psychologist designing a competency-based assessment.
The organisation's framework already defines the competencies, proficiency bands and evaluation criteria
(indicators) in <input_json>.competencies; do not change them. Write:
- title and 1-4 assessment objectives;
- for EACH competency, between 1 and questions_per_competency questions of the allowed types:
  * behavioural: ask for a specific past example (e.g. "Tell us about a time..."), STAR-style;
  * situational_judgement: a realistic workplace dilemma with 3-5 options; key each option with a score 1-5
    (exactly one best option, at least one poor option scoring 1-2) and the indicator IDs it reflects;
  * scenario: a realistic case to analyse or act on; technical: a practical technical task. Both need a
    model_answer_outline;
  * self_rating / manager_rating: ask for a 1-5 proficiency rating AND a concrete work example observed;
- expected_indicator_ids: the criteria each question is designed to evidence (from that competency only),
  covering the target level;
- look_fors (observable evidence), evidence_required, feedback (strong / developing) and estimated_minutes.
Questions must be job-related, fair and free of bias. Never ask about or refer to personal characteristics,
potential, personality or circumstances, and never mention hiring, promotion or readiness decisions."""


class _Option(BaseModel):
    option_key: str = Field(max_length=8)
    text: str = Field(max_length=600)
    score: int = Field(ge=1, le=5)
    indicator_ids: list[str] = Field(default_factory=list)
    rationale: str = Field(max_length=400)


class _Feedback(BaseModel):
    strong: str = Field(max_length=600)
    developing: str = Field(max_length=600)


class _Question(BaseModel):
    question_key: str = Field(max_length=64)
    type: QuestionType
    skill_id: str
    prompt: str = Field(max_length=3000)
    options: list[_Option] | None = None
    expected_indicator_ids: list[str] = Field(min_length=1)
    look_fors: list[str] = Field(min_length=1, max_length=6)
    model_answer_outline: str | None = Field(default=None, max_length=2000)
    feedback: _Feedback
    evidence_required: str = Field(max_length=400)
    estimated_minutes: int = Field(ge=1, le=90)


class DesignLLM(BaseModel):
    title: str = Field(max_length=200)
    objectives: list[str] = Field(min_length=1, max_length=4)
    questions: list[_Question] = Field(min_length=1, max_length=24)


# ── design rules (generation and every assessor edit) ────────────────────────


def design_rules(questions: Sequence[Any], vctx: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    def issue(code: str, path: str, message: str) -> None:
        issues.append(ValidationIssue(code=code, path=path, message=message))

    competencies: dict[str, dict[str, Any]] = vctx["competencies"]
    allowed_types: list[str] = vctx["types"]
    per: int = vctx["questions_per_competency"]
    keys = [q.question_key for q in questions]
    covered: dict[str, set[str]] = {s: set() for s in competencies}
    counts: dict[str, int] = {s: 0 for s in competencies}
    for qi, q in enumerate(questions):
        path = f"questions[{qi}]"
        if keys.count(q.question_key) > 1:
            issue("duplicate", f"{path}.question_key", "question keys must be unique")
        if q.type not in allowed_types:
            issue(
                "wrong_type",
                f"{path}.type",
                f"{q.type} is not used by this method ({', '.join(allowed_types)})",
            )
        comp = competencies.get(q.skill_id)
        if comp is None:
            issue("unknown_id", f"{path}.skill_id", f"'{q.skill_id}' is not a competency of this assessment")
            continue
        counts[q.skill_id] += 1
        criteria: dict[str, int] = comp["criteria"]
        for ind in q.expected_indicator_ids:
            if ind not in criteria:
                issue(
                    "unknown_indicator",
                    f"{path}.expected_indicator_ids",
                    f"'{ind}' is not a criterion of {q.skill_id}",
                )
            else:
                covered[q.skill_id].add(ind)
        options = q.options or []
        if q.type == "situational_judgement":
            if not 3 <= len(options) <= 5:
                issue("invalid_options", f"{path}.options", "situational judgement needs 3-5 keyed options")
            okeys = [o.option_key for o in options]
            if len(okeys) != len(set(okeys)):
                issue("duplicate", f"{path}.options", "option keys must be unique")
            scores = [o.score for o in options]
            if scores and scores.count(max(scores)) != 1:
                issue("invalid_key", f"{path}.options", "exactly one option must be keyed best")
            if scores and min(scores) > 2:
                issue("invalid_key", f"{path}.options", "include at least one poor option (score 1-2)")
            for oi, o in enumerate(options):
                for ind in o.indicator_ids:
                    if ind not in criteria:
                        issue("unknown_indicator", f"{path}.options[{oi}]", f"'{ind}' is not a criterion")
                issues.extend(scoring.language_issues(o.text, f"{path}.options[{oi}].text"))
        elif options:
            issue(
                "unexpected_options", f"{path}.options", "only situational judgement questions have options"
            )
        if q.type == "behavioural" and not _PAST_EXPERIENCE.search(q.prompt):
            issue(
                "not_behavioural",
                f"{path}.prompt",
                "behavioural questions must ask for a specific past example",
            )
        if q.type in ("scenario", "technical") and not q.model_answer_outline:
            issue("missing_model_answer", f"{path}.model_answer_outline", "add a model answer outline")
        if q.type in ("self_rating", "manager_rating") and not (
            _RATING.search(q.prompt) and _EXAMPLE.search(q.prompt)
        ):
            issue("invalid_rating_item", f"{path}.prompt", "ask for a 1-5 rating and a concrete example")
        texts = [
            ("prompt", q.prompt),
            ("feedback.strong", q.feedback.strong),
            ("feedback.developing", q.feedback.developing),
        ]
        texts += [(f"look_fors[{i}]", t) for i, t in enumerate(q.look_fors)]
        for name, text in texts:
            issues.extend(scoring.language_issues(text, f"{path}.{name}"))
    for skill_id, comp in competencies.items():
        if counts[skill_id] == 0:
            issue("missing_competency", "questions", f"no question assesses {skill_id}")
        elif counts[skill_id] > per:
            issue("too_many_questions", "questions", f"{skill_id} has more than {per} question(s)")
        target = comp["target_level"]
        if counts[skill_id] and not any(comp["criteria"][i] == target for i in covered[skill_id]):
            issue(
                "target_level_not_covered", "questions", f"no question evidences {skill_id} at level {target}"
            )
    return issues


# ── capability ───────────────────────────────────────────────────────────────


def parse_args(args: dict[str, str]) -> dict[str, Any]:
    method = args.get("method", "competency_based")
    if method not in METHODS:
        raise AppError("invalid_request", f"method must be one of {', '.join(METHODS)}.")

    def number(name: str, default: int | None, low: int, high: int) -> int | None:
        raw = args.get(name, "")
        if raw == "":
            return default
        try:
            value = int(raw)
        except ValueError as exc:
            raise AppError("invalid_request", f"{name} must be a number.") from exc
        if not low <= value <= high:
            raise AppError("invalid_request", f"{name} must be between {low} and {high}.")
        return value

    return {
        "method": method,
        "skill_ids": [s for s in args.get("skill_ids", "").split(",") if s],
        "role_id": args.get("role_id") or None,
        "target_level": number("target_level", None, 1, 5),
        "questions_per_competency": number("questions_per_competency", 2, 1, 3),
    }


def rubric(skill: SkillDTO, target: int) -> CompetencyRubric:
    return CompetencyRubric(
        skill_id=skill.id,
        skill_name=skill.name,
        category=skill.category,
        target_level=target,
        bands=[
            RubricBand(
                level=lvl.level,
                label=lvl.label,
                descriptor=lvl.description or "; ".join(i.text for i in lvl.indicators),
                indicator_ids=[i.id for i in lvl.indicators],
            )
            for lvl in sorted(skill.levels, key=lambda x: x.level)
        ],
        criteria=scoring.select_criteria(skill, target),
    )


def validation_context(method: str, competencies: list[CompetencyRubric], per: int) -> dict[str, Any]:
    return {
        "method": method,
        "types": list(METHOD_QUESTION_TYPES[method]),
        "questions_per_competency": per,
        "competencies": {
            c.skill_id: {
                "target_level": c.target_level,
                "criteria": {k.criterion_id: k.level for k in c.criteria},
            }
            for c in competencies
        },
    }


class DesignAssessmentCapability(Capability[BaseModel, BaseModel]):
    spec = SPEC
    output_model = DraftEnvelope

    async def run_step(
        self, ctx: RunContext, step: StepInput, context: CapabilityContext | None
    ) -> StepOutput:
        if self.deps.drafts is None:
            raise AppError("ai_unavailable", internal_detail="draft service not configured")
        options = parse_args(step.args)
        method: str = options["method"]
        competencies, role_version = await self._competencies(ctx, options)
        per: int = options["questions_per_competency"]
        vctx = validation_context(method, competencies, per)
        facts = {
            "method": method,
            "allowed_question_types": vctx["types"],
            "questions_per_competency": per,
            "competencies": [
                {
                    "skill_id": c.skill_id,
                    "skill_name": c.skill_name,
                    "category": c.category,
                    "target_level": c.target_level,
                    "criteria": [
                        {"criterion_id": k.criterion_id, "level": k.level, "text": k.text} for k in c.criteria
                    ],
                }
                for c in competencies
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
            DesignLLM,
            [lambda out: design_rules(out.questions, vctx)],
            metrics=self.deps.metrics,
            deadline=ctx.deadline,
        )
        design = assemble(
            result.output, method, competencies, options["role_id"], role_version, result.report
        )
        envelope = self.deps.drafts.create(
            ctx.principal,
            kind="assessment_items",
            capability=SPEC.capability,
            subject_employee_id=None,
            payload=design,
            provenance=provenance(
                SPEC.capability, model=result.model, prompt_version=PROMPT_VERSION, context=None
            ),
            approval_policy=ApprovalPolicy(
                mode="role_approval",
                approver_roles=["hr_ld_admin"],
                commit_target="backend",
                commit_endpoint_id=COMMIT_ENDPOINT,
            ),
            disclaimer=DISCLAIMER,
            validation_context={**vctx, "fixed": [c.model_dump() for c in competencies]},
        )
        return StepOutput(
            summary=(
                f"Draft {method.replace('_', ' ')} assessment: {len(design.questions)} question(s) across "
                f"{len(competencies)} competency(ies); awaiting assessor review."
            ),
            output_type="DraftEnvelope",
            data=envelope.model_dump(mode="json"),
        )

    async def _competencies(
        self, ctx: RunContext, options: dict[str, Any]
    ) -> tuple[list[CompetencyRubric], str | None]:
        backend = self.deps.backend
        targets: dict[str, int] = {}
        role_version: str | None = None
        try:
            if options["role_id"]:
                profile = await backend.get_role_profile(ctx.principal, options["role_id"])
                role_version = profile.version
                required = {r.skill_id: r.required_level for r in profile.requirements}
                wanted = options["skill_ids"] or list(required)
                unknown = [s for s in wanted if s not in required]
                if unknown:
                    raise AppError("invalid_request", "Competencies must be requirements of the role.")
                targets = {s: options["target_level"] or required[s] for s in wanted}
            elif options["skill_ids"]:
                targets = {s: options["target_level"] or 3 for s in options["skill_ids"]}
            else:
                raise AppError("invalid_request", "Give a role_id or skill_ids to assess.")
            skills = await asyncio.gather(*(backend.get_skill(ctx.principal, s) for s in targets))
        except BackendError as exc:
            raise exc.to_app_error() from exc
        allowed = METHOD_CATEGORIES.get(options["method"])
        chosen = [s for s in skills if allowed is None or s.category in allowed]
        if not chosen:
            raise AppError(
                "precondition_failed",
                f"No {', '.join(sorted(allowed or []))} competencies to assess with this method.",
            )
        return [rubric(s, targets[s.id]) for s in chosen[:6]], role_version


def assemble(
    draft: DesignLLM,
    method: str,
    competencies: list[CompetencyRubric],
    role_id: str | None,
    role_version: str | None,
    report: Any,
) -> AssessmentDesign:
    targets = {c.skill_id: c.target_level for c in competencies}
    questions = [
        AssessmentQuestion(
            question_key=q.question_key,
            type=q.type,
            respondent=RESPONDENT.get(q.type, "subject"),
            skill_id=q.skill_id,
            target_level=targets[q.skill_id],
            prompt=q.prompt,
            options=[QuestionOption(**o.model_dump()) for o in q.options] if q.options else None,
            expected_indicator_ids=q.expected_indicator_ids,
            look_fors=q.look_fors,
            model_answer_outline=q.model_answer_outline,
            feedback=QuestionFeedback(**q.feedback.model_dump()),
            evidence_required=q.evidence_required,
            estimated_minutes=q.estimated_minutes,
        )
        for q in draft.questions
    ]
    return AssessmentDesign(
        method=method,
        title=draft.title,
        objectives=draft.objectives,
        role_id=role_id,
        role_profile_version=role_version,
        competencies=competencies,
        questions=questions,
        rating_scale=[b.model_copy(update={"indicator_ids": []}) for b in competencies[0].bands],
        scoring_method=scoring.SCORING_RULE_TEXT,
        evidence_policy=EVIDENCE_POLICY,
        total_minutes=sum(q.estimated_minutes for q in questions),
        validation=report,
    )


# ── draft kind handler ───────────────────────────────────────────────────────


def validate_edit(model: BaseModel, vctx: dict[str, Any]) -> list[ValidationIssue]:
    assert isinstance(model, AssessmentDesign)
    issues = design_rules(model.questions, vctx)
    if model.method != vctx["method"]:
        issues.append(
            ValidationIssue(code="fixed_field", path="method", message="the method cannot be changed")
        )
    if [c.model_dump() for c in model.competencies] != vctx["fixed"]:
        issues.append(
            ValidationIssue(
                code="fixed_field",
                path="competencies",
                message="competencies and criteria come from the framework",
            )
        )
    for qi, q in enumerate(model.questions):
        comp = vctx["competencies"].get(q.skill_id)
        if comp is not None and q.target_level != comp["target_level"]:
            issues.append(
                ValidationIssue(code="fixed_field", path=f"questions[{qi}].target_level", message="fixed")
            )
        if q.respondent != RESPONDENT.get(q.type, "subject"):
            issues.append(
                ValidationIssue(code="fixed_field", path=f"questions[{qi}].respondent", message="fixed")
            )
    return issues


def commit_design(
    record: DraftRecord, model: BaseModel, principal: Principal, source: Literal["ai", "ai_edited"]
) -> list[CommitInstruction]:
    """BE-065 POST /talent/library — one library item per question, executed by the frontend."""
    assert isinstance(model, AssessmentDesign)
    rubrics = {c.skill_id: c for c in model.competencies}
    instructions = []
    for q in model.questions:
        comp = rubrics[q.skill_id]
        instructions.append(
            CommitInstruction(
                endpoint_id=COMMIT_ENDPOINT,
                method="POST",
                path="/talent/library",
                body={
                    "type": LIBRARY_TYPE[q.type],
                    "title": f"{comp.skill_name}: {q.question_key}",
                    "stem": q.prompt,
                    "skill_ids": [q.skill_id],
                    "target_level": q.target_level,
                    "respondent": q.respondent,
                    "expected_indicator_ids": q.expected_indicator_ids,
                    "options": [o.model_dump() for o in q.options] if q.options else None,
                    "marking_guide": [
                        {"level": b.level, "descriptor": b.descriptor, "indicator_ids": b.indicator_ids}
                        for b in comp.bands
                        if any(c.level == b.level for c in comp.criteria)
                    ],
                    "look_fors": q.look_fors,
                    "model_answer_outline": q.model_answer_outline,
                    "feedback": q.feedback.model_dump(),
                    "estimated_minutes": q.estimated_minutes,
                    "reusable_role_ids": [model.role_id] if model.role_id else [],
                    "source": {
                        "type": source,
                        "draft_id": record.draft.draft_id,
                        "model": record.draft.provenance.model,
                        "prompt_version": record.draft.provenance.prompt_version,
                    },
                },
                endpoint_status="unknown",
            )
        )
    return instructions


HANDLER = KindHandler(
    kind="assessment_items", payload_model=AssessmentDesign, validate=validate_edit, commit=commit_design
)
