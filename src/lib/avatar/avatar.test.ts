// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

import { GET as availability, POST as startSession } from "@/app/api/avatar/session/route";
import { POST as speak } from "@/app/api/avatar/speech/route";

import { avatarConfig, createSimliSession, isSameOrigin, resetAllowance, samplesOnly, speechMarkup, splitForSpeech, synthesise, wavSamples } from "./index";

const ENV = { NODE_ENV: "development", AVATAR_PROVIDER: "simli", SIMLI_API_KEY: "simli-secret", AVATAR_VOICE: "google", GOOGLE_TTS_API_KEY: "google-secret" };
const DEEPGRAM = { ...ENV, AVATAR_VOICE: undefined, DEEPGRAM_API_KEY: "deepgram-secret" };
const AZURE = { ...ENV, AVATAR_VOICE: "azure", AZURE_SPEECH_KEY: "azure-secret", AZURE_SPEECH_REGION: "westeurope" };

/** A minimal WAV file around the given samples. */
function wav(samples: number[]) {
  const out = Buffer.alloc(44 + samples.length);
  out.write("RIFF", 0);
  out.write("WAVEfmt ", 8);
  out.writeUInt32LE(16, 16);
  out.write("data", 36);
  out.writeUInt32LE(samples.length, 40);
  Buffer.from(samples).copy(out, 44);
  return out;
}
const request = (path: string, body?: unknown, origin = "http://app") =>
  new Request(`http://app${path}`, {
    method: "POST",
    headers: { origin, host: "app", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  resetAllowance();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Avatar settings", () => {
  it("is off in production, without a provider, or with missing or odd settings", () => {
    expect(avatarConfig(ENV)).toMatchObject({ speech: { provider: "google", voice: "en-GB-Neural2-A" } });
    expect(avatarConfig(AZURE)).toMatchObject({ speech: { provider: "azure", voice: "en-NG-EzinneNeural" } });
    expect(avatarConfig({ ...ENV, AVATAR_VOICE: "other" })).toBeNull();
    expect(avatarConfig(DEEPGRAM)).toMatchObject({ speech: { provider: "deepgram", voice: "aura-2-pandora-en" } });
    expect(avatarConfig({ ...DEEPGRAM, DEEPGRAM_VOICE: "aura-2-draco-en" })).toMatchObject({ speech: { voice: "aura-2-draco-en" } });
    expect(avatarConfig({ ...DEEPGRAM, DEEPGRAM_VOICE: "x&model=y" })).toBeNull();
    expect(avatarConfig({ ...DEEPGRAM, AVATAR_VOICE: "deepgram", DEEPGRAM_API_KEY: "" })).toBeNull();
    expect(avatarConfig({ ...DEEPGRAM, DEEPGRAM_API_KEY: "" }, "win32")).toMatchObject({ speech: { provider: "windows" } });
    expect(avatarConfig({ ...DEEPGRAM, DEEPGRAM_API_KEY: "" }, "linux")).toBeNull();
    expect(avatarConfig({ ...ENV, GOOGLE_TTS_API_KEY: "" })).toBeNull();
    expect(avatarConfig({ ...AZURE, AZURE_SPEECH_KEY: "" })).toBeNull();
    expect(avatarConfig({ ...ENV, NODE_ENV: "production" })).toBeNull();
    expect(avatarConfig({ ...ENV, AVATAR_PROVIDER: undefined })).toBeNull();
    expect(avatarConfig({ ...ENV, SIMLI_API_KEY: "" })).toBeNull();
    expect(avatarConfig({ ...AZURE, AZURE_SPEECH_REGION: "evil.example/" })).toBeNull();
    expect(avatarConfig({ ...AZURE, AZURE_SPEECH_VOICE: 'x"><y' })).toBeNull();
  });

  it("accepts only this app's own pages", () => {
    expect(isSameOrigin(request("/x"))).toBe(true);
    expect(isSameOrigin(request("/x", undefined, "http://evil"))).toBe(false);
    expect(isSameOrigin(new Request("http://app/x"))).toBe(false);
  });

  it("escapes the reply in the speech request", () => {
    const xml = speechMarkup('Tom & <break time="9s"/> \u0000ok', "en-NG-EzinneNeural");
    expect(xml).toContain("Tom &amp; &lt;break time=&quot;9s&quot;/&gt;");
    expect(xml).not.toContain("\u0000");
    expect(xml).toContain('xml:lang="en-NG"');
  });
});

describe("Providers", () => {
  it("asks Simli for a short session and Azure for the audio format Simli takes", async () => {
    const config = avatarConfig(ENV)!;
    const simli = vi.fn(async () => Response.json({ session_token: "t1" }));
    expect(await createSimliSession(config, simli as unknown as typeof fetch)).toBe("t1");
    const [url, init] = simli.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.simli.ai/compose/token");
    expect(JSON.parse(String(init.body))).toMatchObject({ maxSessionLength: 600, maxIdleTime: 120 });
    const azure = vi.fn(async () => new Response("pcm"));
    await synthesise(avatarConfig(AZURE)!.speech, "Hello", undefined, azure as unknown as typeof fetch);
    const [azureUrl, azureInit] = azure.mock.calls[0] as unknown as [string, RequestInit];
    expect(azureUrl).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    expect(new Headers(azureInit.headers).get("X-Microsoft-OutputFormat")).toBe("raw-16khz-16bit-mono-pcm");
  });
});

describe("Deepgram voice", () => {
  const chunks = (...parts: number[][]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        parts.forEach((p) => controller.enqueue(new Uint8Array(p)));
        controller.close();
      },
    });
  const read = async (stream: ReadableStream<Uint8Array> | null) => [...new Uint8Array(await new Response(stream).arrayBuffer())];

  it("asks for 16 kHz samples, opts out of model improvement and keeps the key in a header", async () => {
    const deepgram = vi.fn(async () => new Response(new Uint8Array([7, 7, 7, 7])));
    const stream = await synthesise(avatarConfig(DEEPGRAM)!.speech, "Hello", undefined, deepgram as unknown as typeof fetch);
    expect(await read(stream)).toEqual([7, 7, 7, 7]);
    const [url, init] = deepgram.mock.calls[0] as unknown as [string, RequestInit];
    const { origin, pathname, searchParams } = new URL(url);
    expect(origin + pathname).toBe("https://api.deepgram.com/v1/speak");
    expect(Object.fromEntries(searchParams)).toEqual({
      model: "aura-2-pandora-en",
      encoding: "linear16",
      sample_rate: "16000",
      container: "none",
      mip_opt_out: "true",
    });
    expect(new Headers(init.headers).get("authorization")).toBe("Token deepgram-secret");
    expect(url).not.toContain("secret");
  });

  it("removes a WAV header wherever the stream is cut, and keeps headerless audio", async () => {
    const file = [...wav([1, 2, 3, 4, 5, 6])];
    for (const cut of [1, 3, 4, 20, 43, 44, 45, 48]) {
      expect(await read(samplesOnly(chunks(file.slice(0, cut), file.slice(cut))))).toEqual([1, 2, 3, 4, 5, 6]);
    }
    expect(await read(samplesOnly(chunks([9, 8], [7, 6, 5, 4])))).toEqual([9, 8, 7, 6, 5, 4]);
  });

  it("returns nothing when Deepgram refuses", async () => {
    const bad = vi.fn(async () => Response.json({ err_code: "INVALID_AUTH" }, { status: 401 }));
    expect(await synthesise(avatarConfig(DEEPGRAM)!.speech, "Hi", undefined, bad as unknown as typeof fetch)).toBeNull();
  });
});

