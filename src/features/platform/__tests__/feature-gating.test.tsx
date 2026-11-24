import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { resetProvisionedTenants } from "@/config/provisioned-tenants";
import { featureForPath, getNavigationConfig, navigationByPortal } from "@/config/navigation";
import type { NavItem, NavigationConfig } from "@/types/navigation";

import { PLAN_ENTITLEMENTS, provisionTenant, resetPlatform, tenantForOrganisation } from "../services/mock-platform";

// Features chosen for a tenant on the platform decide which menus its people see.

const nav = vi.hoisted(() => ({ pathname: "/org" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

const session = vi.hoisted(() => ({ userId: "user-sarah", organisationId: "org-gec" }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user, getMockOrganisation: org, allOrganisations } = await import("@/config/mock-users");
  const state = () => ({
    user: user(session.userId),
    userId: session.userId,
    organisationId: session.organisationId,
    organisation: org(session.organisationId),
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

function hrefs(config: NavigationConfig) {
  const flatten = (items: NavItem[]): NavItem[] => items.flatMap((i) => [i, ...flatten(i.children ?? [])]);
  return [...flatten(config.sections.flatMap((s) => s.items)).map((i) => i.href), ...config.mobileTabs.map((t) => t.href)];
}

beforeEach(() => {
  resetPlatform();
  resetProvisionedTenants();
  session.userId = "user-sarah";
  session.organisationId = "org-gec";
  nav.pathname = "/org";
});

describe("Menu gating by tenant features", () => {
  it("maps feature paths and leaves core paths alone", () => {
    expect(featureForPath("/talent/vacancies")).toBe("Talent Assessment");
    expect(featureForPath("/manager/recruitment/vac-1")).toBe("Talent Assessment");
    expect(featureForPath("/insights/gaps")).toBe("Reports");
    expect(featureForPath("/ai/coaching")).toBe("AI Coaching");
    expect(featureForPath("/learning")).toBe("L&D Library");
    expect(featureForPath("/roles")).toBeNull();
    expect(featureForPath("/ld-something")).toBeNull();
  });

  it("shows everything when no features are given", () => {
    expect(getNavigationConfig("hr_ld_admin")).toBe(navigationByPortal.hr_ld_admin);
    expect(getNavigationConfig("hr_ld_admin", null)).toBe(navigationByPortal.hr_ld_admin);
  });

  it("hides Talent Assessment menus for a Standard tenant", () => {
    const hr = hrefs(getNavigationConfig("hr_ld_admin", PLAN_ENTITLEMENTS.Standard));
    expect(hr.some((h) => h.startsWith("/talent"))).toBe(false);
    expect(hr).toContain("/learning");
    const manager = hrefs(getNavigationConfig("line_manager", PLAN_ENTITLEMENTS.Standard));
    expect(manager).not.toContain("/manager/vacancies");
    expect(manager).not.toContain("/manager/recruitment");
    expect(manager).not.toContain("/ai/coaching");
    expect(manager).toContain("/manager/team");
  });

  it("drops switched-off menus and mobile tabs but keeps the core landing page", () => {
    const hr = getNavigationConfig("hr_ld_admin", PLAN_ENTITLEMENTS["Pilot / Trial"]);
    expect(hrefs(hr).some((h) => h === "/training-plan" || h === "/learning")).toBe(false);
    expect(hr.defaultHref).toBe("/roles");
    expect(hr.mobileTabs.map((t) => t.href)).toEqual(["/roles", "/employees", "/assessments/cycles"]);
  });

  it("drops a section once all its items are gone", () => {
    const employee = getNavigationConfig("employee", []);
    expect(employee.sections.map((s) => s.id)).toEqual(["journey", "ai"]);
  });

  it("keeps the full menu for the seeded Enterprise Plus tenant", () => {
    const gec = tenantForOrganisation("org-gec")!;
    expect(getNavigationConfig("hr_ld_admin", gec.entitlements).sections).toEqual(
      navigationByPortal.hr_ld_admin.sections,
    );
  });
});

describe("App shell", () => {
  it("shows a provisioned tenant's admin only the menus of the features it bought", async () => {
    await provisionTenant(
      {
        legalName: "Acme Logistics",
        slug: "acme",
        plan: "Pilot / Trial",
        entitlements: [...PLAN_ENTITLEMENTS["Pilot / Trial"]],
        adminName: "Ngozi Eze",
        adminEmail: "ngozi.eze@acme.example",
      },
      "Alex Root",
    );
    session.userId = "user-acme-admin";
    session.organisationId = "org-acme";
    render(<AppShell>page</AppShell>);
    await waitFor(() => expect(screen.queryAllByRole("link", { name: /^Training Plan$/ })).toHaveLength(0));
    expect(screen.queryAllByRole("link", { name: /Learning & Development/ })).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: /Capability Assessment/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Executive Insights/ }).length).toBeGreaterThan(0);
  });
});

describe("Page access by URL", () => {
  async function asPilotAdmin() {
    await provisionTenant(
      {
        legalName: "Acme Logistics",
        slug: "acme",
        plan: "Pilot / Trial",
        entitlements: [...PLAN_ENTITLEMENTS["Pilot / Trial"]],
        adminName: "Ngozi Eze",
        adminEmail: "ngozi.eze@acme.example",
      },
      "Alex Root",
    );
    session.userId = "user-acme-admin";
    session.organisationId = "org-acme";
  }

  it("blocks a switched-off feature's page, including its sub-pages", async () => {
    await asPilotAdmin();
    for (const path of ["/learning", "/talent/vacancies/vac-1"]) {
      nav.pathname = path;
      const { unmount } = render(<AppShell>secret page</AppShell>);
      expect(screen.getByRole("heading", { name: /isn't enabled/ })).toBeTruthy();
      expect(screen.queryByText("secret page")).toBeNull();
      expect(screen.getByRole("link", { name: "Go to your home page" }).getAttribute("href")).toBe("/org");
      unmount();
    }
  });

  it("opens pages of enabled features and core pages", async () => {
    await asPilotAdmin();
    for (const path of ["/assessments/cycles", "/roles", "/insights"]) {
      nav.pathname = path;
      const { unmount } = render(<AppShell>allowed page</AppShell>);
      expect(screen.getByText("allowed page")).toBeTruthy();
      unmount();
    }
  });

  it("names the feature and organisation", async () => {
    await asPilotAdmin();
    nav.pathname = "/talent";
    render(<AppShell>page</AppShell>);
    expect(screen.getByRole("heading", { name: "Talent Assessment isn't enabled" })).toBeTruthy();
    expect(screen.getByText(/not part of Acme Logistics's subscription/)).toBeTruthy();
  });

  it("leaves the seeded Enterprise Plus tenant fully open", () => {
    nav.pathname = "/talent/vacancies";
    render(<AppShell>vacancies</AppShell>);
    expect(screen.getByText("vacancies")).toBeTruthy();
  });
});
