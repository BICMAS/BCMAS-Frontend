"""Composition root: builds every component from Settings.

Test code passes overrides (backend, providers, verifier) instead of patching.
The mock backend is imported lazily and only in mock mode, so it is never loaded
— and in the production image never present — when ``backend_mode=http``.
"""

from __future__ import annotations

import importlib
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Any

from cfp_ai.agents.base import AgentDeps
from cfp_ai.agents.catalogue import PUBLIC_CAPABILITIES
from cfp_ai.agents.coaching.scenarios import ScenarioStore
from cfp_ai.agents.coaching.service import CoachingService
from cfp_ai.agents.coaching.store import CoachingStore
from cfp_ai.agents.registry import CapabilityRegistry, default_entitlements
from cfp_ai.agents.talent.store import TalentResultStore
from cfp_ai.auth.verifier import DevTokenVerifier, JwksTokenVerifier, TokenVerifier
from cfp_ai.context.builder import ContextBuilder
from cfp_ai.context.cache import TtlCache
from cfp_ai.drafts.service import DraftService
from cfp_ai.integrations.backend.auth import (
    ClientCredentialsTokens,
    ForwardUserToken,
    TokenExchange,
    UserIdentity,
)
from cfp_ai.integrations.backend.cache import ReferenceCache
from cfp_ai.integrations.backend.client import BackendClient
from cfp_ai.integrations.backend.http_client import HttpBackendClient
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.llm.gateway import LlmGateway
from cfp_ai.llm.providers.base import LlmProvider
from cfp_ai.llm.routes import RouteTable, load_routes
from cfp_ai.llm.usage import UsageTracker
from cfp_ai.memory.in_memory import InMemoryLearnerMemory, InMemoryMessageStore
from cfp_ai.observability.metrics import Metrics
from cfp_ai.orchestrator.engine import Orchestrator
from cfp_ai.orchestrator.router import Router
from cfp_ai.orchestrator.store import ExecutionStore, SuggestionStore
from cfp_ai.security.audit import AuditLog
from cfp_ai.security.rate_limit import RateLimiter
from cfp_ai.settings import AuthMode, BackendMode, LlmProviderName, Settings
from cfp_ai.tools.backend_tools import register_backend_tools
from cfp_ai.tools.registry import ToolRegistry
from cfp_ai.workflows.engine import WorkflowService
from cfp_ai.workflows.store import InMemoryWorkflowStore, SqliteWorkflowStore, WorkflowStore


@dataclass
class Container:
    settings: Settings
    metrics: Metrics
    verifier: TokenVerifier
    endpoints: BackendEndpointRegistry
    backend: BackendClient
    routes: RouteTable
    providers: dict[str, LlmProvider]
    gateway: LlmGateway
    context: ContextBuilder
    tools: ToolRegistry
    messages: InMemoryMessageStore
    learner_memory: InMemoryLearnerMemory
    capabilities: CapabilityRegistry
    deps: AgentDeps
    router: Router
    orchestrator: Orchestrator
    coaching: CoachingService
    drafts: DraftService
    talent_results: TalentResultStore
    workflows: WorkflowService
    audit: AuditLog
    rate_limiter: RateLimiter
    workflow_store: WorkflowStore
    executions: ExecutionStore
    suggestions: SuggestionStore

    async def aclose(self) -> None:
        await self.backend.aclose()
        await self.gateway.aclose()
        if isinstance(self.workflow_store, SqliteWorkflowStore):
            self.workflow_store.close()


def _build_verifier(settings: Settings) -> TokenVerifier:
    if settings.auth_mode is AuthMode.DEV:
        assert settings.dev_jwt_secret is not None  # enforced by Settings
        return DevTokenVerifier(secret=settings.dev_jwt_secret.get_secret_value(), environment=settings.env)
    assert settings.jwks_url is not None  # enforced by Settings
    return JwksTokenVerifier(
        jwks_url=settings.jwks_url,
        issuers=settings.jwt_issuers,
        audiences=settings.jwt_audiences,
        algorithms=settings.jwt_algorithms,
        leeway_s=settings.jwt_leeway_s,
        cache_s=settings.jwks_cache_s,
    )


