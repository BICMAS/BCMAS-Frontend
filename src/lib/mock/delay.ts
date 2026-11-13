import { sleep } from "@/lib/utils";

/**
 * Mock latency for user-triggered writes. Do not use this in page reads:
 * Cache Components treats timers as uncached IO during prerender.
 */
export async function mockLatency(ms = 280) {
  await sleep(ms);
}
