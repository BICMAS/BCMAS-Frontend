/** Test helpers for AI screens (used only by *.test.tsx files). */
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import type { AiClient } from "./api";
import { AiClientProvider } from "./hooks/ai-client-context";
import { MockAiClient } from "./mocks/mock-ai-client";

export type Persona = "user-james" | "user-michael" | "user-priya" | "user-sarah";

export function mockClient(persona: Persona = "user-james"): MockAiClient {
  return new MockAiClient({ latencyMs: 0, userId: () => persona });
}

export function renderWithAi(ui: ReactElement, client: AiClient = mockClient()) {
  return { client, ...render(<AiClientProvider client={client}>{ui}</AiClientProvider>) };
}
