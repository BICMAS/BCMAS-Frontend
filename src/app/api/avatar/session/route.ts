import { connection } from "next/server";

import { avatarConfig, createSimliSession, isSameOrigin, takeAllowance, VOICE_LABEL } from "@/lib/avatar";

const noStore = { headers: { "cache-control": "no-store" } };

/** Whether the video coach can be offered. */
export async function GET() {
  await connection();
  const config = avatarConfig();
  return Response.json({ available: config !== null, voice: config ? VOICE_LABEL[config.speech.provider] : null }, noStore);
}

/** A short-lived Simli session token. The API key never leaves the server. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const config = avatarConfig();
  if (!config) return Response.json({ error: "unavailable" }, { status: 404 });
  if (!takeAllowance("session")) return Response.json({ error: "limit" }, { status: 429 });
  try {
    const token = await createSimliSession(config);
    return token ? Response.json({ token }, noStore) : Response.json({ error: "provider" }, { status: 502 });
  } catch {
    return Response.json({ error: "provider" }, { status: 502 });
  }
}
