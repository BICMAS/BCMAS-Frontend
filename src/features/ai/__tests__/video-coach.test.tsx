import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationView } from "../components/coaching/conversation-view";
import { RoleplayView } from "../components/coaching/roleplay-view";
import { mockClient, renderWithAi } from "../testing";

// Video coach trial: Simli speaks what the AI coach wrote; everything else is unchanged.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const simli = vi.hoisted(() => ({
  handlers: {} as Record<string, (detail?: string) => void>,
  sent: [] as number[],
  started: 0,
  stopped: 0,
  cleared: 0,
  fail: false,
}));
vi.mock("simli-client", () => ({
  LogLevel: { ERROR: 0 },
  SimliClient: class {
    on(event: string, handler: () => void) {
      simli.handlers[event] = handler;
    }
    async start() {
      if (simli.fail) throw "ERROR: INVALID_FACE_ID";
      simli.started += 1;
    }
    async stop() {
      simli.stopped += 1;
    }
    ClearBuffer() {
      simli.cleared += 1;
    }
    sendAudioData(bytes: Uint8Array) {
      simli.sent.push(bytes.length);
    }
  },
}));

let available = true;
let spoken: string[] = [];
const route = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
  if (String(url).endsWith("/speech")) {
    spoken.push((JSON.parse(String(init?.body)) as { text: string }).text);
    return new Response(new Uint8Array(13_001));
  }
  return init?.method === "POST" ? Response.json({ token: "t1" }) : Response.json({ available, voice: "Google Cloud" });
});

beforeEach(() => {
  Object.assign(simli, { handlers: {}, sent: [], started: 0, stopped: 0, cleared: 0, fail: false });
  available = true;
  spoken = [];
  vi.stubGlobal("fetch", route);
});
afterEach(() => vi.unstubAllGlobals());

async function open() {
  const client = mockClient();
  const started = await client.startConversation({ mode: "performance" });
  const view = renderWithAi(<ConversationView conversationId={started.conversation_id} />, client);
  await screen.findByText(/What would you like to focus on today/);
  return view;
}

describe("Video coach", () => {
  it("is not offered when it is not set up; the coach portrait stays", async () => {
    available = false;
    await open();
    expect(screen.queryByRole("button", { name: "Start video coach" })).toBeNull();
    expect(screen.getByRole("region", { name: /Amara, Your AI development coach/ })).toBeTruthy();
  });

  it("explains what is shared and starts only when asked", async () => {
    await open();
    const button = await screen.findByRole("button", { name: "Start video coach" });
    expect(screen.getByText(/sent to Google Cloud to make the voice.*A reply can repeat things you said/)).toBeTruthy();
    expect(simli.started).toBe(0);
    await userEvent.click(button);
    expect(await screen.findByRole("button", { name: "Stop video coach" })).toBeTruthy();
    expect(simli.started).toBe(1);
  });

  it("speaks the coach's reply in whole samples, not the employee's message", async () => {
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Start video coach" }));
    await screen.findByRole("button", { name: "Stop video coach" });
    await userEvent.type(screen.getByLabelText("Message"), "I want to publish our API standard{Enter}");
    await waitFor(() => expect(simli.sent).toEqual([6000, 6000, 1000])); // the odd last byte is dropped
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).not.toBe("I want to publish our API standard");
  });

  it("is offered in a role-play only for a character with the video face, and speaks their reply", async () => {
    const client = mockClient();
    const scenarios = await client.listScenarios();
    const open = async (persona: string) => {
      const scenario = scenarios.find((s) => s.persona.name === persona)!;
      const session = await client.startSession(scenario.scenario_id);
      return renderWithAi(<RoleplayView sessionId={session.session_id} />, client);
    };
    const sam = await open("Sam Patel");
    await screen.findByLabelText("Message");
    await waitFor(() => expect(route).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Start video coach" })).toBeNull();
    sam.unmount();
    await open("Dana Okafor");
    await userEvent.click(await screen.findByRole("button", { name: "Start video coach" }));
    await screen.findByRole("button", { name: "Stop video coach" });
    await userEvent.type(screen.getByLabelText("Message"), "Here is the retention plan{Enter}");
    await waitFor(() => expect(spoken).toHaveLength(1));
  });

  it("falls back with a message when Simli refuses", async () => {
    simli.fail = true;
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Start video coach" }));
    expect(await screen.findByText(/could not start/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start video coach" })).toBeTruthy();
  });

  it("ends the session on stop, when Simli ends it, and on leaving", async () => {
    const { unmount } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Start video coach" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop video coach" }));
    expect(simli.stopped).toBe(1);
    await userEvent.click(screen.getByRole("button", { name: "Start video coach" }));
    await screen.findByRole("button", { name: "Stop video coach" });
    await waitFor(() => simli.handlers.stop!());
    expect(await screen.findByText(/session ended/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Start video coach" }));
    await screen.findByRole("button", { name: "Stop video coach" });
    const before = simli.stopped;
    unmount();
    expect(simli.stopped).toBe(before + 1);
  });
});