def _build_backend(settings: Settings, endpoints: BackendEndpointRegistry, metrics: Metrics) -> BackendClient:
    if settings.backend_mode is BackendMode.MOCK:
        module = importlib.import_module("cfp_ai.integrations.backend.mock.client")
        client: BackendClient = module.MockBackendClient(registry=endpoints, environment=settings.env)
        return client
    assert settings.backend_base_url is not None  # enforced by Settings
    client = HttpBackendClient(
        base_url=settings.backend_base_url,
        registry=endpoints,
        metrics=metrics,
        connect_timeout_s=settings.backend_connect_timeout_s,
        read_timeout_s=settings.backend_read_timeout_s,
        list_timeout_s=settings.backend_list_timeout_s,
        max_retries=settings.backend_max_retries,
        api_version=settings.backend_api_version,
        reference_cache=ReferenceCache(ttl_s=settings.backend_reference_cache_ttl_s),
        max_pages=settings.backend_max_pages,
        max_response_bytes=settings.backend_max_response_bytes,
        verify=settings.backend_ca_bundle or True,
        cert=(settings.backend_client_cert, settings.backend_client_key)
        if settings.backend_client_cert and settings.backend_client_key
        else None,
    )
    secret = settings.backend_client_secret.get_secret_value() if settings.backend_client_secret else None
    identity: UserIdentity = ForwardUserToken()
    if settings.backend_identity_mode == "exchange":
        assert (
            settings.backend_token_audience and settings.backend_client_id and secret
        )  # enforced by Settings
        identity = TokenExchange(
            http=client.http,
            registry=endpoints,
            audience=settings.backend_token_audience,
            client_id=settings.backend_client_id,
            client_secret=secret,
        )
    service = (
        ClientCredentialsTokens(
            http=client.http,
            registry=endpoints,
            client_id=settings.backend_client_id,
            client_secret=secret,
            scope=settings.backend_service_scope,
        )
        if settings.backend_client_id and secret
        else None
    )
    client.set_identity(identity, service)
    return client


def _build_providers(settings: Settings) -> dict[str, LlmProvider]:
    providers: dict[str, LlmProvider] = {}
    if settings.anthropic_api_key is not None:
        from cfp_ai.llm.providers.anthropic_provider import AnthropicProvider

        providers["anthropic"] = AnthropicProvider(
            api_key=settings.anthropic_api_key.get_secret_value(), max_retries=settings.llm_max_retries
        )
    if settings.openai_api_key is not None:
        from cfp_ai.llm.providers.openai_provider import OpenAIProvider

        providers["openai"] = OpenAIProvider(
            api_key=settings.openai_api_key.get_secret_value(),
            base_url=settings.openai_base_url,
            max_retries=settings.llm_max_retries,
        )
    if settings.env.is_local and settings.llm_default_provider is LlmProviderName.FAKE:
        from cfp_ai.llm.providers.fake_provider import FakeLlmProvider

        providers["fake"] = FakeLlmProvider(responders=fake_responders())
    return providers


def fake_responders() -> dict[str, Any]:
    """Offline responders for the fake provider (dev/test only), one per implemented LLM route."""
    from cfp_ai.agents.coaching import fakes as coaching_fakes
    from cfp_ai.agents.coaching import manager_brief
    from cfp_ai.agents.dev_plan import explain_gaps
    from cfp_ai.agents.dev_plan import fakes as dev_plan_fakes
    from cfp_ai.agents.system import diagnostics
    from cfp_ai.agents.talent import fakes as talent_fakes
    from cfp_ai.orchestrator import router

    return {
        **coaching_fakes.RESPONDERS,
        **dev_plan_fakes.RESPONDERS,
        diagnostics.ROUTE: diagnostics.fake_responder,
        explain_gaps.ROUTE: explain_gaps.fake_responder,
        manager_brief.ROUTE: manager_brief.fake_responder,
        **talent_fakes.RESPONDERS,
        router.ROUTE: router.fake_responder,
    }


