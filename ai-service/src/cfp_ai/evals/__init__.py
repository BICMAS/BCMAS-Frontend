"""Offline evaluation suites with measurable quality criteria (docs/ai/QA_REPORT.md §5).

Run with ``python -m cfp_ai.evals`` (exit code 1 if any metric misses its threshold).
"""

from cfp_ai.evals.runner import Metric, SuiteResult, run_all

__all__ = ["Metric", "SuiteResult", "run_all"]
