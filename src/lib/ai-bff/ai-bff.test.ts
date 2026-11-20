import { beforeEach, describe, expect, it, vi } from "vitest";

import { bffConfig, clearDevTokenCache, isAllowedRequest, proxyToAi, type BffConfig } from "./index";

const DEV: BffConfig = { serviceUrl: "http://ai.local", devAuth: true, sessionCookie: "cfp_session", production: false };
const PROD: BffConfig = { ...DEV, devAuth: false, production: true };

function upstream(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const tokenEndpoint = (url: string) => url.endsWith("/v1/_dev/tokens");

beforeEach(() => clearDevTokenCache());

describe("BFF configuration", () => {
  it("never enables dev auth in production and needs the service URL", () => {
    expect(bffConfig({ NODE_ENV: "production", AI_DEV_AUTH: "true", AI_SERVICE_URL: "https://ai/" })).toMatchObject({
      devAuth: false,
      serviceUrl: "https://ai",
    });
    expect(bffConfig({ NODE_ENV: "development", AI_DEV_AUTH: "true" })).toMatchObject({ devAuth: true, serviceUrl: null });
  });

  it("allows only public AI API paths", () => {
    expect(isAllowedRequest("GET", ["v1", "coaching", "modes"])).toBe(true);
    expect(isAllowedRequest("GET", ["v1", "_dev", "tokens"])).toBe(false);
    expect(isAllowedRequest("POST", ["v1", "events"])).toBe(false);
    expect(isAllowedRequest("GET", ["v1", "admin", "health"])).toBe(false);
    expect(isAllowedRequest("GET", ["v1", "..", "internal"])).toBe(false);
    expect(isAllowedRequest("PUT", ["v1", "drafts", "x"])).toBe(false);
    expect(isAllowedRequest("GET", ["healthz"])).toBe(false);
  });
});

describe("proxyToAi", () => {
  it("returns 503 when the AI service is not configured", async () => {
    const response = await proxyToAi(new Request("http://app/api/ai/v1/capabilities"), ["v1", "capabilities"], {
      ...DEV,
      serviceUrl: null,
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ai_unavailable");
  });

  it("blocks dev/admin/webhook routes without calling the service", async () => {
    const { fetchImpl, calls } = upstream(() => Response.json({}));
    const response = await proxyToAi(new Request("http://app/api/ai/v1/_dev/tokens", { method: "POST" }), ["v1", "_dev", "tokens"], DEV, fetchImpl);
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("forwards the platform session cookie as a bearer token, and nothing else of the browser's cookies", async () => {
    const { fetchImpl, calls } = upstream(() => Response.json({ ok: true }, { headers: { "set-cookie": "x=1" } }));
    const request = new Request("http://app/api/ai/v1/me/identity?x=1", {
      headers: { cookie: "theme=dark; cfp_session=platform-jwt; other=1", "x-request-id": "req-9", "x-cfp-dev-user": "user-alex" },
    });
    const response = await proxyToAi(request, ["v1", "me", "identity"], PROD, fetchImpl);
    expect(response.status).toBe(200);
    const sent = new Headers(calls[0]!.init.headers);
    expect(calls[0]!.url).toBe("http://ai.local/v1/me/identity?x=1");
    expect(sent.get("authorization")).toBe("Bearer platform-jwt");
    expect(sent.get("cookie")).toBeNull();
    expect(sent.get("x-request-id")).toBe("req-9");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unauthenticated production requests, even with a dev persona header", async () => {
    const { fetchImpl, calls } = upstream(() => Response.json({}));
    const request = new Request("http://app/api/ai/v1/capabilities", { headers: { "x-cfp-dev-user": "user-james" } });
    const response = await proxyToAi(request, ["v1", "capabilities"], PROD, fetchImpl);
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("in development, exchanges the persona for a cached dev token", async () => {
    const { fetchImpl, calls } = upstream((url) =>
      tokenEndpoint(url) ? Response.json({ access_token: "dev-jwt-james", claims: {} }) : Response.json({ ok: true }),
    );
    const make = () => new Request("http://app/api/ai/v1/capabilities", { headers: { "x-cfp-dev-user": "user-james" } });
    await proxyToAi(make(), ["v1", "capabilities"], DEV, fetchImpl);
    await proxyToAi(make(), ["v1", "capabilities"], DEV, fetchImpl);
    const tokenCalls = calls.filter((c) => tokenEndpoint(c.url));
    expect(tokenCalls).toHaveLength(1);
    expect(JSON.parse(String(tokenCalls[0]!.init.body))).toEqual({ persona: "james" });
    const forwarded = calls.filter((c) => !tokenEndpoint(c.url)).map((c) => new Headers(c.init.headers).get("authorization"));
    expect(forwarded).toEqual(["Bearer dev-jwt-james", "Bearer dev-jwt-james"]);
    const unknown = await proxyToAi(
      new Request("http://app/api/ai/v1/capabilities", { headers: { "x-cfp-dev-user": "user-root" } }),
      ["v1", "capabilities"],
      DEV,
      fetchImpl,
    );
    expect(unknown.status).toBe(401);
  });

  it("passes request bodies through and streams SSE responses back unbuffered", async () => {
    const { fetchImpl, calls } = upstream(
      () => new Response("event: done\ndata: {}\n\n", { headers: { "content-type": "text/event-stream" } }),
    );
    const request = new Request("http://app/api/ai/v1/coaching/conversations/cv_1/messages", {
      method: "POST",
      headers: { cookie: "cfp_session=t", accept: "text/event-stream", "content-type": "application/json", "idempotency-key": "k1" },
      body: JSON.stringify({ text: "hi", client_message_id: "cm_12345678" }),
    });
    const response = await proxyToAi(request, ["v1", "coaching", "conversations", "cv_1", "messages"], PROD, fetchImpl);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ text: "hi", client_message_id: "cm_12345678" });
    const sent = new Headers(calls[0]!.init.headers);
    expect(sent.get("accept")).toBe("text/event-stream");
    expect(sent.get("idempotency-key")).toBe("k1");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toContain("event: done");
  });

  it("maps an unreachable AI service to 502", async () => {
    const fetchImpl = (() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    const request = new Request("http://app/api/ai/v1/capabilities", { headers: { cookie: "cfp_session=t" } });
    const response = await proxyToAi(request, ["v1", "capabilities"], PROD, fetchImpl);
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("upstream_unavailable");
  });
});
