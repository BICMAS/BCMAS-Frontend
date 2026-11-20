import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AssessmentsHubView } from "../components/assessments/assessments-hub-view";
import { TakeAssessmentView } from "../components/assessments/take-assessment-view";
import { BackendAssessmentDelivery } from "../delivery";
import { MockAssessmentDelivery } from "../mocks/mock-assessment-delivery";
import { mockClient, renderWithAi } from "../testing";

beforeEach(() => sessionStorage.clear());

describe("AI Talent Assessment — participant", () => {
  it("selects an assigned assessment", async () => {
    renderWithAi(<AssessmentsHubView delivery={new MockAssessmentDelivery(0)} />);
    expect(await screen.findByText("Senior Solutions Architect capability assessment")).toBeTruthy();
    const start = screen.getByRole("link", { name: "Start assessment" });
    expect(start.getAttribute("href")).toBe("/ai/assessments/dev-james/take");
    expect(screen.queryByText("Evaluate an assessment")).toBeNull(); // assessor-only
  });

  it("navigates questions, captures each response type and submits", async () => {
    const user = userEvent.setup();
    const delivery = new MockAssessmentDelivery(0);
    renderWithAi(<TakeAssessmentView assessmentId="dev-james" delivery={delivery} />);
    expect(await screen.findByText(/Question 1 of 4/)).toBeTruthy();
    // 1. Situational judgement: choose an option.
    await user.click(screen.getByRole("radio", { name: /Define expiry and access rules/ }));
    expect(screen.getByText("1 of 4 answered")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    // 2. Behavioural: free text.
    await user.type(screen.getByLabelText("Your answer"), "I explained the caching trade-off to finance.");
    await user.click(screen.getByRole("button", { name: /Next/ }));
    await user.type(screen.getByLabelText("Your answer"), "Split into cart, checkout and fulfilment services.");
    // Jump directly to the last question via the navigator, then back.
    await user.click(screen.getByRole("button", { name: "Question 4" }));
    expect(screen.getByText("Self-assessment: API governance")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Submit responses" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    // 4. Self-assessment: rating + example.
    await user.click(screen.getByRole("button", { name: /4 · Advanced/ }));
    await user.type(screen.getByLabelText("Work example"), "I document every endpoint with the API template.");
    await user.click(screen.getByRole("button", { name: /Question 1 \(answered\)/ }));
    expect((screen.getByRole("radio", { name: /Define expiry and access rules/ }) as HTMLInputElement).getAttribute("aria-checked") ?? "true").not.toBe("false");
    await user.click(screen.getByRole("button", { name: /Question 4/ }));
    await user.click(screen.getByRole("button", { name: "Submit responses" }));
    expect(await screen.findByText("Responses submitted")).toBeTruthy();
    expect(delivery.submitted).toEqual([
      { item_id: "lib-sjt-api", response_text: null, selected_option_key: "d", rating: null },
      { item_id: "lib-beh-influence", response_text: "I explained the caching trade-off to finance.", selected_option_key: null, rating: null },
      { item_id: "lib-tech-ms", response_text: "Split into cart, checkout and fulfilment services.", selected_option_key: null, rating: null },
      { item_id: "lib-self", response_text: "I document every endpoint with the API template.", selected_option_key: null, rating: 4 },
    ]);
  });

  it("keeps answers as a local draft across reloads", async () => {
    const user = userEvent.setup();
    const first = renderWithAi(<TakeAssessmentView assessmentId="dev-james" delivery={new MockAssessmentDelivery(0)} />);
    await user.click(await screen.findByRole("radio", { name: /Review the integration/ }));
    first.unmount();
    renderWithAi(<TakeAssessmentView assessmentId="dev-james" delivery={new MockAssessmentDelivery(0)} />);
    expect(await screen.findByText("1 of 4 answered")).toBeTruthy();
  });

  it("says honestly that live assessment delivery is not connected yet", async () => {
    renderWithAi(<AssessmentsHubView delivery={new BackendAssessmentDelivery()} />);
    expect(await screen.findByText("Not connected yet")).toBeTruthy();
    expect(screen.getByText(/BE-072/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("AI Talent Assessment — assessor", () => {
  async function evaluate(user: ReturnType<typeof userEvent.setup>) {
    renderWithAi(<AssessmentsHubView delivery={new MockAssessmentDelivery(0)} />, mockClient("user-priya"));
    await user.type(await screen.findByLabelText("Assessment ID"), "dev-james");
    await user.click(screen.getByRole("button", { name: "Evaluate" }));
    return screen.findByText("Results for dev-james");
  }

  it("shows competency results with criteria, evidence and rating claims", async () => {
    const user = userEvent.setup();
    await evaluate(user);
    expect(screen.getByRole("table", { name: "Competency levels" })).toBeTruthy();
    const influence = screen.getByText("Strategic Influence", { selector: "[data-slot='card-title']" }).closest("[data-slot='card']") as HTMLElement;
    expect(within(influence).getByText(/Level 3 · required 5 · medium confidence/)).toBeTruthy();
    expect(within(influence).getByText(/I explained the latency versus cost trade-off/)).toBeTruthy();
    expect(within(influence).getByText("not evidenced")).toBeTruthy();
    expect(screen.getByText(/Self rating 4: aligned/)).toBeTruthy();
  });

  it("requires a score and a reason for overrides, then confirms and shares results", async () => {
    const user = userEvent.setup();
    await evaluate(user);
    const confirm = screen.getByRole("button", { name: "Confirm scores" });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    const overrides = screen.getAllByRole("radio", { name: "Override" });
    await user.click(overrides[2]!); // Microservices Design
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getAllByLabelText("Score (1–5)")[0]!, "4");
    await user.type(screen.getAllByLabelText("Reason")[0]!, "Observed retry design last month");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await user.click(confirm);
    expect(await screen.findByText("Review outcome")).toBeTruthy();
    expect(screen.getByText(/saved to the assessment record via 3 update/)).toBeTruthy();
    expect(screen.getByText(/Shared with the Training Plan Agent/)).toBeTruthy();
    expect(screen.getByText("modified")).toBeTruthy();
  });

  it("explains why a report cannot be drafted before scores are committed", async () => {
    const user = userEvent.setup();
    await evaluate(user);
    await user.click(screen.getByRole("button", { name: "Confirm scores" }));
    await user.click(await screen.findByRole("button", { name: "Draft assessment report" }));
    expect(await screen.findByText(/commit the reviewed scores first/)).toBeTruthy();
  });

  it("shows integrity warnings and renders untrusted text inertly (QA)", async () => {
    const user = userEvent.setup();
    const client = mockClient("user-priya");
    const original = client.scoreAssessment;
    const payload = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
    client.scoreAssessment = async (...args) => {
      const view = await original(...args);
      const [first, ...rest] = view.evaluation.recommendations;
      return {
        ...view,
        evaluation: {
          ...view.evaluation,
          integrity_warnings: ["delimiter_injection", "score_manipulation"],
          recommendations: [{ ...first!, rationale: payload }, ...rest],
        },
      };
    };
    const { container } = renderWithAi(<AssessmentsHubView delivery={new MockAssessmentDelivery(0)} />, client);
    await user.type(await screen.findByLabelText("Assessment ID"), "dev-james");
    await user.click(screen.getByRole("button", { name: "Evaluate" }));
    expect(await screen.findByText("Integrity check: review these responses carefully")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/delimiter injection, score manipulation/);
    expect(screen.getByText(payload)).toBeTruthy(); // shown as text…
    expect(container.querySelector("script, img[onerror]")).toBeNull(); // …never as markup
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("does not let employees evaluate assessments", async () => {
    renderWithAi(<AssessmentsHubView delivery={new MockAssessmentDelivery(0)} />, mockClient("user-james"));
    expect(await screen.findByText("My assessments")).toBeTruthy();
    expect(screen.queryByLabelText("Assessment ID")).toBeNull();
  });
});