def register_agents(capabilities: CapabilityRegistry, *, local: bool) -> None:
    """Agent registration: implemented capabilities of the three agents (+ dev diagnostics)."""
    from cfp_ai.agents.coaching.capabilities import (
        ConversationCapability,
        EvaluateSessionCapability,
        RoleplayCapability,
    )
    from cfp_ai.agents.coaching.manager_brief import SPEC as BRIEF
    from cfp_ai.agents.coaching.manager_brief import ManagerBriefCapability
    from cfp_ai.agents.coaching.recommend import SPEC as RECOMMEND
    from cfp_ai.agents.coaching.recommend import RecommendScenariosCapability
    from cfp_ai.agents.dev_plan.draft_plan import SPEC as DRAFT_PLAN
    from cfp_ai.agents.dev_plan.draft_plan import DraftPlanCapability
    from cfp_ai.agents.dev_plan.explain_gaps import SPEC as GAPS
    from cfp_ai.agents.dev_plan.explain_gaps import ExplainGapsCapability
    from cfp_ai.agents.dev_plan.recommend_learning import SPEC as LEARNING
    from cfp_ai.agents.dev_plan.recommend_learning import RecommendLearningCapability
    from cfp_ai.agents.dev_plan.review_plan import SPEC as REVIEW_PLAN
    from cfp_ai.agents.dev_plan.review_plan import ReviewPlanCapability
    from cfp_ai.agents.talent.cv_analysis import SPEC as CV_ANALYSIS
    from cfp_ai.agents.talent.cv_analysis import AnalyzeCvCapability
    from cfp_ai.agents.talent.design import SPEC as DESIGN
    from cfp_ai.agents.talent.design import DesignAssessmentCapability
    from cfp_ai.agents.talent.interview_scoring import SPEC as INTERVIEW
    from cfp_ai.agents.talent.interview_scoring import ScoreInterviewCapability
    from cfp_ai.agents.talent.recommend_scores import SPEC as SCORES
    from cfp_ai.agents.talent.recommend_scores import RecommendScoresCapability
    from cfp_ai.agents.talent.report import SPEC as REPORT
    from cfp_ai.agents.talent.report import DraftReportCapability

    capabilities.implement(ConversationCapability.spec, ConversationCapability)
    capabilities.implement(RoleplayCapability.spec, RoleplayCapability)
    capabilities.implement(EvaluateSessionCapability.spec, EvaluateSessionCapability)
    capabilities.implement(RECOMMEND, RecommendScenariosCapability)
    capabilities.implement(GAPS, ExplainGapsCapability)
    capabilities.implement(DRAFT_PLAN, DraftPlanCapability)
    capabilities.implement(LEARNING, RecommendLearningCapability)
    capabilities.implement(REVIEW_PLAN, ReviewPlanCapability)
    capabilities.implement(BRIEF, ManagerBriefCapability)
    capabilities.implement(SCORES, RecommendScoresCapability)
    capabilities.implement(DESIGN, DesignAssessmentCapability)
    capabilities.implement(REPORT, DraftReportCapability)
    capabilities.implement(CV_ANALYSIS, AnalyzeCvCapability)
    capabilities.implement(INTERVIEW, ScoreInterviewCapability)
    if local:
        from cfp_ai.agents.system.diagnostics import SPEC, DiagnosticsCapability

        capabilities.implement(SPEC, DiagnosticsCapability)


def register_draft_kinds(drafts: DraftService) -> None:
    from cfp_ai.agents.dev_plan import draft_plan, review_plan
    from cfp_ai.agents.talent import design, report

    drafts.register(draft_plan.HANDLER)
    drafts.register(review_plan.HANDLER)
    drafts.register(design.HANDLER)
    drafts.register(report.HANDLER)


