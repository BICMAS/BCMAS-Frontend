"use client";

import type { AiIdentity } from "@ai/contracts";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { useSessionStore } from "@/stores/session-store";

import { createAiClient, type AiClient } from "../api";
import { AiErrorState } from "../components/shared/ai-states";

type AiContextValue = { client: AiClient; identity: AiIdentity };
type Settled = { key: string; value?: AiContextValue; error?: unknown };

const AiContext = createContext<AiContextValue | null>(null);

/**
 * Provides the AI client and the verified identity (GET /v1/me/identity) to AI screens.
 * Tests pass a `client` directly; the app creates one for the configured mode. Switching
 * the signed-in persona reloads the identity.
 */
export function AiClientProvider({ client: injected, children }: { client?: AiClient; children: ReactNode }) {
  const userId = useSessionStore((state) => state.userId);
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled>({ key: "" });
  const key = `${userId}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = injected ?? (await createAiClient());
        const identity = await client.getIdentity();
        if (!cancelled) setSettled({ key, value: { client, identity } });
      } catch (error) {
        if (!cancelled) setSettled({ key, error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [injected, key]);

  if (settled.key !== key) return <LoadingSkeleton rows={3} />;
  if (settled.error || !settled.value) {
    return <AiErrorState error={settled.error} onRetry={() => setAttempt((n) => n + 1)} />;
  }
  return <AiContext.Provider value={settled.value}>{children}</AiContext.Provider>;
}

export function useAi(): AiContextValue {
  const value = useContext(AiContext);
  if (!value) throw new Error("useAi must be used inside <AiClientProvider>");
  return value;
}

export function useAiClient(): AiClient {
  return useAi().client;
}
