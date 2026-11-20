# Implementation Decisions — AI Service Foundation

Decisions made while implementing the foundation (Prompt 3), in addition to those already in `docs/ai/AI_TECHNICAL_SPEC.md`. Each entry gives the decision, the reason, and any consequence for later work.

## Project and tooling

| # | Decision | Why |
|---|---|---|
| D1 | The service lives in `ai-service/` inside this repository, as a self-contained project (own `pyproject.toml`, lock file, Dockerfile, tests). | Keeps the contracts in `docs/ai/` and the implementation side by side during review. It can be extracted with `git subtree split` without code changes. Parity tests skip themselves once the docs are absent. |
| D2 | Python 3.12, managed with **uv** (lock file committed) | Matches the container base image. uv gives reproducible installs and fast CI. The local machine only had Python 3.15, so a uv-managed 3.12 was installed. |
| D3 | SDK versions pinned to the majors verified against: `anthropic>=2.10,<3`, `openai>=3.55,<4`, `langgraph>=1.2,<2` | Adapter code was written against the installed SDKs' real signatures, not memory. |
| D4 | The frontend's `eslint.config.mjs` now ignores `ai-service/**`. | The Python venv contains third-party `.js` files that `npm run lint` would otherwise crawl. This is the only change outside `ai-service/` and `docs/`. |
| D5 | Ruff line length 110. Explicit `TypeVar` generics (PEP 695 rules disabled). The contract copies are excluded from lint. | Readability alongside Pydantic generics. The contract copies must stay byte-identical to the reviewed files. |

## Configuration and isolation

