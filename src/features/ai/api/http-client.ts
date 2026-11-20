import type {
  CoachingTurnResult,
  CoachTurnResult,
  ErrorBody,
} from "@ai/contracts";

import type { AiClient, DeltaHandler } from "./client";
import { newClientId } from "./client";
import { AiApiError } from "./errors";
import { readSse } from "./sse";

/** Same-origin backend-for-frontend route (src/app/api/ai/[...path]). The browser never calls the AI service directly. */
export const AI_BFF_BASE = "/api/ai";
export const DEV_USER_HEADER = "x-cfp-dev-user";

type RequestOptions = {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
};

export type HttpAiClientOptions = {
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Development only: the mock persona to act as (honoured by the BFF only when AI_DEV_AUTH is on). */
  devUser?: () => string | undefined;
};

export class HttpAiClient implements AiClient {
  readonly mode = "live" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;
  private readonly devUser?: () => string | undefined;

  constructor(options: HttpAiClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.base = options.baseUrl ?? AI_BFF_BASE;
    this.devUser = options.devUser;
  }

  // ── transport ──────────────────────────────────────────────────────────

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Request-ID": newClientId("req"),
      ...extra,
    };
    const user = this.devUser?.();
    if (user) headers[DEV_USER_HEADER] = user;
    return headers;
  }

  private url(path: string, query?: RequestOptions["query"]): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    return `${this.base}${path}${qs ? `?${qs}` : ""}`;
  }

  private async send(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
    const hasBody = options.body !== undefined;
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path, options.query), {
        method,
        credentials: "same-origin",
        headers: this.headers({ ...(hasBody ? { "Content-Type": "application/json" } : {}), ...options.headers }),
        body: hasBody ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new AiApiError("network_error", "The AI service could not be reached. Check your connection and try again.", {
        retryable: true,
      });
    }
    if (!response.ok) throw await toError(response);
    return response;
  }

  private async json<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    const response = await this.send(method, path, options);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** POST that streams `delta` frames and resolves with the `result` frame (JSON fallback when not streamed). */
  private async stream<T>(path: string, body: unknown, onDelta?: DeltaHandler): Promise<T> {
    const response = await this.send("POST", path, { body, headers: { Accept: "text/event-stream" } });
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream") || !response.body) return (await response.json()) as T;
    let result: T | undefined;
    for await (const frame of readSse(response.body)) {
      if (frame.event === "delta") onDelta?.(String((frame.data as { text?: string }).text ?? ""));
      else if (frame.event === "result") result = frame.data as T;
      else if (frame.event === "error") throw AiApiError.fromBody(frame.data as ErrorBody, 200);
    }
    if (result === undefined) {
      throw new AiApiError("internal_error", "The response ended before it was complete. Please try again.", {
        retryable: true,
      });
    }
    return result;
  }

  // ── capability centre ──────────────────────────────────────────────────

  getIdentity: AiClient["getIdentity"] = () => this.json("GET", "/v1/me/identity");
  getCapabilities: AiClient["getCapabilities"] = () => this.json("GET", "/v1/capabilities");
  listAgents: AiClient["listAgents"] = () => this.json("GET", "/v1/orchestrator/agents");
  listSuggestions: AiClient["listSuggestions"] = () => this.json("GET", "/v1/suggestions");
  dismissSuggestion: AiClient["dismissSuggestion"] = (id) =>
    this.json("POST", `/v1/suggestions/${encodeURIComponent(id)}/dismiss`);
  runOrchestration: AiClient["runOrchestration"] = (request) =>
    this.json("POST", "/v1/orchestrator/executions", { body: request });
  listExecutions: AiClient["listExecutions"] = () =>
    this.json("GET", "/v1/orchestrator/executions", { query: { limit: 20 } });
  getExecution: AiClient["getExecution"] = (id) =>
    this.json("GET", `/v1/orchestrator/executions/${encodeURIComponent(id)}`);
  listWorkflowDefinitions: AiClient["listWorkflowDefinitions"] = () => this.json("GET", "/v1/workflows/definitions");
  listWorkflows: AiClient["listWorkflows"] = () => this.json("GET", "/v1/workflows");
  startWorkflow: AiClient["startWorkflow"] = (request, idempotencyKey) =>
    this.json("POST", "/v1/workflows", {
      body: request,
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    });
  advanceWorkflow: AiClient["advanceWorkflow"] = (id) =>
    this.json("POST", `/v1/workflows/${encodeURIComponent(id)}/advance`);
  retryWorkflow: AiClient["retryWorkflow"] = (id) => this.json("POST", `/v1/workflows/${encodeURIComponent(id)}/retry`);
  cancelWorkflow: AiClient["cancelWorkflow"] = (id) =>
    this.json("POST", `/v1/workflows/${encodeURIComponent(id)}/cancel`);

  // ── coaching ───────────────────────────────────────────────────────────

  listModes: AiClient["listModes"] = () => this.json("GET", "/v1/coaching/modes");
  listConversations: AiClient["listConversations"] = () => this.json("GET", "/v1/coaching/conversations");
  startConversation: AiClient["startConversation"] = (request) =>
    this.json("POST", "/v1/coaching/conversations", { body: request });
  getConversation: AiClient["getConversation"] = (id) =>
    this.json("GET", `/v1/coaching/conversations/${encodeURIComponent(id)}`);
  sendConversationMessage: AiClient["sendConversationMessage"] = (id, text, clientMessageId, onDelta) =>
    this.stream<CoachingTurnResult>(
      `/v1/coaching/conversations/${encodeURIComponent(id)}/messages`,
      { text, client_message_id: clientMessageId },
      onDelta,
    );
  endConversation: AiClient["endConversation"] = (id) =>
    this.json("POST", `/v1/coaching/conversations/${encodeURIComponent(id)}/end`);
  getConversationSummary: AiClient["getConversationSummary"] = (id) =>
    this.json("GET", `/v1/coaching/conversations/${encodeURIComponent(id)}/summary`);
  listScenarios: AiClient["listScenarios"] = () => this.json("GET", "/v1/coaching/scenarios");
  recommendedScenarios: AiClient["recommendedScenarios"] = () =>
    this.json("GET", "/v1/coaching/scenarios/recommended", { query: { limit: 3 } });
  startSession: AiClient["startSession"] = (scenarioId) =>
    this.json("POST", "/v1/coaching/sessions", { body: { scenario_id: scenarioId, mode: "practice" } });
  listSessions: AiClient["listSessions"] = () => this.json("GET", "/v1/coaching/sessions");
  getSession: AiClient["getSession"] = (id) => this.json("GET", `/v1/coaching/sessions/${encodeURIComponent(id)}`);
  sendSessionMessage: AiClient["sendSessionMessage"] = (id, text, clientMessageId, onDelta) =>
    this.stream<CoachTurnResult>(
      `/v1/coaching/sessions/${encodeURIComponent(id)}/messages`,
      { text, client_message_id: clientMessageId },
      onDelta,
    );
  endSession: AiClient["endSession"] = (id) => this.json("POST", `/v1/coaching/sessions/${encodeURIComponent(id)}/end`);
  getEvaluation: AiClient["getEvaluation"] = (id) =>
    this.json("GET", `/v1/coaching/sessions/${encodeURIComponent(id)}/evaluation`);
  getCoachMetrics: AiClient["getCoachMetrics"] = () => this.json("GET", "/v1/coaching/metrics/me");

  // ── training plans ─────────────────────────────────────────────────────

  getGaps: AiClient["getGaps"] = (employeeId) =>
    this.json("GET", `/v1/dev-plans/gaps/${encodeURIComponent(employeeId)}`);
  getLearningRecommendations: AiClient["getLearningRecommendations"] = ({ employeeId, skillId, limit }) =>
    this.json("GET", "/v1/dev-plans/recommendations/learning", {
      query: { employee_id: employeeId, skill_id: skillId, limit },
    });
  draftPlan: AiClient["draftPlan"] = (request) => this.json("POST", "/v1/dev-plans/drafts", { body: request });
  listDrafts: AiClient["listDrafts"] = (query = {}) =>
    this.json("GET", "/v1/drafts", {
      query: { subject_employee_id: query.subjectEmployeeId, status: query.status },
    });
  getDraft: AiClient["getDraft"] = (id) => this.json("GET", `/v1/drafts/${encodeURIComponent(id)}`);
  resolveDraft: AiClient["resolveDraft"] = (id, request) =>
    this.json("POST", `/v1/drafts/${encodeURIComponent(id)}/resolution`, { body: request });
  reportCommit: AiClient["reportCommit"] = (id, committedRef) =>
    this.json("POST", `/v1/drafts/${encodeURIComponent(id)}/commit-report`, { body: { committed_ref: committedRef } });
  getPlanProgress: AiClient["getPlanProgress"] = (planId) =>
    this.json("GET", `/v1/dev-plans/plans/${encodeURIComponent(planId)}/progress`);
  reviewPlan: AiClient["reviewPlan"] = (planId, trigger) =>
    this.json("POST", `/v1/dev-plans/plans/${encodeURIComponent(planId)}/review`, { body: { trigger } });

  // ── talent assessment ──────────────────────────────────────────────────

  designAssessment: AiClient["designAssessment"] = (request) =>
    this.json("POST", "/v1/talent/item-drafts", { body: request });
  scoreAssessment: AiClient["scoreAssessment"] = (assessmentId, request) =>
    this.json("POST", `/v1/talent/assessments/${encodeURIComponent(assessmentId)}/scoring`, { body: request });
  getScoringSet: AiClient["getScoringSet"] = (id) =>
    this.json("GET", `/v1/talent/scoring-sets/${encodeURIComponent(id)}`);
  reviewScoringSet: AiClient["reviewScoringSet"] = (id, decision) =>
    this.json("POST", `/v1/talent/scoring-sets/${encodeURIComponent(id)}/reviews`, { body: decision });
  draftAssessmentReport: AiClient["draftAssessmentReport"] = (assessmentId) =>
    this.json("POST", `/v1/talent/assessments/${encodeURIComponent(assessmentId)}/report-drafts`);
}

async function toError(response: Response): Promise<AiApiError> {
  try {
    const payload = (await response.json()) as { error?: ErrorBody };
    const retryAfter = Number(response.headers.get("retry-after"));
    if (payload.error?.code) {
      return AiApiError.fromBody(payload.error, response.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
    }
  } catch {
    // fall through: non-JSON error
  }
  return new AiApiError(response.status >= 500 ? "upstream_unavailable" : "internal_error", "The AI request failed.", {
    status: response.status,
    retryable: response.status >= 500,
  });
}
