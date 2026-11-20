# CFP AI Intelligence Service

The independent AI backend for the Capability Framework Platform (Python 3.12, FastAPI, LangGraph).
It contains the **foundation** (every cross-cutting component) and the **multi-agent orchestrator**, which coordinates the Coaching, Development Plan and Talent Assessment agents. The **Coaching Agent** (8 coaching modes, interactive role-play) and the **Training & Development Plan Agent** (IDPs, draft review, progress tracking, evidence-driven updates) are complete. The **Talent Assessment Agent** (8 assessment methods, evidence-based scoring with assessor review, reports) is complete too.

- Design and contracts: [`../docs/ai/`](../docs/ai/README.md)
- Implementation decisions: [`docs/IMPLEMENTATION_DECISIONS.md`](docs/IMPLEMENTATION_DECISIONS.md)
- Orchestration workflows and state transitions: [`../docs/ai/ORCHESTRATION.md`](../docs/ai/ORCHESTRATION.md)
- Coaching Agent: [`../docs/ai/COACHING_AGENT.md`](../docs/ai/COACHING_AGENT.md)
- Development Plan Agent: [`../docs/ai/DEVELOPMENT_PLAN_AGENT.md`](../docs/ai/DEVELOPMENT_PLAN_AGENT.md)
- Talent Assessment Agent: [`../docs/ai/TALENT_ASSESSMENT_AGENT.md`](../docs/ai/TALENT_ASSESSMENT_AGENT.md)
- Collaborative workflows: [`../docs/ai/WORKFLOWS.md`](../docs/ai/WORKFLOWS.md)

## What is implemented

| Area | Where | Notes |
|---|---|---|
| FastAPI app, middleware, error envelope | `api/` | Request IDs, contract-version header, JSON errors, no CORS (BFF-only) |
| Configuration and environment rules | `settings.py`, `.env.example` | `CFP_AI_*` variables. Dev-only options are rejected in staging/prod. |
| Authentication interfaces | `auth/` | JWKS verifier (BE-001, proposed) and an HS256 dev verifier (dev/test only) |
| Backend API client | `integrations/backend/` | HTTP client with registry gating, retries, circuit breaker, DTO validation |
| Mock backend (dev/test only) | `integrations/backend/mock/` | Prototype personas and data, realistic authorisation. Removed from the prod image. |
| Endpoint registry | `config/backend-endpoints.registry.yaml` | All 37 backend endpoints are `proposed`. Only `available`/`mocked` (dev) are callable. |
| LLM provider abstraction | `llm/` | Anthropic and OpenAI adapters, a fake provider, a gateway, and a YAML route table |
| Structured output validation | `validation/structured.py` | Semantic validators with a bounded repair loop |
| Agent base and registration | `agents/` | `CapabilitySpec`, registry with availability and authorisation, 18 declared capabilities |
| LangGraph workflow | `agents/graph.py` | Standard node pipeline with a repair loop. The principal travels in runtime context, never in state. |
| Tool registry | `tools/` | Gated by capability and endpoint status. Strict schemas. Write tools are never exposed to the LLM. |
| Shared context service | `context/` | Parallel slice fetch, context gaps, deterministic skill gaps, scoped cache, pseudonymised rendering |
| Conversation memory interfaces | `memory/` | Message store, windowing, learner memory (in-memory implementations) |
| Logging and observability | `observability/` | JSON logs with redaction, Prometheus metrics, OpenTelemetry spans |
| Foundation smoke test | `agents/system/diagnostics.py` | Dev-only end-to-end workflow exercising every layer |
| **Multi-agent orchestrator** | `orchestrator/` | LangGraph state machine: routing (explicit, LLM, keyword fallback), per-step authorisation, shared context, retries, dependencies and conditions, handoffs, approval checkpoints (`interrupt`/resume), execution history |
| **AI Coaching Agent** | `agents/coaching/` | 7 conversation modes + interactive role-play, structured turns and summaries, observer-based evaluation, scenario library, memory with consent, retention, manager summaries ([docs](../docs/ai/COACHING_AGENT.md)) |
| **AI Training & Development Plan Agent** | `agents/dev_plan/`, `drafts/` | D1 IDP drafts (validated, organisational resources first), D2 gap insights, D3 catalogue recommendations, D4 progress + adjustment drafts. Draft review with role approval and commit plans (BE-052/053). Signed `/v1/events` receiver. ([docs](../docs/ai/DEVELOPMENT_PLAN_AGENT.md)) |
| **Collaborative workflows** | `workflows/` | Workflows A (assessment → development), B (personal development) and C (continuous development) over the orchestrator. Actors and human checkpoints, SQLite or in-memory persistence, retries and recovery, duplicate prevention, audit trail, metrics and traces. ([docs](../docs/ai/WORKFLOWS.md)) |
| **AI Talent Assessment Agent** | `agents/talent/` | T1 assessment design (8 methods, framework rubrics and criteria), T3 evidence-based scoring (criterion judgements + deterministic level rule, keyed SJT, blind, per-item assessor review), T4 reports from committed scores. Shares reviewed results with D1 and coaching. ([docs](../docs/ai/TALENT_ASSESSMENT_AGENT.md)) |
| Agent capabilities | `agents/coaching/` | `coaching.manager_brief` (C6) |

