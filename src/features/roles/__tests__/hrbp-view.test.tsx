import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig, isPathAllowed, isPathBlockedForPortal } from "@/config/navigation";
import { AssessmentCyclesView } from "@/features/capability/components/cycles";
import { PLAN_ENTITLEMENTS } from "@/features/platform/services/mock-platform";
import { SkillsLibraryView } from "@/features/skills/components/skills-library-view";
import { searchGlobalIndex } from "@/lib/mock/global-search";
import type { NavItem } from "@/types/navigation";
import type { MockUser } from "@/types/user";

// HRBP view corrected per the "HR BP View" review.

const nav = vi.hoisted(() => ({ pathname: "/roles" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

let currentUser: MockUser | null = getMockUser("user-priya");
vi.mock("@/features/talent/use-hydrated-user", () => ({ useHydratedUser: () => currentUser }));

const session = vi.hoisted(() => ({ userId: "user-priya" }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user, getMockOrganisation: org, allOrganisations } = await import("@/config/mock-users");
  const state = () => ({
    user: user(session.userId),
    userId: session.userId,
    organisationId: "org-gec",
    organisation: org("org-gec"),
    organisations: allOrganisations(),
    setUserId: vi.fn(),
    setOrganisationId: vi.fn(),
  });
  const useSessionStore = Object.assign(<T,>(selector: (s: ReturnType<typeof state>) => T) => selector(state()), {
    persist: { onFinishHydration: () => () => {}, hasHydrated: () => true },
    getState: state,
  });
  return { useSessionStore };
});

const labels = () => {
  const flatten = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...flatten(i.children ?? [])]);
  return flatten(getNavigationConfig("hr_ld_admin").sections.flatMap((s) => s.items)).map((i) => i.label);
};

beforeEach(() => {
  nav.pathname = "/roles";
  session.userId = "user-priya";
  currentUser = getMockUser("user-priya");
});

describe("HRBP menu", () => {
  it("keeps the relevant pages and starts on the Roles Directory", () => {
    const hr = getNavigationConfig("hr_ld_admin");
    expect(hr.defaultHref).toBe("/roles");
    for (const label of [
      "Roles Directory",
      "Skills Library",
      "Employee Directory",
      "Bulk Mapping",
      "Mapping Workspace",
      "Capability Assessment",
      "Learning & Development",
      "Training Plan",
      "About BCMS",
    ]) {
      expect(labels()).toContain(label);
    }
  });

  it("removes the pages marked not applicable", () => {
    for (const label of [
      "Organisation Overview",
      "Framework Settings",
      "Organization",
      "Org Chart",
      "Executive Insights",
      "Security & Roles",
      "System Settings",
      "AI Capability Centre",
      "AI Training Plans",
    ]) {
      expect(labels()).not.toContain(label);
    }
    expect(getNavigationConfig("hr_ld_admin").sections.map((s) => s.title)).not.toContain("AI");
  });

  it("blocks the removed pages by URL for HRBPs only", () => {
    for (const path of ["/org", "/org/chart", "/skills/framework", "/settings/users", "/insights", "/ai/plans"]) {
      expect(isPathBlockedForPortal(path, "hr_ld_admin")).toBe(true);
      expect(isPathBlockedForPortal(path, "organisation_admin")).toBe(false);
    }
    for (const path of ["/roles", "/skills", "/employees/mapping/bulk", "/assessments/cycles", "/about", "/talent"]) {
      expect(isPathBlockedForPortal(path, "hr_ld_admin")).toBe(false);
    }
  });

  it("shows a message instead of a removed page", () => {
    nav.pathname = "/org/chart";
    render(<AppShell>org chart</AppShell>);
    expect(screen.getByRole("heading", { name: "This page isn't part of your role" })).toBeTruthy();
    expect(screen.queryByText("org chart")).toBeNull();
    expect(screen.getByRole("link", { name: "Go to your home page" }).getAttribute("href")).toBe("/roles");
  });
});

describe("Skills Library for HRBPs", () => {
  it("has no Framework settings button", () => {
    render(<SkillsLibraryView initialSkills={[]} />);
    expect(screen.queryByRole("link", { name: "Framework settings" })).toBeNull();
  });

  it("keeps the button for the Organisation Admin", () => {
    currentUser = getMockUser("user-sarah");
    render(<SkillsLibraryView initialSkills={[]} />);
    expect(screen.getByRole("link", { name: "Framework settings" })).toBeTruthy();
  });
});

describe("Capability Assessment Cycles for HRBPs", () => {
  it("is view only: completion is shown, nothing can be created or changed", () => {
    render(<AssessmentCyclesView />);
    expect(screen.getByText("View only")).toBeTruthy();
    expect(screen.getByText("Total Completion Progress")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create New Cycle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send Reminders" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save Assessment Configuration" })).toBeNull();
    expect(screen.getByLabelText("Applies to").matches(":disabled")).toBe(true);
  });

  it("stays editable for the Organisation Admin", () => {
    currentUser = getMockUser("user-sarah");
    render(<AssessmentCyclesView />);
    expect(screen.getByRole("button", { name: "Create New Cycle" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Assessment Configuration" })).toBeTruthy();
  });
});

describe("Global search", () => {
  const hrbpCanOpen = (href: string) => !isPathBlockedForPortal(href, "hr_ld_admin");

  it("leaves out pages the HRBP may not open", () => {
    const hrefs = searchGlobalIndex("", 100, hrbpCanOpen).map((r) => r.href);
    for (const blocked of ["/org", "/org/chart", "/skills/framework", "/ld", "/verification"]) {
      expect(hrefs).not.toContain(blocked);
    }
    for (const kept of ["/roles", "/skills", "/employees/mapping/bulk", "/learning", "/talent/vacancies"]) {
      expect(hrefs).toContain(kept);
    }
  });

  it("leaves out pages of features switched off for the tenant", () => {
    const pilot = PLAN_ENTITLEMENTS["Pilot / Trial"];
    const hrefs = searchGlobalIndex("", 100, (href) => isPathAllowed(href, pilot)).map((r) => r.href);
    expect(hrefs).not.toContain("/learning");
    expect(hrefs.some((h) => h.startsWith("/talent"))).toBe(false);
    expect(hrefs).toContain("/assessments/cycles");
  });

  it("still finds everything when no filter is given", () => {
    expect(searchGlobalIndex("", 100).map((r) => r.href)).toContain("/org/chart");
  });

  it("does not offer blocked pages in the app shell's search", async () => {
    const user = userEvent.setup();
    render(<AppShell>roles</AppShell>);
    await user.click(screen.getAllByRole("button", { name: "Open search" })[0]!);
    await user.keyboard("org chart");
    expect(screen.queryByText("Visual Org Chart")).toBeNull();
    await user.clear(screen.getByPlaceholderText("Search roles, skills, employees…"));
    await user.keyboard("Roles");
    expect(screen.getAllByRole("button", { name: /Roles/ }).length).toBeGreaterThan(0);
  });
});
