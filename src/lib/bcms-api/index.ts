import type { AppRole, UserPortal } from "@/types";

import type { SessionUser } from "./session-user";

/**
 * Server-only connection to the BCMS backend.
 *
 * The browser only calls this app's own `/api/auth/*` routes. They forward to the backend and keep
 * the access token in an httpOnly cookie, so page scripts can never read it.
 *
 * Settings (server only; never NEXT_PUBLIC_*):
 *   BCMS_API_URL         e.g. https://bcms-backend.up.railway.app (off when missing)
 *   AUTH_SESSION_COOKIE  cookie that holds the token (default bcms_session)
 */

export type BcmsApiConfig = {
  baseUrl: string | null;
  sessionCookie: string;
  production: boolean;
};

export function bcmsApiConfig(env: Record<string, string | undefined> = process.env): BcmsApiConfig {
  return {
    baseUrl: validBaseUrl(env.BCMS_API_URL),
    sessionCookie: env.AUTH_SESSION_COOKIE || "bcms_session",
    production: env.NODE_ENV === "production",
  };
}

/** HTTPS only, except a backend running on this computer. */
function validBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Only pages of this app may sign people in. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The person's own address, so the backend's rate limit counts them and not this server. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  return ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}

/* ── reading the backend's replies ─────────────────────────────────────── */

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** The first string under any of these keys, looking in the body, `data` and `tokens`. */
function pick(body: Json, keys: string[]): string | null {
  for (const place of [body, body.data, body.tokens, isObject(body.data) ? body.data.tokens : null]) {
    if (!isObject(place)) continue;
    for (const key of keys) {
      const found = text(place[key]);
      if (found) return found;
    }
  }
  return null;
}

export function tokenFrom(body: Json): string | null {
  return pick(body, ["accessToken", "access_token", "token", "jwt", "idToken"]);
}

const DEFAULT_SESSION_SECONDS = 8 * 3600;
const MAX_SESSION_SECONDS = 24 * 3600;

/** Cookie lifetime: the backend's own expiry when it gives one, at most a day. */
export function sessionSeconds(body: Json): number {
  for (const place of [body, body.data, body.tokens]) {
    if (!isObject(place)) continue;
    const value = Number(place.expiresIn ?? place.expires_in);
    if (Number.isFinite(value) && value > 0) return Math.min(Math.floor(value), MAX_SESSION_SECONDS);
  }
  return DEFAULT_SESSION_SECONDS;
}

function userObject(body: Json): Json | null {
  for (const place of [body.user, isObject(body.data) ? body.data.user : null, body.data, body]) {
    if (isObject(place) && (text(place.email) || text(place.id) || text(place._id))) return place;
  }
  return null;
}

/** Backend role names in any common spelling, mapped to the least powerful portal that fits. */
export function portalFor(role: string | null): UserPortal {
  const r = (role ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (r.includes("platform") || r.includes("superadmin")) return "platform_super_admin";
  if (r.includes("hrbp") || r.includes("businesspartner") || r.includes("hrld") || r === "ldadmin") return "hr_ld_admin";
  if (r.includes("hradmin") || r.includes("organisationadmin") || r.includes("organizationadmin") || r.includes("orgadmin") || r === "admin") {
    return "organisation_admin";
  }
  if (r.includes("manager")) return "line_manager";
  return "employee";
}

const ROLE_LABEL: Record<UserPortal, AppRole> = {
  platform_super_admin: "Platform Super Admin",
  organisation_admin: "HR Admin",
  hr_ld_admin: "HRBP",
  line_manager: "Line Manager",
  employee: "Employee",
};

function roleName(user: Json): string | null {
  const role = user.role ?? user.portal ?? user.roleName ?? (Array.isArray(user.roles) ? user.roles[0] : null);
  return text(role) ?? (isObject(role) ? text(role.name) ?? text(role.code) : null);
}

/** Two letters on a coloured square, for people with no photo. */
function initialsAvatar(name: string) {
  const letters = name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0b2545"/><text x="32" y="41" font-family="Arial" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${letters}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function sessionUserFrom(user: Json): SessionUser | null {
  const email = text(user.email);
  const id = text(user.id) ?? text(user._id) ?? text(user.userId) ?? email;
  if (!id || !email) return null;
  const org = isObject(user.organisation) ? user.organisation : isObject(user.organization) ? user.organization : isObject(user.tenant) ? user.tenant : null;
  const organisationId =
    text(user.organisationId) ?? text(user.organizationId) ?? text(user.tenantId) ?? text(user.orgId) ?? (org ? text(org.id) ?? text(org._id) : null) ?? "unknown";
  const organisationName = (org ? text(org.name) : null) ?? text(user.organisationName) ?? text(user.organizationName) ?? "Your organisation";
  const full = [text(user.firstName), text(user.lastName)].filter(Boolean).join(" ");
  const name = text(user.name) ?? text(user.fullName) ?? (full || null) ?? email;
  const portal = portalFor(roleName(user));
  return {
    id: `live-${id}`,
    name,
    email,
    roleLabel: ROLE_LABEL[portal],
    portal,
    jobTitle: text(user.jobTitle) ?? text(user.title) ?? ROLE_LABEL[portal],
    avatarUrl: text(user.avatarUrl) ?? text(user.photoUrl) ?? initialsAvatar(name),
    organisationId,
    organisationName,
    unreadNotifications: 0,
  };
}

/* ── sign-in ───────────────────────────────────────────────────────────── */

export type SignInFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  /** Field problems from the backend's validation (`email`, `password`). */
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
};
export type SignInResult = { ok: true; token: string; maxAgeSeconds: number; user: SessionUser } | SignInFailure;

