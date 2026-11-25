import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { EmployeeHomeView } from "@/features/me/components/employee-home-view";
import { GrowthHubView } from "@/features/me/components/growth-hub-view";
import { ProgressTimelineView } from "@/features/me/components/progress-timeline-view";
import { RecruitmentOverviewView } from "@/features/recruitment/components/recruitment-overview-view";
import { searchGlobalIndex } from "@/lib/mock/global-search";
import type { NavItem, UserPortal } from "@/types";

// Employee portal review (BCMS Revert 3).

const push = vi.fn();
let hydratedId = "user-priya";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/features/talent/use-hydrated-user", () => ({
  useHydratedUser: () => getMockUser(hydratedId),
}));

beforeEach(() => {
  push.mockReset();
  hydratedId = "user-priya";
});

describe("Employee home", () => {
  it("uses the reviewed wording and call-to-action to-dos", () => {
    hydratedId = "user-james";
    render(<EmployeeHomeView />);
    expect(
      screen.getByText(/Welcome back\. Take charge of your growth and build the capabilities/),
    ).toBeTruthy();
    expect(screen.getByText("Your Capability Assessment Is Due")).toBeTruthy();
    expect(screen.getByText(/Evaluate your current proficiency against the skills required/)).toBeTruthy();
    expect(screen.getByText("Overall Role Capability Alignment")).toBeTruthy();
    for (const todo of ["Submit Evidence", "Begin Assigned Learning"]) {
      expect(screen.getByText(todo)).toBeTruthy();
    }
    expect(screen.getByText("My Development Priorities")).toBeTruthy();
    expect(screen.getByText("Build your Capability with AI Coach")).toBeTruthy();
    expect(screen.queryByText(/B\.B\. King/)).toBeNull();
  });
});

describe("Growth Hub", () => {
  it("is titled My Development Plan with Overall Development Progress", () => {
    render(<GrowthHubView />);
    expect(screen.getByRole("heading", { name: "My Development Plan" })).toBeTruthy();
    expect(screen.getByText("Overall Development Progress")).toBeTruthy();
  });
});

describe("Submit evidence", () => {
  it("needs a title and accepts several attachments", async () => {
    const user = userEvent.setup();
    const { container } = render(<ProgressTimelineView />);
    expect(screen.getByText(/Submit evidence of your learning and workplace application/)).toBeTruthy();

    const submit = screen.getByRole("button", { name: "Submit Evidence" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(true);

    await user.upload(input, [
      new File(["a"], "policy.pdf", { type: "application/pdf" }),
      new File(["b"], "diagram.png", { type: "image/png" }),
    ]);
    const list = await screen.findByRole("list", { name: "Attached files" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(submit.hasAttribute("disabled")).toBe(true); // no title yet

    await user.type(screen.getByLabelText("Evidence Title"), "Governance policy draft");
    expect(submit.hasAttribute("disabled")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Remove diagram.png" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    await user.click(submit);
    await waitFor(() => expect(screen.getByText(/Governance policy draft \(policy\.pdf\)/)).toBeTruthy());
  });

  it("links the active growth journey step to the learning page", () => {
    render(<ProgressTimelineView />);
    const link = screen.getByRole("link", { name: /Working on API Governance/ });
    expect(link.getAttribute("href")).toBe("/learning");
  });
});

describe("Promotion", () => {
  const flatten = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => [item, ...flatten(item.children ?? [])]);

  it("is removed from every portal's navigation and from search", () => {
    const portals: UserPortal[] = [
      "platform_super_admin",
      "organisation_admin",
      "hr_ld_admin",
      "line_manager",
      "employee",
    ];
    for (const portal of portals) {
      const items = flatten(getNavigationConfig(portal).sections.flatMap((s) => s.items));
      expect(items.some((i) => i.href?.includes("promotion"))).toBe(false);
    }
    expect(searchGlobalIndex("Promotion").some((r) => r.href.includes("promotion"))).toBe(false);
  });

  it("no longer appears on the talent overview", () => {
    render(<RecruitmentOverviewView />);
    expect(screen.queryByText(/Promotion/)).toBeNull();
  });
});

describe("AI Coach", () => {
  it("is replaced by AI Coaching in every portal", () => {
    const portals: UserPortal[] = [
      "platform_super_admin",
      "organisation_admin",
      "hr_ld_admin",
      "line_manager",
      "employee",
    ];
    for (const portal of portals) {
      const config = getNavigationConfig(portal);
      const hrefs = [
        ...config.sections.flatMap((s) => s.items).flatMap((i) => [i, ...(i.children ?? [])]),
        ...(config.mobileTabs ?? []),
      ].map((i) => i.href);
      expect(hrefs.some((href) => href?.startsWith("/ai-coach"))).toBe(false);
    }
    const coachTab = getNavigationConfig("employee").mobileTabs?.find((t) => t.id === "coach");
    expect(coachTab?.href).toBe("/ai/coaching");
  });

  it("is linked from the employee home page via AI Coaching", () => {
    render(<EmployeeHomeView />);
    expect(screen.getByRole("link", { name: "Launch AI Coach" }).getAttribute("href")).toBe("/ai/coaching");
  });
});
