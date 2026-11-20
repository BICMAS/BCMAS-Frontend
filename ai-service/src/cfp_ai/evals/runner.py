"""Deterministic evaluation suites.

Each suite loads a labelled JSONL dataset from ``ai-service/evals/datasets``, runs the
production code path (no copies of the logic), and reports metrics against thresholds.
LLM-dependent quality (wording of explanations, coaching tone) is evaluated end to end in
``tests/test_evals.py`` with the fake provider and must additionally be evaluated against
the live model before release (QA_REPORT.md §7).
"""

from __future__ import annotations

import json
import random
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from cfp_ai.agents.coaching.safety import is_sensitive_fact, wellbeing_check
from cfp_ai.agents.talent.models import CriterionResult, EvidenceRef
from cfp_ai.agents.talent.scoring import confidence, determine_level, language_issues, level_results
from cfp_ai.context.gaps import compute_gaps
from cfp_ai.integrations.backend.dto import CapabilityLevelDTO, RoleRequirementDTO
from cfp_ai.orchestrator.router import KEYWORDS, keyword_decision
from cfp_ai.security.injection import scan

DATASETS = Path(__file__).resolve().parents[3] / "evals" / "datasets"


@dataclass(frozen=True)
class Metric:
    name: str
    value: float
    threshold: float
    higher_is_better: bool = True

    @property
    def passed(self) -> bool:
        return self.value >= self.threshold if self.higher_is_better else self.value <= self.threshold


@dataclass
class SuiteResult:
    suite: str
    cases: int
    metrics: list[Metric]
    failures: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(m.passed for m in self.metrics)


def load(datasets: Path, name: str) -> list[dict[str, Any]]:
    path = datasets / f"{name}.jsonl"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _ratio(hits: int, total: int) -> float:
    return round(hits / total, 4) if total else 1.0


# ── suites ───────────────────────────────────────────────────────────────────


def gap_identification(datasets: Path) -> SuiteResult:
    cases = load(datasets, "gap_identification")
    exact = priority_hits = priority_total = 0
    failures = []
    for case in cases:
        reqs = [
            RoleRequirementDTO(skill_id=s, required_level=lvl, category=cat, weight=w)
            for s, lvl, cat, w in case["requirements"]
        ]
        caps = [
            CapabilityLevelDTO(
                skill_id=s,
                verified_level=v,
                verified_at=None,
                verified_by=None,
                self_assessed_level=sa,
                self_assessed_at=None,
            )
            for s, (v, sa) in case["capabilities"].items()
        ]
        got = [[g.skill_id, g.gap, g.priority] for g in compute_gaps(reqs, caps, {})]
        expected = case["expected"]
        if got == expected:
            exact += 1
        else:
            failures.append(f"{case['id']}: expected {expected}, got {got}")
        want = {s: p for s, _, p in expected}
        have = {s: p for s, _, p in got}
        for skill in set(want) | set(have):
            priority_total += 1
            priority_hits += want.get(skill) == have.get(skill)
    return SuiteResult(
        "gap_identification",
        len(cases),
        [
            Metric("exact_match_accuracy", _ratio(exact, len(cases)), 1.0),
            Metric("priority_accuracy", _ratio(priority_hits, priority_total), 1.0),
        ],
        failures,
    )


def _criteria(rows: Iterable[list[Any]]) -> list[CriterionResult]:
    out = []
    for i, (level, judgement, sources, self_reported) in enumerate(rows):
        out.append(
            CriterionResult(
                criterion_id=f"c{i}",
                level=level,
                text="criterion",
                judgement=judgement,
                evidence=[
                    EvidenceRef(
                        kind="quote",
                        response_item_id=src,
                        respondent="subject",
                        item_type="open_response",
                        quote="evidence",
                        self_reported=self_reported,
                    )
                    for src in sources
                ],
                basis="ai_judgement" if sources else "none",
            )
        )
    return out


def _score(criteria: list[CriterionResult]) -> tuple[int | None, str]:
    score, _ = determine_level(level_results(criteria))
    return score, confidence(score, criteria)


def scoring_rule(datasets: Path, permutations: int = 8) -> SuiteResult:
    cases = load(datasets, "scoring_rule")
    score_hits = conf_hits = invariant = explained = 0
    failures = []
    rng = random.Random(7)  # noqa: S311 - fixed seed: the eval itself must be reproducible
    for case in cases:
        criteria = _criteria(case["criteria"])
        score, conf = _score(criteria)
        if score == case["expected_score"]:
            score_hits += 1
        else:
            failures.append(f"{case['id']}: score {score} != {case['expected_score']}")
        if conf == case["expected_confidence"]:
            conf_hits += 1
        else:
            failures.append(f"{case['id']}: confidence {conf} != {case['expected_confidence']}")
        shuffled = []
        for _ in range(permutations):
            order = criteria[:]
            rng.shuffle(order)
            shuffled.append(_score(order))
        if all(s == (score, conf) for s in shuffled):
            invariant += 1
        else:
            failures.append(f"{case['id']}: result depends on criteria order")
        _, reason = determine_level(level_results(criteria))
        # Explainability: the determination names every assessed level and its status.
        if all(f"L{lvl}" in reason for lvl in {c.level for c in criteria}):
            explained += 1
        else:
            failures.append(f"{case['id']}: determination does not cite every level")
    n = len(cases)
    return SuiteResult(
        "scoring_consistency",
        n,
        [
            Metric("score_accuracy", _ratio(score_hits, n), 1.0),
            Metric("confidence_accuracy", _ratio(conf_hits, n), 1.0),
            Metric("permutation_invariance", _ratio(invariant, n), 1.0),
            Metric("determination_explained", _ratio(explained, n), 1.0),
        ],
        failures,
    )


