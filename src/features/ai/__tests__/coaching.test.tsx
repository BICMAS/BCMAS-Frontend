import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AiApiError } from "../api";
import { AI_COACH } from "../components/coaching/coach-avatar";
import { visemesForWord, wordAt } from "../components/coaching/coach-voice";
import { CoachingHubView } from "../components/coaching/coaching-hub-view";
import { ConversationView } from "../components/coaching/conversation-view";
import { RoleplayView } from "../components/coaching/roleplay-view";
import { mockClient, renderWithAi } from "../testing";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("AI Coaching", () => {
  it("lists coaching modes and starts a conversation in the chosen mode", async () => {
    const user = userEvent.setup();
    const { client } = renderWithAi(<CoachingHubView />);
    await user.click(await screen.findByRole("button", { name: /Career coaching/ }));
    await user.type(screen.getByLabelText(/What would you like to talk about/), "Moving into architecture leadership");
    await user.click(screen.getByRole("button", { name: "Start conversation" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/ai\/coaching\/conversations\/cv_/)));
    const [conversation] = await client.listConversations();
    expect(conversation).toMatchObject({ mode: "career", topic: "Moving into architecture leadership" });
    expect(screen.queryByRole("button", { name: /Interactive role-play/ })).toBeNull(); // role-play is its own tab
  });

  it("streams coach replies, keeps the conversation history and ends with a summary", async () => {
    const user = userEvent.setup();
    const client = mockClient();
    const started = await client.startConversation({ mode: "performance" });
    const send = vi.spyOn(client, "sendConversationMessage");
    renderWithAi(<ConversationView conversationId={started.conversation_id} />, client);
    expect(await screen.findByText(/What would you like to focus on today/)).toBeTruthy();
    await user.type(screen.getByLabelText("Message"), "I want to publish our API standard{Enter}");
    expect(await screen.findByText("I want to publish our API standard")).toBeTruthy();
    expect(await screen.findByText(/What would a good first step look like/)).toBeTruthy();
    expect(send.mock.calls[0]![3]).toBeTypeOf("function"); // streaming delta handler supplied
    expect(screen.getByText(/turns left/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "End & summarise" }));
    expect(await screen.findByText("Session summary")).toBeTruthy();
    expect(screen.getByText("Draft a one-page proposal")).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull(); // ended: no composer
  });

  it("keeps the draft message when sending fails", async () => {
    const user = userEvent.setup();
    const client = mockClient();
    const started = await client.startConversation({ mode: "career" });
    vi.spyOn(client, "sendConversationMessage").mockRejectedValueOnce(
      new AiApiError("rate_limited", "Too many requests. Please wait and try again.", { retryable: true }),
    );
    renderWithAi(<ConversationView conversationId={started.conversation_id} />, client);
    await user.type(await screen.findByLabelText("Message"), "Hello coach{Enter}");
    expect(await screen.findByText(/Too many requests/)).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("Hello coach");
  });

  it("runs an interactive role-play and shows evidence-based practice feedback", async () => {
    const user = userEvent.setup();
    const client = mockClient();
    const session = await client.startSession("sc_01JDSEED000000000000000001");
    renderWithAi(<RoleplayView sessionId={session.session_id} />, client);
    expect(await screen.findByText(/How long will customer data exposed through the partner API be kept/)).toBeTruthy();
    await user.type(screen.getByLabelText("Message"), "We delete it after 90 days under the retention policy{Enter}");
    expect(await screen.findByText(/what happens to the data after the contract ends/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "End & get feedback" }));
    expect(await screen.findByText("Practice feedback")).toBeTruthy();
    expect(screen.getByText("72%")).toBeTruthy();
    expect(screen.getByText(/We delete it after 90 days/, { selector: "blockquote" })).toBeTruthy();
    expect(screen.getByText(/does not change verified capability levels/)).toBeTruthy();
  });

  it("shows coaching history and role-play scenarios", async () => {
    const user = userEvent.setup();
    const client = mockClient();
    await client.startConversation({ mode: "leadership", topic: "Leading the platform team" });
    renderWithAi(<CoachingHubView />, client);
    await user.click(await screen.findByRole("tab", { name: "History" }));
    expect(await screen.findByText(/Leading the platform team/)).toBeTruthy();
    expect(screen.getByText("No role-play sessions yet")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Interactive role-play" }));
    expect((await screen.findAllByText("Data Retention Briefing with the CPO")).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "Start role-play" })[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/ai\/coaching\/sessions\/cs_/)));
  });
});

