import { useSessionStore } from "@/stores/session-store";

import type { AiClient } from "./client";
import { HttpAiClient } from "./http-client";

export type { AiClient, DeltaHandler } from "./client";
export { newClientId } from "./client";
export { AiApiError, describeAiError } from "./errors";
export { HttpAiClient } from "./http-client";

export type AiMode = "live" | "mock";

/**
 * `live` (default) calls the real AI service through the BFF. `mock` uses the isolated
 * local-development adapter and is never selected in a production build.
 */
export function aiMode(): AiMode {
  return process.env.NEXT_PUBLIC_AI_MODE === "mock" && process.env.NODE_ENV !== "production" ? "mock" : "live";
}

/** Development only: tell the BFF which mock persona is signed in (ignored unless AI_DEV_AUTH=true). */
function devIdentity(): (() => string | undefined) | undefined {
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_AI_DEV_IDENTITY === "false") return undefined;
  return () => useSessionStore.getState().userId;
}

export async function createAiClient(): Promise<AiClient> {
  // Literal env checks (inlined at build time) so production builds drop the mock entirely.
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AI_MODE === "mock") {
    const { MockAiClient } = await import("../mocks/mock-ai-client");
    return new MockAiClient();
  }
  return new HttpAiClient({ devUser: devIdentity() });
}