const UNAVAILABLE: SignInFailure = { ok: false, status: 502, code: "UNAVAILABLE", message: "Sign-in is unavailable right now. Try again shortly." };

async function readJson(response: Response): Promise<Json | null> {
  try {
    const body: unknown = await response.json();
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
}

/** Seconds from `Retry-After`, or the `t=` part of the IETF `RateLimit` header. */
function retryAfter(response: Response): number | undefined {
  const plain = Number(response.headers.get("retry-after"));
  if (Number.isFinite(plain) && plain > 0) return plain;
  const t = /\bt=(\d+)/.exec(response.headers.get("ratelimit") ?? "")?.[1];
  return t ? Number(t) : undefined;
}

function failure(response: Response, body: Json | null): SignInFailure {
  const error = isObject(body?.error) ? body.error : null;
  const fields: Record<string, string> = {};
  if (error && Array.isArray(error.details)) {
    for (const d of error.details) {
      if (isObject(d) && text(d.path) && text(d.message)) fields[text(d.path)!] = text(d.message)!;
    }
  }
  const status = response.status;
  if (status >= 500) return UNAVAILABLE;
  const code = (error && text(error.code)) || (status === 429 ? "RATE_LIMITED" : status === 401 ? "INVALID_CREDENTIALS" : "SIGN_IN_FAILED");
  const fallback =
    status === 429 ? "Too many sign-in attempts. Wait a few minutes and try again." : status === 401 ? "Invalid email or password." : "Sign-in failed.";
  return {
    ok: false,
    status: [400, 401, 403, 423, 429].includes(status) ? status : 400,
    code,
    // The backend's words are shown as they are; it already avoids saying which part was wrong.
    message: (error && text(error.message)) || fallback,
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(status === 429 ? { retryAfterSeconds: retryAfter(response) } : {}),
  };
}

const TIMEOUT_MS = 15_000;

export async function signIn(
  config: BcmsApiConfig,
  input: { email: string; password: string; ip: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<SignInResult> {
  if (!config.baseUrl) return UNAVAILABLE;
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (input.ip) headers["x-forwarded-for"] = input.ip;
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: input.email, password: input.password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return UNAVAILABLE;
  }
  const body = await readJson(response);
  if (!response.ok) return failure(response, body);
  if (!body) return UNAVAILABLE;
  const token = tokenFrom(body);
  if (!token) {
    const mfa = body.mfaRequired ?? body.requiresMfa ?? (isObject(body.data) ? body.data.mfaRequired : undefined);
    return mfa
      ? { ok: false, status: 409, code: "MFA_REQUIRED", message: "This account needs a verification code, which this app cannot send to BCMS yet." }
      : UNAVAILABLE;
  }
  let user = userObject(body);
  if (!user || !text(user.email)) user = await currentUser(config, token, fetchImpl);
  const sessionUser = user ? sessionUserFrom(user) : null;
  if (!sessionUser) return UNAVAILABLE;
  return { ok: true, token, maxAgeSeconds: sessionSeconds(body), user: sessionUser };
}

/** `GET /auth/me`, for a login reply that does not include the person. */
export async function currentUser(config: BcmsApiConfig, token: string, fetchImpl: typeof fetch = fetch): Promise<Json | null> {
  if (!config.baseUrl) return null;
  try {
    const response = await fetchImpl(`${config.baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = response.ok ? await readJson(response) : null;
    return body ? userObject(body) : null;
  } catch {
    return null;
  }
}
