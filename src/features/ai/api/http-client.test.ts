import { describe, expect, it, vi } from "vitest";

import { AiApiError, describeAiError } from "./errors";
import { HttpAiClient } from "./http-client";

type Call = { url: string; init: RequestInit };

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function sse(frames: Array<[string, unknown]>): Response {
  const body = frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

const headersOf = (call: Call) => call.init.headers as Record<string, string>;

describe("HttpAiClient", () => {
  it("calls only the same-origin BFF, with a request ID and the dev persona header", async () => {
    const { fetch, calls } = fakeFetch(() => Response.json({ items: [], next_cursor: null }));
    const client = new HttpAiClient({ fetch, devUser: () => "user-james" });
    await client.listSuggestions();
    await client.getGaps("emp/../x");
    expect(calls[0]!.url).toBe("/api/ai/v1/suggestions");
    expect(calls[1]!.url).toBe("/api/ai/v1/dev-plans/gaps/emp%2F..%2Fx");
    expect(headersOf(calls[0]!)["x-cfp-dev-user"]).toBe("user-james");
    expect(headersOf(calls[0]!)["X-Request-ID"]).toMatch(/^req_/);
    expect(calls[0]!.init.credentials).toBe("same-origin");
    expect(JSON.stringify(calls)).not.toMatch(/sk-|api[_-]?key/i);
  });

  it("sends JSON bodies, query strings and idempotency keys", async () => {
    const { fetch, calls } = fakeFetch(() => Response.json({}));
    const client = new HttpAiClient({ fetch });
    await client.getLearningRecommendations({ employeeId: "emp-1", limit: 3 });
    await client.startWorkflow({ type: "personal_development" }, "idem-1");
    expect(calls[0]!.url).toBe("/api/ai/v1/dev-plans/recommendations/learning?employee_id=emp-1&limit=3");
    expect(calls[1]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ type: "personal_development" });
    expect(headersOf(calls[1]!)["Idempotency-Key"]).toBe("idem-1");
    expect(headersOf(calls[1]!)["x-cfp-dev-user"]).toBeUndefined();
  });

  it("turns the service error envelope into an AiApiError with the safe message", async () => {
    const { fetch } = fakeFetch(() =>
      Response.json(
        {
          error: {
            code: "backend_dependency_unconfirmed",
            message: "This feature isn't available yet.",
            request_id: "req_1",
            retryable: false,
            backend_endpoint_ids: ["BE-052"],
          },
        },
        { status: 424 },
      ),
    );
    const error = await new HttpAiClient({ fetch }).listAgents().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiApiError);
    expect(error).toMatchObject({ code: "backend_dependency_unconfirmed", status: 424, requestId: "req_1" });
    expect(describeAiError(error)).toMatchObject({ title: "Not connected yet", retryable: false });
    expect(describeAiError(error).message).toContain("BE-052");
  });

  it("reports network failures and non-JSON errors as retryable", async () => {
    const offline = new HttpAiClient({ fetch: (() => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch });
    await expect(offline.listModes()).rejects.toMatchObject({ code: "network_error", retryable: true });
    const { fetch } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(new HttpAiClient({ fetch }).listModes()).rejects.toMatchObject({ code: "upstream_unavailable", retryable: true });
  });

  it("streams coaching replies and resolves with the result frame", async () => {
    const { fetch, calls } = fakeFetch(() =>
      sse([
        ["meta", { request_id: "r" }],
        ["delta", { text: "Hello " }],
        ["delta", { text: "there" }],
        ["result", { assistant_message: { text: "Hello there" } }],
        ["done", {}],
      ]),
    );
    const deltas: string[] = [];
    const result = await new HttpAiClient({ fetch }).sendConversationMessage("cv_1", "Hi", "cm_12345678", (t) => deltas.push(t));
    expect(deltas.join("")).toBe("Hello there");
    expect(result.assistant_message.text).toBe("Hello there");
    expect(headersOf(calls[0]!).Accept).toBe("text/event-stream");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ text: "Hi", client_message_id: "cm_12345678" });
  });

  it("raises mid-stream error frames and incomplete streams", async () => {
    const failing = fakeFetch(() =>
      sse([
        ["delta", { text: "Par" }],
        ["error", { code: "ai_output_invalid", message: "Try again.", request_id: "r", retryable: true }],
      ]),
    );
    await expect(new HttpAiClient({ fetch: failing.fetch }).sendSessionMessage("cs_1", "x", "cm_12345678")).rejects.toMatchObject({
      code: "ai_output_invalid",
      retryable: true,
    });
    const truncated = fakeFetch(() => sse([["delta", { text: "Par" }]]));
    await expect(new HttpAiClient({ fetch: truncated.fetch }).sendSessionMessage("cs_1", "x", "cm_12345678")).rejects.toMatchObject({
      code: "internal_error",
    });
  });

  it("falls back to JSON when the response is not streamed", async () => {
    const { fetch } = fakeFetch(() => Response.json({ coach_message: { text: "ok" } }));
    const result = await new HttpAiClient({ fetch }).sendSessionMessage("cs_1", "x", "cm_12345678");
    expect(result.coach_message.text).toBe("ok");
  });
});