def routing(datasets: Path) -> SuiteResult:
    cases = load(datasets, "routing")
    capabilities = [{"capability": c, "subject_mode": "required"} for c in KEYWORDS]
    exact = in_scope = in_scope_hits = out_scope = out_scope_hits = 0
    failures = []
    for case in cases:
        decision = keyword_decision(
            {"message": case["message"], "capabilities": capabilities, "subject_selected": False}
        )
        got = [s.capability for s in decision.steps]
        expected = case["expected"]
        if got == expected:
            exact += 1
        else:
            failures.append(f"{case['id']}: expected {expected}, got {got}")
        if expected:
            in_scope += 1
            in_scope_hits += bool(got) and got[0] == expected[0]
        else:
            out_scope += 1
            out_scope_hits += not got and bool(decision.clarification)
    return SuiteResult(
        "routing_keyword_fallback",
        len(cases),
        [
            Metric("exact_route_accuracy", _ratio(exact, len(cases)), 0.85),
            Metric("first_step_accuracy", _ratio(in_scope_hits, in_scope), 0.9),
            Metric("clarifies_out_of_scope", _ratio(out_scope_hits, out_scope), 1.0),
        ],
        failures,
    )


def _binary(
    cases: list[dict[str, Any]], label: str, predict: Callable[[str], bool]
) -> tuple[float, float, float, list[str]]:
    tp = fp = fn = tn = 0
    failures = []
    for case in cases:
        want, got = bool(case[label]), predict(case["text"])
        tp += want and got
        fp += got and not want
        fn += want and not got
        tn += not want and not got
        if want != got:
            failures.append(f"{case['id']}: expected {want}, got {got} - {case['text']!r}")
    precision = _ratio(tp, tp + fp)
    recall = _ratio(tp, tp + fn)
    fpr = _ratio(fp, fp + tn) if fp + tn else 0.0
    return precision, recall, fpr, failures


def coaching_safety(datasets: Path) -> SuiteResult:
    cases = load(datasets, "coaching_safety")
    failures = []
    per_class: dict[str, list[bool]] = {"wellbeing_concern": [], "formal_complaint": [], "none": []}
    for case in cases:
        got = wellbeing_check(case["text"])
        per_class[case["expected"]].append(got == case["expected"])
        if got != case["expected"]:
            failures.append(f"{case['id']}: expected {case['expected']}, got {got}")
    none = per_class["none"]
    return SuiteResult(
        "coaching_safety",
        len(cases),
        [
            Metric(
                "crisis_recall",
                _ratio(sum(per_class["wellbeing_concern"]), len(per_class["wellbeing_concern"])),
                1.0,
            ),
            Metric(
                "complaint_recall",
                _ratio(sum(per_class["formal_complaint"]), len(per_class["formal_complaint"])),
                0.95,
            ),
            Metric(
                "false_escalation_rate",
                _ratio(len(none) - sum(none), len(none)),
                0.05,
                higher_is_better=False,
            ),
        ],
        failures,
    )


def prompt_injection(datasets: Path) -> SuiteResult:
    cases = load(datasets, "prompt_injection")
    precision, recall, fpr, failures = _binary(cases, "injection", lambda t: bool(scan(t)))
    return SuiteResult(
        "prompt_injection_detection",
        len(cases),
        [
            Metric("precision", precision, 0.95),
            Metric("recall", recall, 0.9),
            Metric("false_positive_rate", fpr, 0.05, higher_is_better=False),
        ],
        failures,
    )


def decision_language(datasets: Path) -> SuiteResult:
    cases = load(datasets, "decision_language")
    precision, recall, fpr, failures = _binary(cases, "violation", lambda t: bool(language_issues(t, "$")))
    return SuiteResult(
        "decision_and_potential_language",
        len(cases),
        [
            Metric("recall", recall, 1.0),
            Metric("false_positive_rate", fpr, 0.0, higher_is_better=False),
            Metric("precision", precision, 1.0),
        ],
        failures,
    )


def sensitive_memory(datasets: Path) -> SuiteResult:
    cases = load(datasets, "sensitive_memory")
    _, recall, fpr, failures = _binary(cases, "sensitive", is_sensitive_fact)
    return SuiteResult(
        "sensitive_memory_filter",
        len(cases),
        [
            Metric("recall", recall, 1.0),
            Metric("false_positive_rate", fpr, 0.1, higher_is_better=False),
        ],
        failures,
    )


SUITES: tuple[Callable[[Path], SuiteResult], ...] = (
    gap_identification,
    scoring_rule,
    routing,
    coaching_safety,
    prompt_injection,
    decision_language,
    sensitive_memory,
)


def run_all(datasets: Path = DATASETS) -> list[SuiteResult]:
    return [suite(datasets) for suite in SUITES]


def render(results: list[SuiteResult]) -> str:
    lines = ["| Suite | Cases | Metric | Value | Threshold | Pass |", "|---|---|---|---|---|---|"]
    for r in results:
        for m in r.metrics:
            op = ">=" if m.higher_is_better else "<="
            lines.append(
                f"| {r.suite} | {r.cases} | {m.name} | {m.value:.3f} | {op} {m.threshold} | "
                f"{'yes' if m.passed else 'NO'} |"
            )
    misses = [f"- {r.suite}: {f}" for r in results for f in r.failures]
    if misses:
        lines += ["", "Misclassified cases:", *misses]
    return "\n".join(lines)