| # | Decision | Why |
|---|---|---|
| D6 | All settings use the `CFP_AI_` prefix, and the standard names `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are also accepted. | This fits existing secret-management conventions. |
| D7 | Startup **fails** outside dev/test if the mock backend, dev tokens, the fake LLM, or a missing log-hash key is configured. | Misconfiguration is caught at boot, not in production traffic. |
| D8 | The mock backend is isolated four ways: settings rule, constructor guard, lazy import, and deletion from the production image (verified at build time). | "Keep mock data isolated from production" is enforced, not just conventional. A subprocess test proves a prod app never imports it. |
| D9 | Config YAML (route table, endpoint registry) ships **inside the package** (`cfp_ai/config/`). | It resolves the same way for editable installs and wheels. Found while verifying the wheel install. |
| D10 | The runtime endpoint registry is a copy of `docs/ai/contracts/backend-endpoints.registry.yaml`, guarded by a byte-equality test. | Status changes are reviewed in one place, and drift fails CI. |
| D11 | The public Pydantic schemas and backend DTOs are verbatim copies of the reviewed contract modules, with parity tests. | The service implements exactly what was signed off. Changing a contract means changing the reviewed file. |
| D12 | Entitlements come from the token claim, then a configured default. In dev/test the default is all entitlements; in staging/prod it is **none** (fail closed). | BE-005 (entitlements endpoint) is proposed only, so it is not called. |

## Authentication

| # | Decision | Why |
|---|---|---|
| D13 | JWKS verification uses PyJWT's `PyJWKClient` in a worker thread, with issuer, audience and algorithm allow-lists (default RS256/ES256). | Standard and audited. It blocks HS256 algorithm-confusion attacks (tested). |
| D14 | Dev tokens are HS256 with a local secret, minted via `POST /v1/_dev/tokens` for the prototype personas. | The frontend's personas can be used against the service before the backend's auth exists. The route is not mounted outside dev/test. |
| D15 | `Principal.token` is excluded from repr and serialisation. Cache keys use `visibility_scope` (a hash of tenant, roles, employee and scopes). | The token must never leak, and data fetched for one user must never be served to another with different visibility. |

## Backend client

| # | Decision | Why |
|---|---|---|
| D16 | One typed `BackendClient` protocol, with HTTP and mock implementations. Methods take the `Principal` and forward its token. | The backend's own authorisation stays authoritative, and the AI cannot widen access. |
| D17 | The registry is checked **before** any request. Unconfirmed endpoints are never called and raise `not_callable` → `backend_dependency_unconfirmed`. | Implements "do not assume unavailable APIs exist". |
| D18 | GET-only retries on 502/503/504, timeouts and connection errors. 4xx responses are never retried. Per-endpoint circuit breaker. | Matches BACKEND_INTEGRATION_SPEC §4.1. Client errors don't count against backend health. |
| D19 | Responses are validated against the DTOs (which ignore extra fields). A violation is counted and surfaced as `contract_violation`. | The backend contract is still proposed, so mismatches should be loud. |
| D20 | IDs are URL-encoded as path segments. | Opaque IDs must not be able to alter the request path (tested with `../admin`). |

## LLM layer

| # | Decision | Why |
|---|---|---|
| D21 | Agents reference **route IDs**. `llm_routes.yaml` maps each route to provider, model and effort. `provider: default` and `model: default` resolve from settings. | Models and providers change by configuration plus evals, not code. |
| D22 | **OpenAI has no default model.** OpenAI routes are reported unusable until `CFP_AI_OPENAI_DEFAULT_MODEL` is set. | No model name is guessed. Whoever enables OpenAI chooses the model. |
| D23 | Anthropic structured output uses `messages.create` with `output_config.format` (schema via `anthropic.transform_schema`) and is validated with Pydantic **after** checking `stop_reason`. It does **not** use `messages.parse`. | Found by test: `parse` raises a JSON error on a refusal before `stop_reason` can be read, so refusals would be misclassified as invalid output and re-prompted by the repair loop. The SDK also marks `output_format` as deprecated. |
| D24 | Anthropic requests always set `output_config.effort`. They never send `thinking`, `temperature`/`top_p`/`top_k`, an assistant prefill, or forced `tool_choice`. Server-side refusal fallback (`fallbacks="default"`) is enabled per route by default. Stable system blocks get `cache_control`. | These follow the API rules for `claude-opus-5-5`, and are asserted on the serialised HTTP body in tests. |
| D25 | Anthropic SDK 2.x runs on `httpx2`. Tests inject an `httpx2` mock transport and exercise the **real SDK**. | Proves the request shapes and response parsing against the installed SDK without network calls. |
| D26 | OpenAI uses Chat Completions `parse(response_format=Model)`. System blocks are joined into one system message. `reasoning_effort` is sent only if the route sets it. | It is broadly compatible, and parameters only valid for some models stay opt-in. |
| D27 | The gateway maps provider errors to public codes: refusal → `content_refused`, transient → `ai_unavailable` (circuit breaker), timeout → `deadline_exceeded`, no usable output → `ai_output_invalid`, auth/400 → `internal_error`. | Matches AI_TECHNICAL_SPEC §12.2. Transport retries stay in the SDKs (`max_retries`). |
| D28 | The cost metric uses a price table in `llm_routes.yaml` (only `claude-opus-5-5` is listed today). | It is an estimate for dashboards, not billing. Unknown models report tokens only. |

## Agents, LangGraph, tools, context, memory

| # | Decision | Why |
|---|---|---|
| D29 | All 18 public capabilities are **declared** (`agents/catalogue.py`) with access rules, endpoint dependencies, LLM routes and approval modes, but marked `implemented=False`. | Registration, authorisation, availability and `/v1/capabilities` are exercised now. Each agent later only adds an implementation. |
| D30 | Pre-checks run in a fixed order: role → entitlement → implemented → required backend endpoints. Subject relation (self, direct report, tenant) is checked inside the workflow via `authorize_subject`. | The error codes are predictable, and relation checks need the subject ID. |
| D31 | LangGraph workflows receive the principal and dependencies through **`context_schema` / `Runtime.context`**, never through graph state. | Graph state is checkpointed. Tokens must never be persisted. |
| D32 | There is one standard workflow (`agents/graph.py`) with an optional-node pipeline and a validate → generate repair edge (default 2 repairs, then fail or partial). | Every agent gets the same shape. This matches AI_TECHNICAL_SPEC §2.3. |
| D33 | The dev-only `system.diagnostics` capability is the foundation smoke test. It is not public, and it uses its own provenance type. | It proves the full chain end to end before any specialised agent is built, and avoids mislabelling audit data with a public capability ID. |
| D34 | Tools are gated by both capability allow-list and endpoint status. LLM tool schemas are strict (`additionalProperties: false`). `backend_write` tools cannot be registered as LLM-visible. Tool errors return `is_error` results. Truncated results remain valid JSON. | Matches AI_TECHNICAL_SPEC §9. A model cannot widen its own access. |
| D35 | Context slices are fetched in parallel. Optional failures become `ContextGap`s. Required failures raise. A backend 401 always raises. Skill gaps are deterministic code (§5.3 rules). | Degraded but honest outputs, and no LLM involvement in levels. |
| D36 | Prompt rendering is deterministic and pseudonymised (the subject is "the employee"). Backend text is framed as data, not instructions. | Prompt-cache stability, privacy, and injection resistance. |
| D37 | Memory is interfaces plus in-memory implementations only. | Durable Postgres storage is a separate step. The interfaces fix the contract (idempotent `client_message_id`, hidden notes, tenant-scoped learner memory, erasure). |

## Observability

| # | Decision | Why |
|---|---|---|
| D38 | JSON logs with a redaction filter (bearer tokens, JWTs, `sk-` keys, emails). User IDs are logged only as keyed hashes. Noisy SDK loggers are raised to WARNING. | Matches AI_TECHNICAL_SPEC §13.1. SDK loggers print request lines. |
| D39 | Prometheus metrics use a per-app registry at `/internal/metrics` (unauthenticated, so it **must be network-restricted** at deployment). OpenTelemetry spans are emitted; the exporter is `none`/`console` until an OTLP backend is chosen. | Tests stay isolated, and there is no vendor lock-in before the observability decision. |
| D40 | Pure-ASGI request middleware (not `BaseHTTPMiddleware`) | It is safe for the upcoming SSE streaming endpoints. |

## Orchestrator (Prompt 4)

| # | Decision | Why |
|---|---|---|
| D41 | The orchestrator is one LangGraph `StateGraph` (`route → authorize → load_context → select → execute → approval → handoffs → finalize`) with a checkpointer. Specialised agents stay as capabilities behind a `run_step` contract. | Explicit, testable state transitions. Durable pauses for approvals. Agents stay independent of orchestration. |
| D42 | **Every step is authorised against the principal executing it at that moment**: at plan time and again at execution time, including after an approver resumes. | LangGraph lets the resumed run carry a different runtime context (verified). Permissions can never be inherited from the requester. |
| D43 | Context is cached in graph state per **(visibility scope, subject)**, with the loaded slices recorded and reloaded when a later step needs more. | One principal's context is never handed to another. Found while designing approver resumes. |
| D44 | The router gives the LLM only capabilities the principal can use now, and the subject is **symbolic** (`self`/`requested`/`none`). Validation, repair, then keyword fallback. Clarification instead of guessing. | The model cannot invent employee IDs or reach capabilities the user lacks. The service degrades gracefully when the model is down. |
| D45 | Routed steps can declare `depends_on_previous` and `only_if_previous_has`. A failed dependency skips with an error. An unmet condition skips as a normal outcome. | Conditional multi-agent coordination without a general-purpose expression language |
| D46 | Retry policy: one retry for retryable `AppError`s (max 2 attempts) with backoff. Output schema violations count as `ai_output_invalid` (retryable). Unexpected exceptions fail only the step. | Bounded recovery. One faulty agent does not take down the execution. |
| D47 | Handoffs run as follow-up steps only if: allowed by the request, depth ≤ 2, ≤ 6 steps, not a duplicate, and the target is available to this principal. Otherwise they become a `Suggestion`, or a `handoff_dropped` event if there is no subject. | Matches AI_TECHNICAL_SPEC §4. Every blocked handoff leaves an audit trail (found by test). |
| D48 | Approvals: the decider needs an approver role **and** permission to run the capability on that subject. `apply_review` is dry-run before resuming. One decision per approval. The requester alone may cancel. A non-requester approver sees only the step under review. | Approval can't be used to bypass access. Invalid input never half-resumes a workflow. Least privilege on the execution record. |
| D49 | The orchestrator has **no backend write path**. Approved results carry a `commit_plan` (`CommitInstruction[]` with the registry status of each endpoint) for the frontend to execute. | "Does not directly modify official employee records" is enforced structurally and asserted in tests (mock rubric unchanged after approval). |
| D50 | One real capability per agent: D2 `explain_gaps`, C6 `manager_brief`, T3 `recommend_scores` (with mock BE-060/061 data). | The orchestrator coordinates real agents end to end, not stubs. T3 exercises per-item human review. |
| D51 | T3 sends blinded response text only (no subject identity, contact details redacted), scores one row per call, validates verbatim quotes and indicator IDs, and rejects decision or readiness language. | AI_TECHNICAL_SPEC §5.3 and §14.7 governance for talent decisions |
| D52 | Execution history is an `ExecutionRecord` with an append-only event list, stored per tenant and visible to the requester. The in-memory store and `InMemorySaver` are placeholders for Postgres. | Execution status and history are available immediately, including while paused. |
| D53 | The orchestrator API is added to `AI_API_SPEC.md` §10 and to the TS contract as **pending review**. Its Pydantic models live in the service (`orchestrator/models.py`, `agents/steps.py`). | The reviewed v1.1 contract files stay unchanged, and parity tests still hold. |

## Coaching Agent (Prompt 5)

| # | Decision | Why |
|---|---|---|
| D54 | Seven conversational modes share one engine, and each `ModeProfile` defines a method (GROW, STAR/SBI, deliberate practice…), skill scope, context slices, a deterministic opening and guidance. Role-play runs on a separate scenario engine. | One tested engine with mode-specific behaviour. Openings cost no model call. |
| D55 | **"Guide, don't lecture" is validated, not just prompted.** Every turn needs a reflective question that ends with "?" and appears in the message. Over-long or list-heavy messages are rejected. Skills and references must come from the offered sets. Failures are repaired. | The requirement becomes a testable property instead of a hope. |
| D56 | Coaching context is always the caller's own (`principal.employee_id`), read as them. The API has no subject field. Transcripts are owner-only (`404` for others). Managers get summaries only, and that can be switched off. | Authorised information only. Coaching confidentiality. |
| D57 | A deterministic wellbeing/complaint guard runs before any model call and returns a fixed supportive response. Flagged messages are excluded from summaries, evaluation and memory. A model-raised flag is also replaced by the safe response. | Safety does not depend on the model, and sensitive disclosures are not processed further. |
| D58 | Learner memory needs consent per conversation (`use_memory`). It holds at most 3 facts per conversation, with sensitive categories rejected by a validator. Facts expire (365 d), can be listed and deleted, and are cascade-deleted with their source conversation. Retention purge (365 d) and subject erasure are implemented. | Privacy and retention controls that can be inspected and tested |
| D59 | Role-play persona replies stream real tokens (`gateway.stream`). Conversation turns are structured outputs delivered over SSE after generation. | Live feel for the simulation. Structured, validated coaching metadata for conversations. Documented honestly in the API. |
| D60 | A silent observer scores each role-play turn against the scenario's success criteria, with verbatim quotes, stored as hidden notes. It runs after the reply streams and is non-fatal. Evaluations must quote the employee verbatim (with message ID) for every target skill. | Evidence-based, indicator-linked feedback, and no fabricated evidence (tested) |
| D61 | The persona receives only the scenario (brief, hidden constraints, escalation rules), never personal data. Learners never see hidden constraints or success criteria. | Data minimisation, and a realistic simulation |
| D62 | C3 recommendations are deterministic (gap-weighted, level-matched, repeat-penalised) and orchestratable, so the Development Plan Agent's `practice_needed` handoff now runs it. | Cheap, explainable and testable. Closes the first cross-agent handoff loop. |
| D63 | `CapabilitySpec.orchestratable`: interactive capabilities (C1, C2, C5) are registered for gating and availability, but the router never offers them and handoffs never target them. Handoffs also pre-check the subject relation and become suggestions instead of doomed steps. | Stateful conversations have their own endpoints. Found while turning on C3. |
| D64 | The scenario library is AI-owned (as proposed in BACKEND_INTEGRATION_SPEC). The four prototype scenarios are seeded in dev/test only. L&D publishing validates criteria against target skills and the skills against the framework (BE-022). | Matches the ownership decision. No dev data in production. |
| D65 | BE-040 (catalogue) is also used with the user's token for skill-filtered reads (coaching learning interventions). The registry and backend spec are updated, and the endpoint is still proposed. | Recommendations must point to real, active catalogue items that the user may see. |
| D66 | The coaching API additions and changes are marked v1.2 pending review in the API spec (§11) and the TS contract. Session evaluation is synchronous until the job queue exists. | The reviewed v1.1 Pydantic contract is unchanged. Differences are explicit. |

## Training & Development Plan Agent (Prompt 6)

| # | Decision | Why |
|---|---|---|
| D67 | **The platform decides, the model writes.** Competencies, current/target levels, gaps, priorities, resource details, indicator texts and dates are computed from backend data. The model writes objectives, interventions, assignments, milestones and outcomes, choosing only from candidate IDs. | Plans must agree with verified data. The model cannot invent levels or courses. |
| D68 | One set of plan rules (`planning.plan_rules`) validates model output (with repair) **and** every human edit. Edits also cannot change verified-data fields. | Reviewers can't accidentally produce a plan the generator would reject, and verified data can't be overwritten in the AI layer. |
| D69 | Organisational resources first is enforced as a rule (`org_resource_missing`, `unknown_id`), not just prompted. D3 is deterministic over the catalogue. | The requirement is testable, and no external or retired course reaches a plan |
| D70 | A generic `DraftService` (kind handlers for validation and commit) holds AI drafts with versioning, review history, expiry, and visibility/approval checks via `authorize_subject`. Plans default to `role_approval`, with no self-approval. | "Review before official record" is enforced server-side and reusable for future draft kinds (scenarios, items). |
| D71 | Acceptance returns a commit plan (BE-052/BE-053, proposed). The frontend executes it with the reviewer's token and reports back. A `development_plan.created` event with `source.draft_id` can also confirm it. | The AI service never writes official records, and the backend stays the source of truth |
| D72 | The T3 handoff carries the assessed role. D1 plans against that role for the skills scored below it, using reviewer-confirmed scores as current levels (`current_level_source: assessment`). | Promotion development plans reflect the human-reviewed assessment, not raw AI scores |
| D73 | D4 progress is deterministic. Adjustments (`mark_goal_complete`, `remove_action`, `add_action`, `add_goal`) are proposed as a `plan_adjustment` draft under the same review. New goals reuse the planner. | Evidence-driven updates without silently changing official plans |
| D74 | The `/v1/events` receiver uses HMAC over `timestamp.body`, a skew window and `event_id` de-duplication. It only invalidates, suggests, confirms commits or erases. Event data is never trusted as a record. Without a secret it returns `503`. | Matches BACKEND_HANDOVER §6.1 and keeps the backend the source of truth |
| D75 | Dev-plan and draft APIs are marked v1.3 pending review (API spec §12, TS contract). The reviewed v1.1 Pydantic contract is unchanged. | Differences from the reviewed contract are explicit |

## Talent Assessment Agent (Prompt 7)

| # | Decision | Why |
|---|---|---|
| D76 | **The model judges criteria; a rule sets the score.** Per competency, the model judges each framework indicator (met / partial / not_met / not_evidenced) with verbatim quotes. `determine_level` (`talent.level_rule@v1`) turns criterion coverage into a level, and gap and confidence are derived from that. | Every score traces to defined criteria and can be re-derived. The same evidence always gives the same score. |
| D77 | **No demonstrated level means no score.** The rule never guesses below or above the evidence. The assessor decides, and their value is recorded as `score_source: human`. | Avoids fabricating proficiency from absent evidence |
| D78 | SJT responses are scored deterministically from the designer's keyed options (BE-068). Self-reported text caps at `partial`. Self and manager ratings are compared claims, never evidence. | Each kind of evidence is weighted for what it can actually support. Ratings can't inflate scores. |
| D79 | Proposed BE-068 (`GET /talent/assessments/{id}/items`, user token) plus additive DTO fields (`development` type, `objectives`, `respondent`, `selected_option_key`, `rating`). These are all proposed and documented in the integration spec and handover. Without BE-068, scoring degrades gracefully. | BE-064 needs a service token that doesn't exist. Self, manager and SJT assessments need these fields. Nothing is assumed to exist. |
| D80 | Blind evaluation: responses are redacted and the employee's name is masked (via BE-010, optional). Prompts carry no identity, and rationales are validated against decision language and unsupported inference about potential or personal attributes. | Fairness, and no inferring talent potential from unsupported information |
| D81 | Assessment design covers 8 methods with a method → question-type and competency-category map (leadership → behavioural, technical → technical/knowledge). One set of design rules validates generation and edits. Competencies, bands and criteria are fixed from the framework. | Valid, job-related instruments grounded in the organisation's framework |
| D82 | Sharing happens only after assessor review: confirmed shortfalls for employee subjects of promotion/development assessments. Dev Plan gets a follow-up step. Coaching (self-only) gets a `practice_scenario` suggestion for the employee. The orchestrator now picks the suggestion kind by target agent. | Validated results only. Coaching stays the employee's own (D56). |
| D83 | Reports need **committed** scores (the backend is the record). Reviewed-evaluation evidence is reused only when the committed score equals the reviewer's final score. Recommendations use organisational resources only, and candidates get none. | Reports can't drift from the official record or cite evidence for a different score |
| D84 | `SubjectMode` adds `optional` (T4): the subject is checked when given (a manager's direct report) and is not defaulted to the caller. | Managers can request reports for their reports, and candidate reports have no subject |

## Collaborative workflows (Prompt 8)

| # | Decision | Why |
|---|---|---|
| D85 | Workflows sit **above** the orchestrator. Each agent step is an orchestrator execution run as the person acting at that moment, and stages declare an actor (`any`, `subject`, `assessor`, `approver`). If the caller isn't the actor, the workflow waits for the right person instead of borrowing rights. | Multi-person processes without bypassing permissions. The agents' governance is reused unchanged. |
| D86 | Human checkpoints wait on the existing review mechanisms (T3 assessor review, draft resolution, commit-report). Those endpoints auto-advance waiting workflows as the acting person. | No parallel approval system. People act where they already do. |
| D87 | Workflow-managed executions drop agent handoffs (audited), so the workflow controls sequencing. D1 accepts `assessment_id` and reads reviewer-confirmed scores from the reviewed result held server-side, never from request arguments. C3 accepts `skill_ids`. | No duplicate plans or suggestions, and confirmed scores can't be spoofed through the API |
| D88 | Persistence uses the `WorkflowStore` interface, with SQLite (WAL, JSON body + indexed columns) when `workflow_store_path` is set and in-memory otherwise. State is written **before** and after each stage, so interrupted stages are re-run on recovery. | Durable, recoverable state without new infrastructure. A shared database later uses the same interface. |
| D89 | Retries are automatic for retryable error codes, with exponential backoff and metrics. Optional stages degrade to `completed_with_warnings`. Required failures stop the workflow until an explicit `retry`, which resumes from the failed stage or a declared `retry_from` (a rejected plan regenerates). | Predictable partial-failure behaviour, and recovery under human control |
| D90 | Duplicate prevention: one active workflow per type and employee, `Idempotency-Key` on start, a per-workflow lock, and stage refs reused on re-run. | Idempotent starts and advances under retries and concurrency |
| D91 | Shared context is built per stage with the acting person's rights (cached per scope). Workflow `data` keeps summaries and IDs only. Coaching history is the employee's own (manager: summaries; HR: skipped). | Shared *authorised* context. Data minimisation. |
| D92 | Audit events for every transition (pseudonymised actor hash), plus `ai_workflow*` metrics, a `workflow.stage` trace span per attempt, and structured logs. | Audit trails and workflow observability |

## Backend integration (Prompt 9)

| # | Decision | Why |
|---|---|---|
| D93 | No backend API documentation was available (no OpenAPI, repo or collection), so integration is built against the proposed contract. Every endpoint stays `proposed` outside dev/test, the client never calls an unconfirmed endpoint, and an OpenAPI gap-report tool (`openapi_check`) is ready for when docs arrive. | Honest integration: nothing pretends to be connected, and the docs can be diffed the moment they exist |
| D94 | Two separate identities. Employee data is read only as the user (forwarded token by default, RFC 8693 exchange optional), and expired tokens are never sent. Client credentials (per tenant, cached, refreshed once on 401, `X-Tenant-ID`) cover reference feeds and AI → backend events only, through a separate `ServiceBackendClient` protocol that agents never receive. | The backend's own permissions always apply to employee data. The service identity can't be used to widen access. |
| D95 | Responses are validated beyond the schema: JSON content type, size cap, API major version, and tenant/employee cross-checks (rejected as contract violations). Deprecation and Sunset headers are counted. | Defence in depth against misrouted or out-of-scope data, and early warning of breaking changes |
| D96 | Retries cover GET, and POST only with an `Idempotency-Key`. 429 is added to the retryable statuses with `Retry-After` honoured (capped). Redirects are never followed. | Safe retries, no duplicate writes, and credentials never leak to another host |
| D97 | HTTP caching is limited to tenant reference data (ETag/TTL, `Cache-Control` respected, tenant-partitioned, invalidated by framework, role and catalogue events). Employee data stays in the short-lived, scope-keyed context cache. | Less load on the backend without caching personal data |
| D98 | Versioning: the major version is in the base URL (startup-validated, https outside dev/test) and in `X-API-Version`. A response with a different major version is a contract violation. | Clear, enforced API versioning |
| D99 | Gaps get proposed endpoints and interfaces only: BE-012 (organisational structure), BE-026 (dictionary search with the user's token) and BE-032 (authorised performance summary with declared withheld fields). They are mocked in dev and wired into no agent until confirmed. | Integration interfaces without pretending the functionality is connected |
| D100 | Integration tests run the real HTTP client, and the whole service in `backend_mode=http`, against a contract-faithful fake backend (permissions, pagination, ETags, OAuth, fault injection) over the ASGI transport. | Tests the integration logic end to end. The same tests target staging later. |

## Frontend integration (Prompt 10)

| # | Decision | Why |
|---|---|---|
| D101 | A server-side BFF (`/api/ai/*` route handler) is the only path from the browser to the AI service. It applies a path allowlist (no `/_dev`, `/events`, `/admin`), attaches credentials server-side, forwards request IDs and idempotency keys, and streams SSE unbuffered with `no-store`. | No LLM or service credentials in the browser. One place to enforce what the UI may call. |
| D102 | Production forwards the platform session token from an httpOnly cookie. Development may exchange the mock persona for a dev token (`AI_DEV_AUTH`), which is never honoured in production. The frontend has no real login yet, so live production calls answer 401 rather than impersonate anyone. | Secure by default. The missing real authentication is stated, not papered over. |
| D103 | The frontend imports the reviewed TS contract through the `@ai/contracts` alias, behind a typed `AiClient` interface, with no copies of types. | The UI and the API can't drift unnoticed; `tsc` checks both |
| D104 | Mock adapters live in `features/ai/mocks` and are selected only by literal build-time env checks at dynamic-import sites, so production bundles contain no mock code (verified). Screens show a banner when the mock is active. | Isolated local development without risk of shipping fake data |
| D105 | New `GET /v1/me/identity` (AI service) returns the verified principal, so screens can adapt (self vs managed employees, assessor-only actions). | The frontend has no trustworthy identity source of its own yet |
| D106 | Assessment delivery is the backend's job. Proposed BE-069/072/073 sit behind an `AssessmentDelivery` adapter whose live implementation reports "not connected" (no calls, no retry). The player is complete and tested on the mock. | No pretending. The UI is ready the moment the endpoints exist. |
| D107 | Data hooks key results by request (no stale overwrites, derived loading) and comply with the React 19 lint rules (no synchronous `setState` in effects, refs written in layout effects). | Correctness under fast navigation and persona switches |
| D108 | Vitest, jsdom and Testing Library are dev dependencies only, run through `scripts/vitest.mjs`, which canonicalises the path (Windows case-insensitive folders otherwise load two Vitest instances). | Reliable `npm test` in this workspace |
| D109 | Prompt-injection defence in depth: escaped `<input_json>` data blocks, reference-data sections that cannot open or close tags, an untrusted-input policy prepended by the gateway to every model call, deterministic scoring, and a pattern scanner (`security/injection.py`). | No single layer is trusted. The scanner informs humans (audit and assessor integrity warnings) and never blocks a user, because false positives must not stop coaching. |
| D110 | Central audit log (`security/audit.py`) of consequential and security events, with pseudonymised actors and no content, exposed tenant-scoped to HR/L&D and platform admins at `GET /v1/audit/events`. | One place to answer "who approved what, when". In-memory for now; a durable sink is a production prerequisite. |
| D111 | Per-user and per-tenant sliding-window rate limits, enforced in authentication after token verification, returning `429` with `Retry-After`. | Protects model spend and the backend from runaway clients. Limits are configurable; `0` disables. |
| D112 | Evaluation datasets (`ai-service/evals/datasets`) run against the production code paths by `python -m cfp_ai.evals`, with thresholds enforced by `tests/test_evals.py`. Known detector gaps are kept in the datasets as labelled misses, not removed. | Measurable quality that cannot silently regress, and an honest record of what is not caught. |
| D113 | Readiness separates critical checks (LLM provider and core route, workflow store, draining) from advisory ones (JWKS, backend, durable state). Only critical failures return 503. | Shared dependencies would otherwise take every replica out of rotation at once, turning a partial outage into a total one. Advisory problems alert instead. |
| D114 | Per-tenant monthly token budgets are checked in the LLM gateway before each call (`429 budget_exceeded`), with usage tracked per tenant and month. Prometheus remains the durable cost record. | One enforcement point covers every agent. The in-memory tracker is fast but resets on restart, so Prometheus alerts are the backstop until Redis exists. |
| D115 | Error reporting is log-first (fingerprint, metric, alert). Sentry is optional, not bundled, and configured to send no PII. | Works with any log pipeline; avoids shipping content or identities to a third party by default. |
| D116 | A single in-process maintenance scheduler runs the coaching retention purge (hourly, configurable, can be disabled for an external scheduler). | Retention was implemented but never scheduled. In-process scheduling is correct while state is per process; it moves to a CronJob with durable stores. |
| D117 | Deploy as one replica with `Recreate`, a read-only root filesystem, a non-root user, a `/data` PVC, internal-only metrics and readiness, and an ingress exposing only `/v1/*` and `/healthz`. | Matches today's per-process state honestly; least privilege by default. Horizontal scaling is documented as gated on durable stores. |
| D118 | The BFF bounds every upstream call (`AI_REQUEST_TIMEOUT_MS`), cancels it on browser disconnect, and rejects bodies over 1 MB before forwarding. | Abandoned streams were spending LLM tokens for nobody; oversized bodies never need to cross the network. |

## Verification performed

- (Prompt 12, latest) `pytest`: 402 tests pass (18 new operations tests). `ruff` and `mypy --strict` (130 files) are clean. Frontend: 46 tests, `tsc`, ESLint and `next build` pass. A production-mode boot over HTTP confirmed the probes, 404 on dev and docs routes, 401 without a token and 413 on oversized bodies, and the startup guard refuses dev settings. **Not verified:** `docker build` and cluster deployment. See `docs/ai/PRODUCTION_READINESS_REPORT.md`.
- (Prompt 11, latest) `pytest`: 384 tests pass, including the QA security probes (25) and the evaluation gates (16). `ruff check`, `ruff format --check` and `mypy --strict` (126 files) are clean. `python -m cfp_ai.evals`: all 20 metrics meet their thresholds. Frontend: `npm test` (44 tests), `tsc --noEmit` and ESLint pass. See `docs/ai/QA_REPORT.md`.
- `pytest`: 343 tests pass (122 foundation + 42 orchestrator + 42 Coaching Agent + 24 Development Plan Agent + 60 Talent Assessment Agent + 18 workflows + 34 backend integration and settings + 1 identity), including real-SDK adapter tests, the HTTP client over a mock transport, mock-backend authorisation, end-to-end flows through HTTP, and a prod-isolation subprocess test.
- `mypy --strict` passes on 118 source files, and `ruff check` / `ruff format` are clean.
- Frontend: `npm test` (42 tests), `tsc --noEmit`, ESLint on the new code, and `next build` (94 pages; no mock or secret in the client bundle). A live run of the production build against the AI service confirmed the BFF's authentication, allowlist and SSE streaming.
- The contract consistency check passes (44 BE IDs vs registry, 18 capabilities and 17 error codes in TS/Python parity, 87 TS endpoints present in the API spec). The frontend `tsc --noEmit` and `eslint` pass on the TS contract.
- (Prompt 3) Wheel built and installed into a clean venv. The mock package was deleted (as the Dockerfile does), the app started with production settings, `/healthz` and `/readyz` returned OK, docs and dev routes returned 404, and mock mode was refused at startup.
- The dev server ran over real HTTP with the dev token and the diagnostics flow (manager → report: 200, manager → non-report: 403).
- **Not verified:** `docker build` (Docker is not installed on this machine). The Dockerfile's runtime-stage logic was reproduced manually as described above.
