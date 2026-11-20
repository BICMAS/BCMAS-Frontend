import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PlansHubView } from "../components/plans/plans-hub-view";
import { MockAiClient } from "../mocks/mock-ai-client";
import { mockClient, renderWithAi } from "../testing";

describe("AI Training Plans", () => {
  it("analyses competency gaps and recommends organisational learning", async () => {
    const user = userEvent.setup();
    renderWithAi(<PlansHubView />);
    expect(await screen.findByText("The role sets API standards for customer-facing platforms.")).toBeTruthy();
    expect(screen.getAllByText("API Governance").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Employee")).toBeNull(); // employees only see themselves
    await user.click(screen.getByRole("tab", { name: "Learning" }));
    expect(await screen.findByText("Advanced API Governance & Ethics 2024")).toBeTruthy();
  });

  it("generates an IDP with goals, interventions and milestones", async () => {
    const user = userEvent.setup();
    renderWithAi(<PlansHubView />);
    await user.click(await screen.findByRole("tab", { name: "Generate IDP" }));
    await user.click(await screen.findByRole("checkbox", { name: /Strategic Influence/ }));
    const horizon = screen.getByLabelText("Length (weeks)");
    await user.clear(horizon);
    await user.type(horizon, "16");
    await user.click(screen.getByRole("button", { name: "Generate IDP" }));
    const goal = await screen.findByRole("article", { name: "Strategic Influence" });
    expect(within(goal).getByText(/Level 3 → 5 \(gap 2\)/)).toBeTruthy();
    expect(within(goal).getByText("Strategic Influence Masterclass")).toBeTruthy();
    expect(within(goal).getByText(/Week 8:/)).toBeTruthy();
    expect(within(goal).getByText(/Week 16:/)).toBeTruthy();
    expect(screen.getByText(/becomes official only after review/)).toBeTruthy();
    expect(screen.queryByRole("article", { name: "API Governance" })).toBeNull(); // focus respected
  });

  it("lets the manager approve a plan and record its commit, but not the employee", async () => {
    const user = userEvent.setup();
    let signedIn = "user-james";
    const shared = new MockAiClient({ latencyMs: 0, userId: () => signedIn });
    await shared.draftPlan({ employee_id: "emp-8721", role_id: null, focus_skill_ids: null, horizon_weeks: 12, constraints: null });

    const employee = renderWithAi(<PlansHubView />, shared);
    await user.click(await screen.findByRole("tab", { name: "Plan reviews" }));
    expect(await screen.findByText(/Waiting for your line manager or HR/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve plan" })).toBeNull();
    employee.unmount();

    // Same mock store, now signed in as the line manager reviewing James's plan.
    signedIn = "user-michael";
    renderWithAi(<PlansHubView />, shared);
    const subject = await screen.findByLabelText("Employee");
    await user.clear(subject);
    await user.type(subject, "emp-8721");
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(await screen.findByRole("tab", { name: "Plan reviews" }));
    await user.click(await screen.findByRole("button", { name: "Approve plan" }));
    expect(await screen.findByText(/Approved. To make it official/)).toBeTruthy();
    expect(screen.getByText(/BE-052, mocked/)).toBeTruthy();
    await user.type(screen.getByLabelText("HR system plan ID"), "plan-7001");
    await user.click(screen.getByRole("button", { name: "Record commit" }));
    expect(await screen.findByText("committed")).toBeTruthy();
  });

  it("requires a reason to reject a plan", async () => {
    const user = userEvent.setup();
    const client = mockClient("user-michael");
    await client.draftPlan({ employee_id: "emp-8721", role_id: null, focus_skill_ids: null, horizon_weeks: 12, constraints: null });
    renderWithAi(<PlansHubView />, client);
    const subject = await screen.findByLabelText("Employee");
    await user.clear(subject);
    await user.type(subject, "emp-8721");
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(await screen.findByRole("tab", { name: "Plan reviews" }));
    const reject = await screen.findByRole("button", { name: "Reject" });
    expect((reject as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText(/Comment/), "Too broad for this quarter");
    await user.click(reject);
    expect(await screen.findByText("rejected")).toBeTruthy();
  });

  it("tracks progress on an official plan and asks the AI to review it", async () => {
    const user = userEvent.setup();
    renderWithAi(<PlansHubView />);
    await user.click(await screen.findByRole("tab", { name: "Progress" }));
    await user.type(screen.getByLabelText("Official plan ID"), "plan-5501");
    await user.click(screen.getByRole("button", { name: "Track progress" }));
    expect(await screen.findByText("Progress on plan-5501")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "API Governance progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("at risk")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ask AI to review the plan" }));
    expect(await screen.findByText("The plan is on track; no changes are proposed.")).toBeTruthy();
  });
});
