import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { allOrganisations, getMockUser } from "@/config/mock-users";
import { resetProvisionedTenants } from "@/config/provisioned-tenants";
import { WorkspaceSelectionView } from "@/features/authentication/components/workspace-selection-view";

import { ProvisionTenantView } from "../components/provision-tenant-view";
import {
  getProvisioningDraft,
  listAuditEvents,
  PLAN_ENTITLEMENTS,
  provisionTenant,
  PROVISIONING_SECONDS,
  renewalFor,
  resetPlatform,
  tenantForOrganisation,
} from "../services/mock-platform";

// Platform Super Admin: New Tenant Provisioning (review fixes 1–7 and 11).

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/platform/tenants/new",
  useSearchParams: () => new URLSearchParams(),
}));

const session = vi.hoisted(() => ({ userId: "user-alex", setUserId: vi.fn() }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user } = await import("@/config/mock-users");
  const state = () => ({ user: user(session.userId), userId: session.userId, setUserId: session.setUserId });
  const useSessionStore = Object.assign(<T,>(selector: (s: ReturnType<typeof state>) => T) => selector(state()), {
    persist: { onFinishHydration: () => () => {}, hasHydrated: () => true },
    getState: state,
  });
  return { useSessionStore };
});

const draft = {
  legalName: "Acme Logistics",
  slug: "acme",
  plan: "Standard" as const,
  entitlements: [...PLAN_ENTITLEMENTS.Standard],
  adminName: "Ngozi Eze",
  adminEmail: "ngozi.eze@acme.example",
};

beforeEach(() => {
  resetPlatform();
  resetProvisionedTenants();
  push.mockReset();
  session.setUserId.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Provisioning form", () => {
  it("saves a partly filled draft without validating it", async () => {
    const user = userEvent.setup();
    render(<ProvisionTenantView />);
    await user.type(screen.getByLabelText("Legal Entity Name"), "Acme");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(getProvisioningDraft()?.legalName).toBe("Acme"));
    expect(screen.queryByText("Enter the admin name")).toBeNull();
  });

  it("offers every platform feature and applies the plan's defaults", async () => {
    const user = userEvent.setup();
    render(<ProvisionTenantView />);
    expect(screen.getByRole("checkbox", { name: /Talent Assessment/ })).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);

    await user.selectOptions(screen.getByLabelText("Subscription Tier"), "Standard");
    const checked = screen
      .getAllByRole("checkbox")
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => box.closest("label")!.querySelector("span span")!.textContent);
    expect(checked).toEqual(["L&D Library", "Assessments", "Reports"]);
    expect(screen.getByText(/Standard defaults/)).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: /AI Coaching/ }));
    expect(screen.getByText(/Customised from the Standard defaults/)).toBeTruthy();
  });
});

describe("Provisioning a tenant", () => {
  it("sets a future renewal, a real audit time and the actor's avatar", async () => {
    const record = await provisionTenant({ ...draft, plan: "Enterprise Plus" }, "Alex Root");
    expect(record.renewal).toBe(renewalFor("Enterprise Plus"));
    expect(renewalFor("Pilot / Trial", new Date(2026, 10, 23, 12))).toBe("Trial ends 23 Dec 2026");
    expect(renewalFor("Standard")).toBe("Monthly");
    const audit = listAuditEvents()[0]!;
    expect(audit.at).not.toBe("15 Nov 2026, 3:32 PM");
    expect(audit.adminAvatar).toBe(getMockUser("user-alex").avatarUrl);
  });

  it("becomes Active once provisioning time has passed", async () => {
    const record = await provisionTenant(draft, "Alex Root");
    expect(record.status).toBe("Provisioning");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + (PROVISIONING_SECONDS + 1) * 1000);
    expect(tenantForOrganisation("org-acme")!.status).toBe("Active");
    expect(listAuditEvents()[0]!.summary).toBe("Provisioning completed: Acme Logistics is active");
  });

  it("creates the organisation and its first Organisation Admin", async () => {
    await provisionTenant(draft, "Alex Root");
    expect(allOrganisations().some((o) => o.id === "org-acme" && o.name === "Acme Logistics")).toBe(true);
    expect(getMockUser("user-acme-admin")).toMatchObject({
      name: "Ngozi Eze",
      portal: "organisation_admin",
      organisationId: "org-acme",
    });
    await expect(provisionTenant({ ...draft, slug: "acme" }, "Alex Root")).rejects.toThrow(/already in use/);
    await expect(provisionTenant({ ...draft, slug: "ths" }, "Alex Root")).rejects.toThrow(/already in use/);
    await expect(provisionTenant({ ...draft, slug: "acme-2" }, "Alex Root")).rejects.toThrow(/already has a BICMAS account/);
  });

  it("lets the first admin sign in to the new workspace once it is active", async () => {
    await provisionTenant(draft, "Alex Root");
    const user = userEvent.setup();
    const { unmount } = render(<WorkspaceSelectionView />);
    const card = await screen.findByRole("button", { name: /Acme Logistics/ });
    expect(within(card).getByText("Provisioning")).toBeTruthy();
    await user.click(card);
    expect(session.setUserId).not.toHaveBeenCalled();
    unmount();

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + (PROVISIONING_SECONDS + 1) * 1000);
    render(<WorkspaceSelectionView />);
    await user.click(await screen.findByRole("button", { name: /Acme Logistics/ }));
    expect(session.setUserId).toHaveBeenCalledWith("user-acme-admin");
    expect(push).toHaveBeenCalledWith("/org");
  });
});
