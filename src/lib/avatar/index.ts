import { windowsSpeech } from "./windows-voice";

/**
 * Server-only support for the video coach trial (Simli video + a separate voice service).
 *
 * Flow: the AI service writes the coach's reply as before. The server turns it into speech with
 * Windows, Deepgram, Google or Azure, the browser passes that audio to Simli, and Simli returns the talking
 * video. Simli never sees the employee's messages and never writes a reply.
 *
 * Settings (server only, in .env.local; never NEXT_PUBLIC_*):
 *   AVATAR_PROVIDER=simli        off when missing
 *   SIMLI_API_KEY, SIMLI_FACE_ID (optional; a Simli preset face by default)
 *   AVATAR_VOICE=windows, deepgram, google or azure. When missing: Deepgram if it has a key,
 *     otherwise the voice built into Windows (no key; only when the server runs on Windows).
 *   DEEPGRAM_API_KEY, DEEPGRAM_VOICE (optional)
 *   GOOGLE_TTS_API_KEY, GOOGLE_TTS_VOICE (optional)
 *   AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, AZURE_SPEECH_VOICE (optional)
 *
 * TRIAL: off in production. Both services cost money per use, and the app has no verified sign-in
 * yet, so nothing could stop a stranger spending the credit. Turn it on there only once the routes
 * check the real session, the tenant's AI Coaching feature and a per-person limit.
 */

export type AvatarConfig = {
  simliKey: string;
  faceId: string;
  speech: SpeechConfig;
};

export type SpeechConfig =
  | { provider: "windows" }
  | { provider: "deepgram"; key: string; voice: string }
  | { provider: "google"; key: string; voice: string }
  | { provider: "azure"; key: string; region: string; voice: string };

/** Named on screen, so employees know who makes the voice. */
export const VOICE_LABEL = { windows: "the Windows voice on the app's computer", deepgram: "Deepgram", google: "Google Cloud", azure: "Microsoft Azure" } as const;

type Env = Record<string, string | undefined>;

/** Simli's documented default preset face. */
const DEFAULT_FACE = "14c60d62-6ebf-424d-b626-1f4f91c33b04";
const DEFAULT_VOICE = { deepgram: "aura-2-pandora-en", google: "en-GB-Neural2-A", azure: "en-NG-EzinneNeural" } as const;

export const MAX_SPEECH_CHARS = 2000;
/** Short sessions: we have not confirmed whether silence is billed. */
export const MAX_SESSION_SECONDS = 600;
export const MAX_IDLE_SECONDS = 120;
const LIMIT_PER_HOUR = { session: 20, speech: 120 } as const;

/** Null when the trial is off or a setting is missing or malformed. */
export function avatarConfig(env: Env = process.env, platform: string = process.platform): AvatarConfig | null {
  if (env.NODE_ENV === "production" || env.AVATAR_PROVIDER !== "simli") return null;
  const speech = speechConfig(env, platform);
  if (!env.SIMLI_API_KEY || !speech) return null;
  return { simliKey: env.SIMLI_API_KEY, faceId: env.SIMLI_FACE_ID || DEFAULT_FACE, speech };
}

function speechConfig(env: Env, platform: string): SpeechConfig | null {
  const provider = env.AVATAR_VOICE || (env.DEEPGRAM_API_KEY ? "deepgram" : "windows");
  if (provider === "windows") return platform === "win32" ? { provider } : null;
  if (provider === "deepgram") {
    const voice = env.DEEPGRAM_VOICE || DEFAULT_VOICE.deepgram;
    return env.DEEPGRAM_API_KEY && /^aura(-2)?-[a-z]+-en$/.test(voice) ? { provider, key: env.DEEPGRAM_API_KEY, voice } : null;
  }
  if (provider !== "google" && provider !== "azure") return null;
  const voice = (provider === "google" ? env.GOOGLE_TTS_VOICE : env.AZURE_SPEECH_VOICE) || DEFAULT_VOICE[provider];
  if (!/^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9-]+$/.test(voice)) return null;
  if (provider === "google") {
    return env.GOOGLE_TTS_API_KEY ? { provider, key: env.GOOGLE_TTS_API_KEY, voice } : null;
  }
  // The region becomes part of a URL, so accept only its known shape.
  const region = env.AZURE_SPEECH_REGION;
  return env.AZURE_SPEECH_KEY && region && /^[a-z0-9]+$/.test(region) ? { provider, key: env.AZURE_SPEECH_KEY, region, voice } : null;
}

/** Only pages of this app may call the paid routes. */
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

const used: Record<keyof typeof LIMIT_PER_HOUR, number[]> = { session: [], speech: [] };

/** A simple cap for the trial, kept in memory per server. */
export function takeAllowance(kind: keyof typeof LIMIT_PER_HOUR, now = Date.now()) {
  used[kind] = used[kind].filter((t) => now - t < 3_600_000);
  if (used[kind].length >= LIMIT_PER_HOUR[kind]) return false;
  used[kind].push(now);
  return true;
}

