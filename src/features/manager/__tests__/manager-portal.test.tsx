import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { GapAnalysisView } from "@/features/insights/components/gap-analysis-view";
import { GrowthPathwayView } from "@/features/ld/components/growth-pathway-view";
import { TeamDashboardView } from "@/features/manager/components/team-dashboard-view";
import { TeamDirectoryView } from "@/features/manager/components/team-directory-view";
import { EvidenceReviewView } from "@/features/capability/components/review";
import { searchGlobalIndex } from "@/lib/mock/global-search";
import type { MockUser } from "@/types/user";

// Line Manager review (BCMS Revert 2) — manager-only changes; other portals must be unchanged.

const push = vi.fn();
let search = new URLSearchParams();
let currentUser: MockUser | null = getMockUser("user-michael");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => search,
}));
vi.mock("@/features/talent/use-hydrated-user", () => ({ useHydratedUser: () => currentUser }));

const asManager = () => (currentUser = getMockUser("user-michael"));
const asHr = () => (currentUser = getMockUser("user-priya"));

beforeEach(() => {
  push.mockReset();
  search = new URLSearchParams();
  asManager();
});

describe("Team Dashboard", () => {
  it("uses the reviewed wording", () => {
    render(<TeamDashboardView />);
    expect(screen.getByText("Monitor your team's capabilities, identify skill gaps and drive employee development.")).toBeTruthy();
    for (const heading of ["Skill/Competency", "Avg. Proficiency Gap", "Employees Affected", "Developmental Priority"]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
    }
    expect(screen.getByText("Pending Capability Verification · 1 New")).toBeTruthy();
  });

  it("makes every summary card a link", () => {
    render(<TeamDashboardView />);
    const card = (name: RegExp) => screen.getByRole("link", { name });
    expect(card(/Team Size/).getAttribute("href")).toBe("/manager/team");
    expect(card(/Average Capability Score/).getAttribute("href")).toBe("/insights/gaps");
    expect(card(/Pending Verification\s*1/).getAttribute("href")).toBe("/verification/team");
    expect(card(/Skills Improved/).getAttribute("href")).toBe("/insights/gaps");
  });

  it("shows a clickable Manager Action Centre", async () => {
    const user = userEvent.setup();
    render(<TeamDashboardView />);
    const centre = screen.getByRole("heading", { name: "Manager Action Centre" }).closest("section")!;
    const links = within(centre).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Complete assessments", "/manager/team?focus=assessment"],
      ["Verify capabilities", "/verification/team"],
      ["Review development plans", "/ai/plans"],
      ["Follow up on learning", "/manager/team?focus=learning"],
    ]);
    await user.click(within(centre).getByText("1 submission awaiting review"));
    expect(push).toHaveBeenCalledWith("/verification/team"); // the whole row is clickable
  });

  it("links gap rows to the affected employees", () => {
    render(<TeamDashboardView />);
    expect(screen.getByRole("link", { name: "Microservices Design" }).getAttribute("href")).toBe(
      "/manager/team?gap=Microservices%20Design",
    );
  });
});

