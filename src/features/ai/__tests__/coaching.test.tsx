import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AiApiError } from "../api";
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
