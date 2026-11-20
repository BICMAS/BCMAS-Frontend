"""Prometheus metrics (AI_TECHNICAL_SPEC.md §13.3).

A dedicated registry per application instance keeps tests isolated.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram


@dataclass
class Metrics:
    registry: CollectorRegistry = field(default_factory=CollectorRegistry)

    def __post_init__(self) -> None:
        r = self.registry
        self.requests = Counter(
            "ai_requests_total", "HTTP requests", ["route", "status_code", "error_code"], registry=r
        )
        self.request_duration = Histogram(
            "ai_request_duration_seconds", "HTTP request duration", ["route"], registry=r
        )
        self.llm_tokens = Counter("ai_llm_tokens_total", "LLM tokens", ["route", "model", "kind"], registry=r)
        self.llm_cost = Counter(
            "ai_llm_cost_usd_total", "Estimated LLM cost (USD)", ["tenant", "route"], registry=r
        )
        self.llm_calls = Counter(
            "ai_llm_calls_total", "LLM calls", ["route", "provider", "outcome"], registry=r
        )
        self.llm_latency = Histogram(
            "ai_llm_latency_seconds", "LLM call latency", ["route", "provider"], registry=r
        )
        self.llm_budget_used = Gauge(
            "ai_llm_budget_used_ratio", "Share of the monthly token budget used", ["tenant"], registry=r
        )
        self.llm_budget_rejections = Counter(
            "ai_llm_budget_rejections_total", "LLM calls refused by the token budget", ["tenant"], registry=r
        )
        self.llm_unpriced_calls = Counter(
            "ai_llm_unpriced_calls_total", "LLM calls on a model without a price entry", ["model"], registry=r
        )
        self.maintenance_runs = Counter(
            "ai_maintenance_runs_total", "Scheduled maintenance job runs", ["job", "outcome"], registry=r
        )
        self.unhandled_exceptions = Counter(
            "ai_unhandled_exceptions_total", "Unhandled exceptions (bugs)", ["type"], registry=r
        )
        self.llm_refusals = Counter(
            "ai_llm_refusals_total", "LLM refusals", ["route", "category"], registry=r
        )
        self.validation_repairs = Counter(
            "ai_validation_repairs_total", "Structured output repairs", ["schema"], registry=r
        )
        self.output_invalid = Counter(
            "ai_output_invalid_total", "Outputs invalid after repairs", ["schema"], registry=r
        )
        self.backend_requests = Counter(
            "ai_backend_requests_total", "Backend calls", ["endpoint_id", "status"], registry=r
        )
        self.backend_contract_violations = Counter(
            "ai_backend_contract_violation_total",
            "Backend responses failing DTO validation",
            ["endpoint_id"],
            registry=r,
        )
        self.backend_circuit_open = Gauge(
            "ai_backend_circuit_open", "Backend circuit state (1=open)", ["endpoint_id"], registry=r
        )
        self.backend_retries = Counter(
            "ai_backend_retries_total", "Backend call retries", ["endpoint_id", "status"], registry=r
        )
        self.backend_cache = Counter(
            "ai_backend_cache_total", "Reference-data cache outcomes", ["endpoint_id", "outcome"], registry=r
        )
        self.backend_version_mismatch = Counter(
            "ai_backend_version_mismatch_total",
            "Responses from an unexpected API major version",
            ["endpoint_id"],
            registry=r,
        )
        self.backend_deprecated = Counter(
            "ai_backend_deprecated_total",
            "Calls to endpoints the backend marked deprecated",
            ["endpoint_id"],
            registry=r,
        )
        self.backend_pagination_truncated = Counter(
            "ai_backend_pagination_truncated_total", "Lists cut at the page cap", ["endpoint_id"], registry=r
        )
        self.tool_calls = Counter("ai_tool_calls_total", "Tool invocations", ["tool", "outcome"], registry=r)
        self.orchestrations = Counter(
            "ai_orchestrations_total", "Orchestrator executions by final status", ["status"], registry=r
        )
        self.orchestration_steps = Counter(
            "ai_orchestration_steps_total", "Orchestrated step outcomes", ["capability", "status"], registry=r
        )
        self.workflows = Counter(
            "ai_workflows_total",
            "Workflow transitions by type and status",
            ["workflow", "status"],
            registry=r,
        )
        self.workflow_stages = Counter(
            "ai_workflow_stages_total", "Workflow stage outcomes", ["workflow", "stage", "status"], registry=r
        )
        self.workflow_stage_duration = Histogram(
            "ai_workflow_stage_duration_seconds", "Workflow stage duration", ["workflow", "stage"], registry=r
        )
        self.workflow_retries = Counter(
            "ai_workflow_retries_total", "Automatic workflow stage retries", ["workflow", "stage"], registry=r
        )
