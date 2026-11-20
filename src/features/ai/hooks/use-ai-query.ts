"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { AiClient } from "../api";
import { useAiClient } from "./ai-client-context";

export type AiQuery<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (update: T | ((current: T | undefined) => T)) => void;
};

type Settled<T> = { key: string; data?: T; error?: unknown };

/** Keeps a callback's latest version without re-running effects (refs are written after render). */
function useLatest<F>(fn: F) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return ref;
}

/**
 * Loads AI data with loading / error state; `enabled=false` defers loading. Results are keyed
 * by the request, so stale responses never overwrite newer ones and loading is derived.
 */
export function useAiQuery<T>(
  load: (client: AiClient) => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {},
): AiQuery<T> {
  const client = useAiClient();
  const enabled = options.enabled ?? true;
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: "" });
  const loadRef = useLatest(load);
  const key = JSON.stringify([version, ...deps]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadRef
      .current(client)
      .then((data) => {
        if (!cancelled) setSettled({ key, data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled((current) => ({ key, data: current.data, error }));
      });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, key, loadRef]);

  const reload = useCallback(() => setVersion((n) => n + 1), []);
  const setData = useCallback(
    (update: T | ((current: T | undefined) => T)) => {
      setSettled((current) => ({
        key: current.key || key,
        data: typeof update === "function" ? (update as (c: T | undefined) => T)(current.data) : update,
      }));
    },
    [key],
  );

  const current = settled.key === key;
  return {
    data: settled.data,
    error: current ? (settled.error ?? null) : null,
    loading: enabled && !current,
    reload,
    setData,
  };
}

/** Runs an AI mutation with pending / error state. */
export function useAiAction<A extends unknown[], R>(action: (client: AiClient, ...args: A) => Promise<R>) {
  const client = useAiClient();
  const actionRef = useLatest(action);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await actionRef.current(client, ...args);
      } catch (caught) {
        setError(caught);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [client, actionRef],
  );
  return { run, pending, error, clearError: () => setError(null) };
}
