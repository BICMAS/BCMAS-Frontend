import { describe, expect, it } from "vitest";

import { readSse, type SseFrame } from "./sse";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<SseFrame[]> {
  const frames: SseFrame[] = [];
  for await (const frame of readSse(streamOf(chunks))) frames.push(frame);
  return frames;
}

describe("readSse", () => {
  it("parses AI service frames, including frames split across network chunks", async () => {
    const frames = await collect([
      'event: meta\ndata: {"request_id":"r1"}\n\nevent: del',
      'ta\ndata: {"text":"Hel"}\n\nevent: delta\ndata: {"text":"lo"}\n',
      '\nevent: result\ndata: {"ok":true}\n\nevent: done\ndata: {}\n\n',
    ]);
    expect(frames.map((f) => f.event)).toEqual(["meta", "delta", "delta", "result", "done"]);
    expect(frames[1]!.data).toEqual({ text: "Hel" });
    expect(frames[3]!.data).toEqual({ ok: true });
  });

  it("handles CRLF line endings, a trailing frame without a blank line, and non-JSON data", async () => {
    const frames = await collect(["event: error\r\ndata: plain text\r\n\r\n", "event: done\ndata: {}"]);
    expect(frames).toEqual([
      { event: "error", data: "plain text" },
      { event: "done", data: {} },
    ]);
  });

  it("ignores comments and frames without data", async () => {
    expect(await collect([": keep-alive\n\nevent: ping\n\n"])).toEqual([]);
  });
});