describe.runIf(process.platform === "win32")("Windows voice", () => {
  it("speaks quotes and symbols as text, as raw samples", { timeout: 40_000 }, async () => {
    const stream = await synthesise({ provider: "windows" }, 'Well done. "$(exit 1)"; <break/> & naïve');
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(bytes.length).toBeGreaterThan(16_000);
    expect(bytes.length % 2).toBe(0);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).not.toBe("RIFF");
  });
});

describe("Google voice", () => {
  it("splits a reply into sentences and keeps every word", () => {
    const text = "Well done. What went well? Tell me more about the risks, please!  And then?";
    const pieces = splitForSpeech(text);
    expect(pieces[0]).toBe("Well done.");
    expect(pieces.join(" ")).toBe(text.replace(/\s+/g, " "));
    expect(splitForSpeech("No full stop")).toEqual(["No full stop"]);
    expect(splitForSpeech("  ")).toEqual([]);
  });

  it("removes the WAV header", () => {
    expect([...wavSamples(new Uint8Array(wav([1, 2, 3, 4])))]).toEqual([1, 2, 3, 4]);
    expect([...wavSamples(new Uint8Array([9, 8]))]).toEqual([9, 8]);
  });

  it("asks for 16 kHz audio with the key in a header, and joins the pieces in order", async () => {
    const google = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
      expect(new Headers(init.headers).get("x-goog-api-key")).toBe("google-secret");
      const body = JSON.parse(String(init.body));
      expect(body.audioConfig).toEqual({ audioEncoding: "LINEAR16", sampleRateHertz: 16000 });
      expect(body.voice).toEqual({ languageCode: "en-GB", name: "en-GB-Neural2-A" });
      const n = body.input.text.startsWith("One") ? 1 : 2;
      return Response.json({ audioContent: wav([n, n]).toString("base64") });
    });
    const stream = await synthesise(avatarConfig(ENV)!.speech, "One. Two.", undefined, google as unknown as typeof fetch);
    expect([...new Uint8Array(await new Response(stream).arrayBuffer())]).toEqual([1, 1, 2, 2]);
  });

  it("keeps the first part when a later part fails, and reports a first failure", async () => {
    let calls = 0;
    const flaky = vi.fn(async () => (++calls === 1 ? Response.json({ audioContent: wav([5, 5]).toString("base64") }) : new Response("no", { status: 500 })));
    const stream = await synthesise(avatarConfig(ENV)!.speech, "One. Two.", undefined, flaky as unknown as typeof fetch);
    expect([...new Uint8Array(await new Response(stream).arrayBuffer())]).toEqual([5, 5]);
    const bad = vi.fn(async () => new Response("API key google-secret invalid", { status: 400 }));
    expect(await synthesise(avatarConfig(ENV)!.speech, "One.", undefined, bad as unknown as typeof fetch)).toBeNull();
  });
});

