/**
 * Server-only backend-for-frontend (BFF) for the AI service.
 *
 * The browser only ever talks to `/api/ai/*` on its own origin. This module, running on the
 * Next.js server, attaches the caller's credentials and forwards the request to the AI
 * service. LLM provider keys live only in the AI service; AI service URLs and dev secrets live
 * only in server environment variables (never `NEXT_PUBLIC_*`).
 *
 * Credentials:
 *  - production: the platform session token from the httpOnly cookie set by the real
 *    authentication system (`AI_SESSION_COOKIE`, default `cfp_session`), forwarded as a bearer
 *    token. The frontend has no real authentication yet, so until it exists, live calls in
 *    production are rejected with 401 rather than impersonating anyone.
 *  - local development only (`AI_DEV_AUTH=true`, never in production): the mock persona named
 *    by the `x-cfp-dev-user` header is exchanged for a dev token from the AI service's
 *    `/v1/_dev/tokens`, cached server-side.
 */

export type BffConfig = {
  serviceUrl: string | null;
  devAuth: boolean;
  sessionCookie: string;
  production: boolean;
  /** Upper bound for one upstream call, streams included (`AI_REQUEST_TIMEOUT_MS`, default 300 s). */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 300_000;
/** Matches the AI service's CFP_AI_MAX_REQUEST_BODY_BYTES default; larger bodies never leave the BFF. */
export const MAX_BODY_BYTES = 1_000_000;

export function bffConfig(env: Record<string, string | undefined> = process.env): BffConfig {
  const production = env.NODE_ENV === "production";
  const timeout = Number(env.AI_REQUEST_TIMEOUT_MS);
  return {
    serviceUrl: env.AI_SERVICE_URL ? env.AI_SERVICE_URL.replace(/\/+$/, "") : null,
    devAuth: !production && env.AI_DEV_AUTH === "true",
    sessionCookie: env.AI_SESSION_COOKIE || "cfp_session",
    production,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);
/** Never reachable from the browser: dev tooling, the backend webhook, platform admin, internals. */
const BLOCKED_PREFIXES = ["_dev", "events", "admin", "internal"];
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

export function isAllowedRequest(method: string, segments: string[]): boolean {
  if (!ALLOWED_METHODS.has(method)) return false;
  if (segments.length < 2 || segments[0] !== "v1") return false;
  if (BLOCKED_PREFIXES.includes(segments[1]!)) return false;
  return segments.every((s) => SEGMENT.test(s) && s !== "." && s !== "..");
}

const DEV_PERSONAS = new Set(["alex", "sarah", "priya", "michael", "james", "ama"]);
const devTokens = new Map<string, { token: string; until: number }>();
const DEV_TOKEN_TTL_MS = 10 * 60_000;

export function clearDevTokenCache(): void {
  devTokens.clear();
}

export class BffError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function resolveAuthorization(
  headers: Headers,
  config: BffConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const session = readCookie(headers.get("cookie"), config.sessionCookie);
  if (session) return `Bearer ${session}`;
  const devUser = headers.get("x-cfp-dev-user");
  if (config.devAuth && devUser) {
    const persona = devUser.replace(/^user-/, "");
    if (!DEV_PERSONAS.has(persona)) throw new BffError(401, "unauthenticated", "Unknown development persona.");
    const cached = devTokens.get(persona);
    if (cached && cached.until > Date.now()) return `Bearer ${cached.token}`;
    const response = await fetchImpl(`${config.serviceUrl}/v1/_dev/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona }),
      cache: "no-store",
    });
    if (!response.ok) throw new BffError(502, "ai_unavailable", "Could not obtain a development token from the AI service.");
    const { access_token: token } = (await response.json()) as { access_token: string };
    devTokens.set(persona, { token, until: Date.now() + DEV_TOKEN_TTL_MS });
    return `Bearer ${token}`;
  }
  throw new BffError(401, "unauthenticated", "Please sign in to use AI features.");
}

const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "idempotency-key", "x-request-id"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after", "x-request-id"];

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message, request_id: "bff", retryable: status >= 500 } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

/** Forwards one browser request to the AI service with the caller's credentials. */
export async function proxyToAi(
  request: Request,
  segments: string[],
  config: BffConfig = bffConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!config.serviceUrl) return errorResponse(503, "ai_unavailable", "The AI service is not configured.");
  if (!isAllowedRequest(request.method, segments)) return errorResponse(404, "not_found", "Not found.");
  let authorization: string;
  try {
    authorization = await resolveAuthorization(request.headers, config, fetchImpl);
  } catch (error) {
    if (error instanceof BffError) return errorResponse(error.status, error.code, error.message);
    return errorResponse(502, "ai_unavailable", "The AI service could not be reached.");
  }
  const upstream = new URL(`${config.serviceUrl}/${segments.join("/")}`);
  upstream.search = new URL(request.url).search;
  const headers = new Headers({ Authorization: authorization });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  const body = hasBody ? await request.text() : undefined;
  if (body !== undefined && new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return errorResponse(413, "invalid_request", "The request body is too large.");
  }
  // Cancel the upstream call (and its LLM stream) when the browser goes away or the call runs too long.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS)]);
  let response: Response;
  try {
    response = await fetchImpl(upstream, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return errorResponse(504, "deadline_exceeded", "The AI service took too long to respond.");
    }
    return errorResponse(502, "upstream_unavailable", "The AI service could not be reached.");
  }
  const out = new Headers({ "Cache-Control": "no-store" });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) out.set("X-Accel-Buffering", "no");
  return new Response(response.status === 204 ? null : response.body, { status: response.status, headers: out });
}
