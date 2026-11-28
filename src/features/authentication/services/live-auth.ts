import type { SessionUser } from "@/lib/bcms-api/session-user";

/** Sign in against the BCMS backend instead of the sample accounts (`NEXT_PUBLIC_AUTH_MODE=live`). */
export function liveAuthEnabled() {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "live";
}

export type LiveSignInResult =
  | { ok: true; user: SessionUser }
  | { ok: false; message: string; fields?: Partial<Record<"email" | "password", string>> };

export async function liveSignIn(email: string, password: string): Promise<LiveSignInResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, message: "Could not reach BCMS. Check your connection and try again." };
  }
  const body = (await response.json().catch(() => null)) as
    | { user?: SessionUser; error?: { message?: string; fields?: Record<string, string> } }
    | null;
  if (response.ok && body?.user) return { ok: true, user: body.user };
  const fields = body?.error?.fields;
  return {
    ok: false,
    message: body?.error?.message ?? "Sign-in failed. Try again.",
    fields: fields ? { email: fields.email, password: fields.password } : undefined,
  };
}

/** Ends the session on this app's server (best effort). */
export async function liveSignOut() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}
