import { cookies } from "next/headers";

import { bcmsApiConfig, clientIp, isSameOrigin, signIn } from "@/lib/bcms-api";

const noStore = { "cache-control": "no-store" };

/** Signs in with the BCMS backend. The token goes into an httpOnly cookie; the reply holds only the person. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: { code: "FORBIDDEN", message: "Not allowed." } }, { status: 403 });
  const config = bcmsApiConfig();
  if (!config.baseUrl) {
    return Response.json({ error: { code: "NOT_CONFIGURED", message: "Sign-in is not connected to BCMS." } }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || email.length > 320 || password.length > 1024) {
    return Response.json({ error: { code: "BAD_REQUEST", message: "Enter your email and password." } }, { status: 400 });
  }

  const result = await signIn(config, { email, password, ip: clientIp(request) });
  if (!result.ok) {
    const headers: Record<string, string> = { ...noStore };
    if (result.retryAfterSeconds) headers["retry-after"] = String(result.retryAfterSeconds);
    return Response.json({ error: { code: result.code, message: result.message, fields: result.fields } }, { status: result.status, headers });
  }

  const store = await cookies();
  store.set(config.sessionCookie, result.token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
    maxAge: result.maxAgeSeconds,
  });
  return Response.json({ user: result.user }, { headers: noStore });
}