/** Test helper. */
export function resetAllowance() {
  used.session = [];
  used.speech = [];
}

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export function speechMarkup(text: string, voice: string) {
  const safe = text
    // Characters XML does not allow.
    .replace(/[^\u0009\u000A\u000D -퟿-�]/g, " ")
    .replace(/[&<>"']/g, (c) => ESCAPE[c]!);
  const language = voice.split("-").slice(0, 2).join("-");
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${language}"><voice name="${voice}">${safe}</voice></speak>`;
}

export async function createSimliSession(config: AvatarConfig, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const response = await fetchImpl("https://api.simli.ai/compose/token", {
    method: "POST",
    headers: { "x-simli-api-key": config.simliKey, "content-type": "application/json" },
    body: JSON.stringify({
      faceId: config.faceId,
      handleSilence: true,
      maxSessionLength: MAX_SESSION_SECONDS,
      maxIdleTime: MAX_IDLE_SECONDS,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { session_token?: unknown };
  return typeof body.session_token === "string" ? body.session_token : null;
}

/** Speech as raw 16 kHz, 16-bit mono PCM: the format Simli takes. */
export function synthesise(
  config: SpeechConfig,
  text: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ReadableStream<Uint8Array> | null> {
  if (config.provider === "windows") return windowsSpeech(text, timeLimit(signal));
  if (config.provider === "deepgram") return deepgramSpeech(config, text, signal, fetchImpl);
  return config.provider === "google" ? googleSpeech(config, text, signal, fetchImpl) : azureSpeech(config, text, signal, fetchImpl);
}

const timeLimit = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);

async function azureSpeech(config: Extract<SpeechConfig, { provider: "azure" }>, text: string, signal: AbortSignal | undefined, fetchImpl: typeof fetch) {
  const response = await fetchImpl(`https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.key,
      "content-type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "raw-16khz-16bit-mono-pcm",
      "User-Agent": "coach-avatar",
    },
    body: speechMarkup(text, config.voice),
    signal: timeLimit(signal),
  });
  return response.ok ? response.body : null;
}

const PIECE_CHARS = 300;

/** Sentences grouped into short pieces, so speech starts before the whole reply is ready. */
export function splitForSpeech(text: string): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [];
  const pieces: string[] = [];
  for (const sentence of sentences) {
    const last = pieces.at(-1);
    // The first sentence goes alone, for the quickest start.
    if (last !== undefined && pieces.length > 1 && last.length + sentence.length <= PIECE_CHARS) pieces[pieces.length - 1] = last + sentence;
    else pieces.push(sentence);
  }
  return pieces.map((p) => p.trim()).filter(Boolean);
}

/** The samples inside a WAV file (Google adds a header to LINEAR16 audio). */
export function wavSamples(bytes: Uint8Array): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== "RIFF") return bytes;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === "data") return bytes.subarray(at + 8, Math.min(bytes.length, at + 8 + size));
    at += 8 + size + (size % 2);
  }
  return new Uint8Array(0);
}

async function googlePiece(config: Extract<SpeechConfig, { provider: "google" }>, text: string, signal: AbortSignal | undefined, fetchImpl: typeof fetch) {
  const response = await fetchImpl("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { "x-goog-api-key": config.key, "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: config.voice.split("-").slice(0, 2).join("-"), name: config.voice },
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 16_000 },
    }),
    signal: timeLimit(signal),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { audioContent?: unknown };
  if (typeof body.audioContent !== "string") return null;
  const samples = wavSamples(new Uint8Array(Buffer.from(body.audioContent, "base64")));
  return samples.length ? samples : null;
}

async function googleSpeech(config: Extract<SpeechConfig, { provider: "google" }>, text: string, signal: AbortSignal | undefined, fetchImpl: typeof fetch) {
  const pieces = splitForSpeech(text);
  const first = pieces.length ? await googlePiece(config, pieces[0]!, signal, fetchImpl) : null;
  if (!first) return null;
  let next = 1;
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start: (controller) => controller.enqueue(first),
    async pull(controller) {
      if (next >= pieces.length) return controller.close();
      try {
        const piece = await googlePiece(config, pieces[next++]!, signal, fetchImpl);
        if (cancelled) return;
        // Keep what was already spoken when a later piece fails; the text is on screen.
        if (piece) controller.enqueue(piece);
        else controller.close();
      } catch {
        if (!cancelled) controller.close();
      }
    },
    cancel: () => {
      cancelled = true;
    },
  });
}

/** Where the samples start in a WAV stream; null when more bytes are needed, 0 when there is no header. */
export function wavDataStart(bytes: Uint8Array): number | null {
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length >= 4 && tag(0) !== "RIFF") return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 12; at + 8 <= bytes.length; ) {
    if (tag(at) === "data") return at + 8;
    const size = view.getUint32(at + 4, true);
    at += 8 + size + (size % 2);
  }
  return null;
}

/** A header longer than this is not one we understand. */
const MAX_HEADER = 4096;

/** Raw samples, whether or not the stream starts with a WAV header. */
export function samplesOnly(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let held: Uint8Array | null = new Uint8Array(0);
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!held) return controller.enqueue(chunk);
        const joined = new Uint8Array(held.length + chunk.length);
        joined.set(held);
        joined.set(chunk, held.length);
        const start = wavDataStart(joined);
        if (start === null) {
          if (joined.length > MAX_HEADER) return controller.error(new Error("Unexpected audio"));
          held = joined;
          return;
        }
        held = null;
        if (joined.length > start) controller.enqueue(joined.slice(start));
      },
    }),
  );
}

async function deepgramSpeech(config: Extract<SpeechConfig, { provider: "deepgram" }>, text: string, signal: AbortSignal | undefined, fetchImpl: typeof fetch) {
  const query = new URLSearchParams({
    model: config.voice,
    encoding: "linear16",
    sample_rate: "16000",
    container: "none",
    // Coaching text must not be used to improve Deepgram's models.
    mip_opt_out: "true",
  });
  const response = await fetchImpl(`https://api.deepgram.com/v1/speak?${query}`, {
    method: "POST",
    headers: { authorization: `Token ${config.key}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: timeLimit(signal),
  });
  return response.ok && response.body ? samplesOnly(response.body) : null;
}
