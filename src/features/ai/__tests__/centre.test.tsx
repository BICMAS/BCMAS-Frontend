import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AiApiError } from "../api";
import { AiCentreView } from "../components/centre/ai-centre-view";
import { mockClient, renderWithAi } from "../testing";

describe("AI Capability Centre", () => {
  it("shows agents, recommended actions and development insights for the signed-in employee", async () => {
    renderWithAi(<AiCentreView />);
    expect(await screen.findByRole("heading", { name: "AI Capability Centre" })).toBeTruthy();
    expect(await screen.findByText("AI Coaching Agent")).toBeTruthy();
    expect(screen.getByText("AI Talent Assessment Agent")).toBeTruthy();
    // An employee cannot use the HR-only talent capabilities.
    const talent = screen.getByText("AI Talent Assessment Agent").closest("article")!;
    expect(within(talent).getByText(/0 of 3 capabilities available to you/)).toBeTruthy();
    expect(await screen.findByText("Practise: Data Retention Briefing with the CPO")).toBeTruthy();
    expect(await screen.findByText("Gaps to close")).toBeTruthy();
    expect(screen.getAllByText("API Governance").length).toBeGreaterThan(0);
    expect(screen.getByText(/Local development data/)).toBeTruthy(); // mock mode is clearly labelled
  });

  it("routes a question to an agent and shows the execution status", async () => {
    const user = userEvent.setup();
    renderWithAi(<AiCentreView />);
    await user.type(await screen.findByLabelText("What do you need help with?"), "Which skills should I develop next?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    const status = await screen.findByRole("region", { name: "Execution status" });
    expect(within(status).getAllByText("succeeded")).toHaveLength(2); // the request and its step
    expect(within(status).getByText("dev_plan.explain_gaps")).toBeTruthy();
    // The request appears in agent activity.
    expect(await screen.findByText("Which skills should I develop next?")).toBeTruthy();
  });

  it("dismisses a recommendation and starts a workflow", async () => {
    const user = userEvent.setup();
    renderWithAi(<AiCentreView />);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(await screen.findByText("Nothing to act on right now")).toBeTruthy();
    expect(screen.getByText("No workflows yet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Start personal development" }));
    expect(await screen.findByText(/Waiting for manager or hr: Review and approve the development plan/)).toBeTruthy();
    expect(screen.getByText("awaiting input")).toBeTruthy();
  });

  it("shows an error state with retry when the AI service fails", async () => {
    const user = userEvent.setup();
    const client = mockClient();
    const failing = vi
      .spyOn(client, "listAgents")
      .mockRejectedValueOnce(new AiApiError("upstream_unavailable", "A required service is temporarily unavailable.", { retryable: true }));
    renderWithAi(<AiCentreView />, client);
    expect(await screen.findByText("A required service is temporarily unavailable.")).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Try again" })[0]!);
    expect(await screen.findByText("AI Coaching Agent")).toBeTruthy();
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("blocks the screen with a clear message when the identity cannot be verified", async () => {
    const client = mockClient();
    vi.spyOn(client, "getIdentity").mockRejectedValue(
      new AiApiError("unauthenticated", "Please sign in to use AI features.", { status: 401 }),
    );
    renderWithAi(<AiCentreView />, client);
    expect(await screen.findByText("Please sign in again")).toBeTruthy();
    expect(screen.queryByText("AI Capability Centre")).toBeNull();
  });
});