describe("AI Coaching avatar", () => {
  it("introduces the coach by name and portrait in a conversation", async () => {
    const client = mockClient();
    const started = await client.startConversation({ mode: "career" });
    renderWithAi(<ConversationView conversationId={started.conversation_id} />, client);
    expect(await screen.findByRole("region", { name: "Amara, Your AI development coach" })).toBeTruthy();
    expect(screen.getByText("Ready when you are")).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Amara's portrait" }).length).toBeGreaterThan(1); // stage + message
  });

  it("gives role-play characters their own face", async () => {
    const client = mockClient();
    const session = await client.startSession("sc_01JDSEED000000000000000001");
    renderWithAi(<RoleplayView sessionId={session.session_id} />, client);
    expect(await screen.findByRole("region", { name: "Dana Okafor, Chief Privacy Officer" })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Dana Okafor's portrait" }).length).toBeGreaterThan(0);
  });

  it("speaks replies aloud when voice is on", async () => {
    const user = userEvent.setup();
    const spoken: string[] = [];
    class FakeUtterance {
      text: string;
      voice: unknown = null;
      rate = 1;
      pitch = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", {
      getVoices: () => [],
      cancel: () => {},
      speak: (u: FakeUtterance) => spoken.push(u.text),
    });
    try {
      const client = mockClient();
      const started = await client.startConversation({ mode: "performance" });
      renderWithAi(<ConversationView conversationId={started.conversation_id} />, client);
      await user.click(await screen.findByRole("button", { name: "Voice off" }));
      expect(screen.getByRole("button", { name: "Voice on" })).toBeTruthy();
      await user.type(screen.getByLabelText("Message"), "I want to publish our API standard{Enter}");
      await waitFor(() => expect(spoken.some((t) => /good first step/.test(t))).toBe(true));
      await user.click(screen.getByRole("button", { name: "Voice on" })); // reset the stored preference
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Avatar lip sync", () => {
  it("maps a word's sounds to mouth shapes", () => {
    expect(visemesForWord("moon")).toEqual(["closed", "round", "mid"]);
    expect(visemesForWord("Map")).toEqual(["closed", "open", "closed"]);
    expect(visemesForWord("feel,")).toEqual(["teeth", "wide", "mid"]);
    expect(visemesForWord("think")).toEqual(["teeth", "wide", "mid"]);
    expect(visemesForWord("—")).toEqual([]);
  });

  it("finds the spoken word even when the browser omits its length", () => {
    expect(wordAt("What would success look like?", 5, 5)).toBe("would");
    expect(wordAt("What would success look like?", 11)).toBe("success");
  });

  it("moves a drawn portrait's mouth in time with each spoken word", async () => {
    const user = userEvent.setup();
    // Role-play characters and the interviewer are drawn; the coach has a photo.
    const photo = AI_COACH.imageUrl;
    Object.assign(AI_COACH, { imageUrl: null });
    let current: {
      text: string;
      onstart: (() => void) | null;
      onboundary: ((e: { name: string; charIndex: number; charLength?: number }) => void) | null;
      onend: (() => void) | null;
    } | null = null;
    class FakeUtterance {
      text: string;
      voice: unknown = null;
      rate = 1;
      pitch = 1;
      onstart: (() => void) | null = null;
      onboundary = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    vi.stubGlobal("speechSynthesis", {
      getVoices: () => [],
      cancel: () => {},
      speak: (u: NonNullable<typeof current>) => {
        current = u;
      },
    });
    try {
      const client = mockClient();
      const started = await client.startConversation({ mode: "career" });
      const { container } = renderWithAi(<ConversationView conversationId={started.conversation_id} />, client);
      await user.click((await screen.findAllByRole("button", { name: /Listen to Amara/ }))[0]!);
      const utterance = current!;
      const stage = () => container.querySelector("section[aria-label^='Amara'] [data-viseme]");

      act(() => utterance.onstart?.());
      expect(screen.getByText("Speaking")).toBeTruthy();
      expect(stage()).toBeNull(); // no word timing yet: generic talking animation

      const index = utterance.text.search(/\S/);
      const firstWord = wordAt(utterance.text, index);
      act(() => utterance.onboundary?.({ name: "word", charIndex: index, charLength: firstWord.length }));
      expect(stage()?.getAttribute("data-viseme")).toBe(visemesForWord(firstWord)[0]);

      act(() => utterance.onend?.());
      expect(stage()).toBeNull();
      expect(screen.getByText("Ready when you are")).toBeTruthy();
    } finally {
      Object.assign(AI_COACH, { imageUrl: photo });
      vi.unstubAllGlobals();
    }
  });
});

describe("AI Coaching dashboard", () => {
  it("recommends a next action and shows the trend and insights from real sessions", async () => {
    const user = userEvent.setup();
    const client = mockClient();
    const session = await client.startSession("sc_01JDSEED000000000000000001");
    await client.sendSessionMessage(session.session_id, "We delete it after 90 days", "msg-1");
    await client.endSession(session.session_id);
    renderWithAi(<CoachingHubView />, client);

    expect(await screen.findByText("Recommended next action")).toBeTruthy();
    expect(screen.getByText(/Hi .*I'm Amara/)).toBeTruthy();

    const trend = await screen.findByRole("list", { name: "Practice score by session" });
    expect(within(trend).getByText("Data Retention Briefing with the CPO")).toBeTruthy();
    expect(within(trend).getByText("72%")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Coaching insights" }));
    expect(await screen.findByText("Role-play feedback")).toBeTruthy();
    expect(screen.getByText("Strengths")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View full feedback/ }).getAttribute("href")).toBe(
      `/ai/coaching/sessions/${session.session_id}`,
    );
  });

  it("explains how to get insights before any session is finished", async () => {
    const user = userEvent.setup();
    renderWithAi(<CoachingHubView />);
    await user.click(await screen.findByRole("tab", { name: "Coaching insights" }));
    expect(await screen.findByText("No coaching insights yet")).toBeTruthy();
  });
});