describe("Team Directory", () => {
  it("uses the reviewed wording and actions", () => {
    render(<TeamDirectoryView />);
    expect(
      screen.getByText("View and manage the capability, skill gaps and development progress of your direct reports."),
    ).toBeTruthy();
    expect(screen.getAllByText("Capability Score").length).toBeGreaterThan(0);
    expect(screen.queryByText("Role Match")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Review Dev. Plan" }).length).toBe(2);
    expect(screen.queryByText("Review Growth")).toBeNull();
  });

  it("searches by name or job title", async () => {
    const user = userEvent.setup();
    render(<TeamDirectoryView />);
    await user.type(screen.getByRole("searchbox", { name: "Search employees" }), "data engineer");
    expect(screen.getByText("Robert Chen")).toBeTruthy();
    expect(screen.queryByText("James Miller")).toBeNull();
    await user.clear(screen.getByRole("searchbox", { name: "Search employees" }));
    await user.type(screen.getByRole("searchbox", { name: "Search employees" }), "nobody");
    expect(screen.getByText(/No direct reports match/)).toBeTruthy();
  });

  it("switches between cards and a list view", async () => {
    const user = userEvent.setup();
    render(<TeamDirectoryView />);
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button", { name: "List" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 3 direct reports
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("applies filters from the dashboard with a clearable chip", () => {
    search = new URLSearchParams("focus=learning");
    const { unmount } = render(<TeamDirectoryView />);
    expect(screen.getByText("Employees with overdue learning")).toBeTruthy();
    expect(screen.queryByText("Sarah Connor")).toBeNull();
    expect(screen.getByText("3 overdue learning activities")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear filter" }).getAttribute("href")).toBe("/manager/team");
    unmount();
    search = new URLSearchParams("gap=Microservices Design");
    render(<TeamDirectoryView />);
    expect(screen.getByText("Employees affected by the Microservices Design gap")).toBeTruthy();
    expect(screen.getByText("James Miller")).toBeTruthy();
    expect(screen.queryByText("Sarah Connor")).toBeNull();
  });
});

describe("Development plan", () => {
  it("shows managers progress and actions instead of an evidence upload", () => {
    render(<GrowthPathwayView planId="plan-james-ai" />);
    expect(screen.queryByText("Upload Practice Evidence")).toBeNull();
    const panel = screen.getByRole("region", { name: "Progress & Verification" });
    for (const label of [
      "Learning Completion",
      "Workplace Practice",
      "Evidence Submitted",
      "Date Submitted",
      "Verification Status",
      "Action Required",
    ]) {
      expect(within(panel).getByText(label)).toBeTruthy();
    }
    expect(within(panel).getByText("8 Nov 2024")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "Verify evidence" }).getAttribute("href")).toBe("/verification/team");
  });

  it("is unchanged for other portals", () => {
    asHr();
    render(<GrowthPathwayView planId="plan-james-ai" />);
    expect(screen.getByText("Upload Practice Evidence")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Progress & Verification" })).toBeNull();
  });
});

describe("Verification decision", () => {
  it("uses the reviewed options and requires feedback from the reviewer", async () => {
    const user = userEvent.setup();
    render(<EvidenceReviewView evidenceId="cycle-h2-emp-7710" />);
    const skill = within(screen.getByRole("region", { name: "Cloud Infrastructure Design" }));
    for (const label of ["Verified – Requirements Met", "Additional Evidence Required", "Not Verified – Requirements Not Met"]) {
      expect(skill.getByText(label)).toBeTruthy();
    }
    const feedback = skill.getByLabelText(/Feedback for Employee/);
    expect(feedback.getAttribute("placeholder")).toMatch(/Provide feedback on the evidence submitted, observed strengths/);
    await user.click(skill.getByText("Verified – Requirements Met"));
    const submit = skill.getByRole("button", { name: "Submit Verification" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.type(feedback, "   ");
    expect(submit.disabled).toBe(true); // whitespace is not feedback
    await user.type(feedback, "Clear architecture evidence.");
    expect(submit.disabled).toBe(false);
  });

  it("offers no decision to people who are not the reviewer", () => {
    asHr();
    render(<EvidenceReviewView evidenceId="cycle-h2-emp-7710" />);
    expect(screen.queryByRole("button", { name: "Submit Verification" })).toBeNull();
  });
});

describe("Team Progress", () => {
  it("uses the reviewed wording, drills into gaps and lists developmental actions", async () => {
    const user = userEvent.setup();
    render(<GapAnalysisView />);
    expect(screen.getByText(/View your team's verified capability strengths, identify critical skill gaps/)).toBeTruthy();
    expect(screen.getByText(/Avg Team Capability Match/)).toBeTruthy();
    expect(screen.getByText("Strongest Team Capability")).toBeTruthy();
    const gap = screen.getByRole("button", { name: "Microservices Design" });
    expect(gap.getAttribute("aria-expanded")).toBe("false");
    await user.click(gap);
    expect(gap.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Employees contributing to this gap")).toBeTruthy();
    expect(screen.getAllByText("James Miller").length).toBeGreaterThan(0);
    const actions = screen.getByRole("heading", { name: "Team Developmental Actions" }).closest("section")!;
    expect(within(actions).getAllByRole("link").length).toBeGreaterThan(0);
  });

  it("shows other portals the figures without names or actions", () => {
    asHr();
    render(<GapAnalysisView />);
    expect(screen.getByText("Average capability match")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Microservices Design" })).toBeNull();
    expect(screen.queryByText("Team Developmental Actions")).toBeNull();
  });
});

describe("Promotion Review", () => {
  it("is removed from the line manager portal", () => {
    const items = getNavigationConfig("line_manager").sections.flatMap((s) => s.items);
    expect(items.some((i) => i.href === "/manager/promotion" || i.label === "Promotion Review")).toBe(false);
    expect(searchGlobalIndex("Promotion Review").some((r) => r.href === "/manager/promotion")).toBe(false);
  });
});