def build_container(
    settings: Settings,
    *,
    backend: BackendClient | None = None,
    providers: Mapping[str, LlmProvider] | None = None,
    verifier: TokenVerifier | None = None,
    metrics: Metrics | None = None,
) -> Container:
    metrics = metrics or Metrics()
    endpoints = BackendEndpointRegistry.load(settings.backend_registry_path, settings.env)
    backend = backend or _build_backend(settings, endpoints, metrics)
    routes = load_routes(settings.llm_routes_path, settings)
    provider_map = dict(providers) if providers is not None else _build_providers(settings)
    gateway = LlmGateway(
        routes=routes,
        providers=provider_map,
        metrics=metrics,
        usage=UsageTracker(
            default_budget=settings.llm_monthly_token_budget,
            tenant_budgets=settings.llm_tenant_token_budgets,
            warn_ratio=settings.llm_budget_warn_ratio,
        ),
    )
    context = ContextBuilder(
        backend=backend,
        cache=TtlCache(),
        slice_timeout_s=settings.context_slice_timeout_s,
        ttl_s=settings.context_cache_ttl_s,
        reference_ttl_s=settings.context_framework_cache_ttl_s,
    )
    tools = ToolRegistry(endpoints=endpoints, metrics=metrics)
    register_backend_tools(tools, backend)
    messages = InMemoryMessageStore()
    learner_memory = InMemoryLearnerMemory()
    capabilities = CapabilityRegistry(
        endpoints=endpoints,
        gateway=gateway,
        default_entitlements=default_entitlements(settings.env.is_local, settings.default_entitlements),
    )
    capabilities.declare(PUBLIC_CAPABILITIES)
    scenarios = ScenarioStore(seed=settings.env.is_local)  # seed scenarios are dev/test data only
    coaching_store = CoachingStore()
    audit = AuditLog()
    deps = AgentDeps(
        backend=backend,
        context=context,
        gateway=gateway,
        tools=tools,
        messages=messages,
        learner_memory=learner_memory,
        metrics=metrics,
        scenarios=scenarios,
        coaching_store=coaching_store,
        audit=audit,
    )
    # Drafts authorise with the base deps; agents receive deps that include the draft service.
    drafts = DraftService(deps=deps, endpoints=endpoints, ttl_days=settings.draft_ttl_days)
    talent_results = TalentResultStore()
    register_draft_kinds(drafts)
    deps = replace(
        deps,
        drafts=drafts,
        talent_results=talent_results,
        dev_plan_approval_mode=settings.dev_plan_approval_mode,
        dev_plan_max_goals=settings.dev_plan_max_goals,
    )
    register_agents(capabilities, local=settings.env.is_local)
    router = Router(registry=capabilities, gateway=gateway, metrics=metrics)
    executions = ExecutionStore()
    suggestions = SuggestionStore()
    orchestrator = Orchestrator(
        registry=capabilities,
        router=router,
        deps=deps,
        endpoints=endpoints,
        store=executions,
        suggestions=suggestions,
        metrics=metrics,
    )
    coaching = CoachingService(
        deps=deps,
        registry=capabilities,
        scenarios=scenarios,
        store=coaching_store,
        suggestions=suggestions,
        settings=settings,
    )
    from cfp_ai.workflows.definitions import DEFINITIONS

    workflow_store: WorkflowStore = (
        SqliteWorkflowStore(settings.workflow_store_path)
        if settings.workflow_store_path
        else InMemoryWorkflowStore()
    )
    workflows = WorkflowService(
        deps=deps,
        orchestrator=orchestrator,
        executions=executions,
        suggestions=suggestions,
        coaching=coaching,
        store=workflow_store,
        metrics=metrics,
        definitions=dict(DEFINITIONS),
        retry_attempts=settings.workflow_retry_attempts,
        retry_backoff_s=settings.workflow_retry_backoff_s,
    )
    return Container(
        settings=settings,
        metrics=metrics,
        verifier=verifier or _build_verifier(settings),
        endpoints=endpoints,
        backend=backend,
        routes=routes,
        providers=provider_map,
        gateway=gateway,
        context=context,
        tools=tools,
        messages=messages,
        learner_memory=learner_memory,
        capabilities=capabilities,
        deps=deps,
        router=router,
        orchestrator=orchestrator,
        executions=executions,
        suggestions=suggestions,
        coaching=coaching,
        drafts=drafts,
        talent_results=talent_results,
        workflows=workflows,
        workflow_store=workflow_store,
        audit=audit,
        rate_limiter=RateLimiter(
            per_user=settings.rate_limit_user_per_minute, per_tenant=settings.rate_limit_tenant_per_minute
        ),
    )


def describe(container: Container) -> dict[str, Any]:
    """Non-secret configuration summary for logs and admin health."""
    s = container.settings
    return {
        "env": s.env.value,
        "auth_mode": s.auth_mode.value,
        "backend_mode": s.backend_mode.value,
        "llm_default_provider": s.llm_default_provider.value,
        "llm_providers_configured": sorted(container.providers),
        "llm_routes": len(container.routes.routes),
        "llm_routes_unusable": sorted(container.routes.unusable),
        "backend_endpoints": container.endpoints.counts(),
        "workflow_store": "sqlite" if s.workflow_store_path else "memory",
        "llm_monthly_token_budget": s.llm_monthly_token_budget,
        "rate_limits_per_minute": {
            "user": s.rate_limit_user_per_minute,
            "tenant": s.rate_limit_tenant_per_minute,
        },
        "error_reporting": "sentry" if s.sentry_dsn else "logs",
        "release": s.release,
    }
