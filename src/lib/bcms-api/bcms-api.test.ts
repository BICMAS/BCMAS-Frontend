// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";

import { bcmsApiConfig, portalFor, sessionUserFrom, signIn } from "./index";

const CONFIG = { baseUrl: "https://api.example", sessionCookie: "bcms_session", production: true };
const request = (body: unknown, origin = "http://app", extra: Record<string, string> = {}) =>
  new Request("http://app/api/auth/login", {
    method: "POST",
    headers: { origin, host: "app", "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jar.set.mockReset();
  jar.delete.mockReset();
  vi.stubEnv("BCMS_API_URL", "https://api.example");
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Settings", () => {
  it("accepts only an HTTPS backend, or one on this computer", () => {
    expect(bcmsApiConfig({ BCMS_API_URL: "https://bcms-backend.up.railway.app/" }).baseUrl).toBe("https://bcms-backend.up.railway.app");
    expect(bcmsApiConfig({ BCMS_API_URL: "http://localhost:4000" }).baseUrl).toBe("http://localhost:4000");
    expect(bcmsApiConfig({ BCMS_API_URL: "http://evil.example" }).baseUrl).toBeNull();
    expect(bcmsApiConfig({}).baseUrl).toBeNull();
  });
});

describe("Reading the person", () => {
  it("maps role names to the least powerful portal that fits", () => {
    expect(portalFor("PLATFORM_SUPER_ADMIN")).toBe("platform_super_admin");
    expect(portalFor("HR Admin")).toBe("organisation_admin");
    expect(portalFor("ORG_ADMIN")).toBe("organisation_admin");
    expect(portalFor("hrbp")).toBe("hr_ld_admin");
    expect(portalFor("LINE_MANAGER")).toBe("line_manager");
    expect(portalFor("employee")).toBe("employee");
    expect(portalFor("something new")).toBe("employee");
    expect(portalFor(null)).toBe("employee");
  });

  it("reads common shapes and never invents an id", () => {
    const user = sessionUserFrom({ id: 7, _id: "u1", email: "ada@acme.example", firstName: "Ada", lastName: "Obi", role: { name: "HRBP" }, organisation: { id: "o1", name: "Acme" } });
    expect(user).toMatchObject({ id: "live-u1", name: "Ada Obi", portal: "hr_ld_admin", roleLabel: "HRBP", organisationId: "o1", organisationName: "Acme" });
    expect(sessionUserFrom({ name: "No email" })).toBeNull();
  });
});

describe("Signing in", () => {
  it("sends the email and password, passes on the person's address, and reads the token and user", async () => {
    const backend = vi.fn(async () => Response.json({ accessToken: "secret-token", expiresIn: 3600, user: { id: "u1", email: "ada@acme.example", name: "Ada", role: "EMPLOYEE", organisationId: "o1" } }));
    const result = await signIn(CONFIG, { email: "ada@acme.example", password: "pw", ip: "203.0.113.9" }, backend as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, token: "secret-token", maxAgeSeconds: 3600, user: { email: "ada@acme.example", portal: "employee" } });
    const [url, init] = backend.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/api/v1/auth/login");
    expect(JSON.parse(String(init.body))).toEqual({ email: "ada@acme.example", password: "pw" });
    expect(new Headers(init.headers).get("x-forwarded-for")).toBe("203.0.113.9");
  });

  it("asks /auth/me with the token when the login reply has no person", async () => {
    const backend = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/login")
        ? Response.json({ data: { token: "t2" } })
        : (expect(new Headers(init?.headers).get("authorization")).toBe("Bearer t2"), Response.json({ data: { id: "u2", email: "b@acme.example", role: "LINE_MANAGER" } })),
    );
    const result = await signIn(CONFIG, { email: "b@acme.example", password: "pw", ip: null }, backend as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, token: "t2", maxAgeSeconds: 8 * 3600, user: { portal: "line_manager" } });
  });

  it("passes on wrong passwords, field problems and rate limits, and hides server errors", async () => {
    const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => vi.fn(async () => Response.json(body, { status, headers }));
    const run = (backend: ReturnType<typeof reply>) => signIn(CONFIG, { email: "a@b.c", password: "x", ip: null }, backend as unknown as typeof fetch);
    expect(await run(reply(401, { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }))).toMatchObject({ ok: false, status: 401, message: "Invalid email or password" });
    expect(await run(reply(400, { error: { code: "BAD_REQUEST", details: [{ path: "email", message: "Enter a valid email address" }] } }))).toMatchObject({ status: 400, fields: { email: "Enter a valid email address" } });
    expect(await run(reply(429, {}, { ratelimit: '"10-in-15min"; r=0; t=840' }))).toMatchObject({ status: 429, retryAfterSeconds: 840 });
    expect(await run(reply(500, { error: { message: "db password is hunter2" } }))).toMatchObject({ status: 502, code: "UNAVAILABLE" });
    expect(await signIn(CONFIG, { email: "a@b.c", password: "x", ip: null }, vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch)).toMatchObject({ code: "UNAVAILABLE" });
  });
});

describe("Routes", () => {
  it("puts the token in an httpOnly cookie and returns only the person", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ token: "secret-token", user: { id: "u1", email: "ada@acme.example", role: "HR_ADMIN" } })));
    const response = await login(request({ email: "ada@acme.example", password: "pw" }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("secret-token");
    expect(JSON.parse(text).user).toMatchObject({ portal: "organisation_admin" });
    expect(jar.set).toHaveBeenCalledWith("bcms_session", "secret-token", expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }));
  });

  it("refuses other sites, empty forms and a missing setting", async () => {
    const backend = vi.fn();
    vi.stubGlobal("fetch", backend);
    expect((await login(request({ email: "a@b.c", password: "x" }, "http://evil"))).status).toBe(403);
    expect((await login(request({ email: "", password: "" }))).status).toBe(400);
    vi.stubEnv("BCMS_API_URL", "");
    expect((await login(request({ email: "a@b.c", password: "x" }))).status).toBe(404);
    expect(backend).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("passes on a rate limit with Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "TOO_MANY", message: "Slow down" } }, { status: 429, headers: { "retry-after": "60" } })));
    const response = await login(request({ email: "a@b.c", password: "x" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("signs out by removing the cookie", async () => {
    const response = await logout(new Request("http://app/api/auth/logout", { method: "POST", headers: { origin: "http://app", host: "app" } }));
    expect(response.status).toBe(204);
    expect(jar.delete).toHaveBeenCalledWith("bcms_session");
  });
});