describe("Routes", () => {
  it("says who makes the voice, without keys", async () => {
    const response = await availability();
    expect(await response.json()).toEqual({ available: true, voice: "Google Cloud" });
  });

  it("returns only the session token, never a key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ session_token: "t1" })));
    const response = await startSession(request("/api/avatar/session"));
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ token: "t1" });
    expect(text).not.toContain("secret");
  });

  it("refuses other origins, production and provider errors", async () => {
    const provider = vi.fn(async () => new Response("bad key azure-secret", { status: 401 }));
    vi.stubGlobal("fetch", provider);
    expect((await startSession(request("/api/avatar/session", undefined, "http://evil"))).status).toBe(403);
    expect((await speak(request("/api/avatar/speech", { text: "Hi" }, "http://evil"))).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    const failed = await speak(request("/api/avatar/speech", { text: "Hi" }));
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("secret");
    vi.stubEnv("NODE_ENV", "production");
    expect((await startSession(request("/api/avatar/session"))).status).toBe(404);
  });

  it("limits the text and the number of sessions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ session_token: "t" })));
    expect((await speak(request("/api/avatar/speech", { text: "" }))).status).toBe(400);
    expect((await speak(request("/api/avatar/speech", { text: "x".repeat(2001) }))).status).toBe(400);
    for (let i = 0; i < 20; i += 1) expect((await startSession(request("/api/avatar/session"))).status).toBe(200);
    expect((await startSession(request("/api/avatar/session"))).status).toBe(429);
  });
});