## Run locally

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
cd ai-service
uv sync                         # creates .venv with runtime and dev dependencies
cp .env.example .env            # mock backend, dev tokens, offline fake LLM
uv run uvicorn cfp_ai.main:app --reload --port 8000
```

Try it, using the prototype's personas (`james`, `michael`, `priya`, `sarah`, `alex`, `ama`):

```bash
TOKEN=$(curl -s -X POST localhost:8000/v1/_dev/tokens -H 'content-type: application/json' \
  -d '{"persona":"michael"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s localhost:8000/v1/capabilities -H "authorization: Bearer $TOKEN"
curl -s -X POST localhost:8000/v1/_dev/diagnostics -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"employee_id":"emp-8721"}'
```

OpenAPI docs: http://localhost:8000/docs (dev/test only).

To use a real model, set `CFP_AI_LLM_DEFAULT_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. For OpenAI, set `CFP_AI_LLM_DEFAULT_PROVIDER=openai`, `OPENAI_API_KEY` and `CFP_AI_OPENAI_DEFAULT_MODEL` (there is deliberately no default OpenAI model).

### Docker

```bash
docker compose up --build              # dev target, live reload, mock backend
docker build -t cfp-ai .               # production image (runtime target)
```

The production image runs as a non-root user, has no dev dependencies, and **physically deletes the mock backend package**. The build fails if the package is still importable.

## Quality checks

```bash
uv run pytest            # 206 tests
uv run mypy              # strict
uv run ruff check src tests && uv run ruff format --check src tests
```

## Security posture

- **API keys stay in this service.** They are `SecretStr`, never logged, never returned (`/v1/admin/health` reports only "configured"). The frontend calls the service through its server-side BFF, and there is no CORS.
- **Tenant and principal come only from the verified token.** Backend calls forward the user's token, so the backend's authorisation decides what the AI may see.
- **No employee or competency database.** The conventional backend is the source of truth. This service caches reads briefly (≤ 5 min, keyed by the caller's visibility scope) and does not persist them.
- **Mock data cannot reach production.** Settings reject it, the mock client refuses to construct, it is imported lazily only in mock mode, and it is deleted from the production image. A test proves a prod-configured app never imports it.

## Not yet implemented

- 6 of the 18 public capabilities (C4 scenario drafting, D5 cohort pathways, D6 manager recommendations, T2 assessment role-play, T5 evidence analysis, T6 insights). They are declared and report `ai_disabled` until implemented.
- A connection to the real backend: no backend API documentation has been received, so every endpoint is `proposed` outside dev/test and is never called (see BACKEND_INTEGRATION_SPEC.md §11–§12, and `python -m cfp_ai.integrations.backend.openapi_check` for when the OpenAPI arrives).
- Durable shared storage (Postgres and pgvector): memory, drafts, execution history, LangGraph checkpoints, RAG index. Workflow state can use SQLite (single replica); everything else is in-memory today.
- Async jobs (ARQ): drafts and reviews run synchronously today. The service-account token (BE-003).
- Any backend endpoint marked `available`. None is confirmed by the backend team yet.
