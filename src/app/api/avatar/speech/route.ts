import { avatarConfig, isSameOrigin, MAX_SPEECH_CHARS, synthesise, takeAllowance } from "@/lib/avatar";

/** Speaks a coach reply: text in, 16 kHz PCM out (streamed). The text is not stored or logged. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const config = avatarConfig();
  if (!config) return Response.json({ error: "unavailable" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_SPEECH_CHARS) return Response.json({ error: "text" }, { status: 400 });
  if (!takeAllowance("speech")) return Response.json({ error: "limit" }, { status: 429 });
  try {
    const audio = await synthesise(config.speech, text, request.signal);
    if (!audio) return Response.json({ error: "provider" }, { status: 502 });
    return new Response(audio, { headers: { "content-type": "application/octet-stream", "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "provider" }, { status: 502 });
  }
}
