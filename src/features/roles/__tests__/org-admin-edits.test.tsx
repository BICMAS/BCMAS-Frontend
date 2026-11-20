import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { AboutBcmsView } from "@/features/organisation/components/about-bcms-view";
import { OrgOverviewView } from "@/features/organisation/components/org-overview-view";
import { RoleDetailView } from "@/features/roles/components/role-detail-view";
import { RolesDirectoryView } from "@/features/roles/components/roles-directory-view";
import { listRoles, getRole } from "@/features/roles/services/mock-roles";
import type { MockUser } from "@/types/user";

// Organisation Admin review (BCMS Edit): changes appear for Organisation Admins only.

const push = vi.fn();
let currentUser: MockUser | null = getMockUser("user-sarah");

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/roles" }));
vi.mock("@/features/talent/use-hydrated-user", () => ({ useHydratedUser: () => currentUser }));

beforeEach(() => {
  push.mockReset();
  currentUser = getMockUser("user-sarah"); // Organisation Admin
});

describe("Organisation Overview", () => {
  it("shows the organisation's name and overview line", async () => {
    render(await OrgOverviewView());
    expect(screen.getByRole("heading", { level: 1, name: "Global Enterprise Corp" })).toBeTruthy();
    expect(screen.getByText("Manufacturing & Distribution | Nigeria | 12 Departments")).toBeTruthy();
  });

  it("links every summary card to its source, with the reviewed labels", async () => {
    render(await OrgOverviewView());
    const expected: [string, string][] = [
      ["Total Departments", "/org/departments"],
      ["Total Defined Roles", "/roles"],
      ["Approved Role Skills Profile", "/roles?status=approved,published"],
      ["Roles Profile Awaiting Approval", "/roles?status=awaiting_review"],
      ["Total Workforce", "/employees"],
    ];
    for (const [label, href] of expected) {
      expect(screen.getByRole("link", { name: new RegExp(`^${label}:`) }).getAttribute("href")).toBe(href);
    }
  });
});

describe("Roles Directory", () => {
  it("adds a Skill Profile Coverage column", async () => {
    render(<RolesDirectoryView initialRoles={await listRoles()} />);
    expect(screen.getByRole("columnheader", { name: "Skill Profile Coverage" })).toBeTruthy();
    const row = screen.getByRole("link", { name: "Lead Data Engineer" }).closest("tr")!;
    expect(within(row).getByText("12/18")).toBeTruthy();
  });

  it("opens the employees counted for a role, and who may be missing", async () => {
    const user = userEvent.setup();
    render(<RolesDirectoryView initialRoles={await listRoles()} />);
    await user.click(screen.getByRole("button", { name: /^4 employees in Lead Data Engineer/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Counted (4)")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Robert Chen" }).getAttribute("href")).toBe("/employees/emp-9042");
    expect(within(dialog).getByText("Possibly missing (2)")).toBeTruthy();
    expect(within(dialog).getByText("Victor Ikenna")).toBeTruthy();
    expect(push).not.toHaveBeenCalled(); // the click does not also open the role
  });

  it("is unchanged for HR / L&D", async () => {
    currentUser = getMockUser("user-priya");
    render(<RolesDirectoryView initialRoles={await listRoles()} />);
    expect(screen.queryByRole("columnheader", { name: "Skill Profile Coverage" })).toBeNull();
    expect(screen.queryByRole("button", { name: /employees in Lead Data Engineer/ })).toBeNull();
  });
});

describe("Role details", () => {
  it("shows who the role reports to and other structural details", async () => {
    const role = (await getRole("role-ssa"))!;
    render(<RoleDetailView role={role} />);
    const card = screen.getByRole("region", { name: "Role Details" });
    expect(within(card).getByText("Reports To")).toBeTruthy();
    expect(within(card).getByText("Head of Architecture")).toBeTruthy();
    expect(within(card).getByText("18 of 18 required skills approved")).toBeTruthy();
  });

  it("is unchanged for HR / L&D", async () => {
    currentUser = getMockUser("user-priya");
    render(<RoleDetailView role={(await getRole("role-ssa"))!} />);
    expect(screen.queryByRole("region", { name: "Role Details" })).toBeNull();
  });
});

describe("About BCMS", () => {
  it("is in the Organisation Admin sidebar and only there", () => {
    const find = (portal: Parameters<typeof getNavigationConfig>[0]) =>
      getNavigationConfig(portal)
        .sections.flatMap((s) => s.items)
        .find((i) => i.label === "About BCMS");
    expect(find("organisation_admin")?.href).toBe("/about");
    expect(find("hr_ld_admin")).toBeUndefined();
    expect(find("line_manager")).toBeUndefined();
  });

  it("describes the platform and links the lifecycle steps", () => {
    render(<AboutBcmsView />);
    expect(screen.getByRole("heading", { level: 1, name: "About BCMS" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Upload organisational information/ }).getAttribute("href")).toBe("/org");
    expect(screen.getByText("AI that assists, people who decide")).toBeTruthy();
  });
});
