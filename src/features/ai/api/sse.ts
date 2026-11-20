/**
 * Server-Sent Events reader for AI service streams (AI_API_SPEC.md §1.4):
 * `meta` → `delta`* → `result` → `done`; or `error` mid-stream.
 */
export type SseFrame = { event: string; data: unknown };

/** Normalises CRLF / CR to LF. A trailing CR is held back until we know whether LF follows. */
function normalise(buffer: string, final: boolean): string {
  const holdBack = !final && buffer.endsWith("\r");
  const body = holdBack ? buffer.slice(0, -1) : buffer;
  return body.replace(/\r\n?/g, "\n") + (holdBack ? "\r" : "");
}

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer = normalise(buffer + decoder.decode(value ?? new Uint8Array(), { stream: !done }), done);
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const frame = parseFrame(raw);
        if (frame) yield frame;
        boundary = buffer.indexOf("\n\n");
      }
      if (done) {
        const frame = parseFrame(buffer);
        if (frame) yield frame;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(raw: string): SseFrame | null {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  const text = data.join("\n");
  try {
    return { event, data: JSON.parse(text) as unknown };
  } catch {
    return { event, data: text };
  }
}
