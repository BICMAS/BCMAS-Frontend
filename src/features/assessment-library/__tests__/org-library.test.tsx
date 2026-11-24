import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";

import { BcmsTemplateView, OrgAssessmentDetailsView } from "../components/org-assessment-details-view";
import { OrgLibraryView } from "../components/org-library-view";
import { getTemplate, listPublishedMasters, publishedVersion, resetLibrary } from "../services/central-library";
import {
  copyFromMaster,
  getOrgAssessment,
  listOrgAssessments,
  orgCounts,
  resetOrgLibrary,
  saveOrgItem,
  submitForApproval,
  updateOrgDraft,
  withdrawFromReview,
} from "../services/org-library";
import { LibraryError, currentVersion, openVersion } from "../services/versioning";

// BCMS Talent Assessment guide, step 2: Organisation Assessment Library (HRBP).

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/talent/library",
  useSearchParams: () => new URLSearchParams(),
}));

const session = vi.hoisted(() => ({ userId: "user-priya", organisationId: "org-gec" }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user } = await import("@/config/mock-users");
  const useSessionStore = Object.assign(
    <T,>(selector: (state: { user: ReturnType<typeof user>; organisationId: string }) => T) =>
      selector({ user: user(session.userId), organisationId: session.organisationId }),
    { persist: { onFinishHydration: () => () => {}, hasHydrated: () => true } },
  );
  return { useSessionStore };
});

const HRBP = getMockUser("user-priya").name;
const GEC = "org-gec";
const THS = "org-ths";

beforeEach(() => {
  push.mockReset();
  resetLibrary();
  resetOrgLibrary();
  session.userId = "user-priya";
  session.organisationId = GEC;
});

describe("Organisation library rules", () => {
  it("copies a published master into a separate record and never changes the master", () => {
    const masterBefore = structuredClone(getTemplate("tpl-sales-core"));
    const id = copyFromMaster(GEC, "tpl-sales-core", { name: "Sales Exec – Lagos", linkedRole: "Sales Executive" }, HRBP);

    const copy = getOrgAssessment(GEC, id)!;
    expect(copy.id).not.toBe("tpl-sales-core");
    expect(copy.organisationId).toBe(GEC);
    expect(copy.source).toEqual({ templateId: "tpl-sales-core", templateName: "Sales Executive – Core", version: "1.2" });
    expect(currentVersion(copy)).toMatchObject({ version: "0.1", status: "draft", name: "Sales Exec – Lagos" });
    expect(currentVersion(copy).history[0]?.note).toBe("Copied from BCMS master Sales Executive – Core v1.2");

    const draft = openVersion(copy)!;
    updateOrgDraft(GEC, id, { ...draft, durationMinutes: 20 }, "Sales Executive", HRBP);
    saveOrgItem(GEC, id, { ...draft.items[0]!, text: "Changed for Lagos outlets" }, HRBP);
    expect(getTemplate("tpl-sales-core")).toEqual(masterBefore);
  });

  it("only offers published masters, and refuses to copy anything else", () => {
    const ids = listPublishedMasters().map((m) => m.templateId);
    expect(ids).toEqual(expect.arrayContaining(["tpl-sales-core", "tpl-service-core", "tpl-finance-core", "tpl-kam-case"]));
    expect(ids).not.toContain("tpl-ops-supervisor"); // draft only
    expect(ids).not.toContain("tpl-field-legacy"); // retired
    expect(() => copyFromMaster(GEC, "tpl-field-legacy", { name: "x", linkedRole: null }, HRBP)).toThrow(LibraryError);
    // Finance has v1.2 in review: organisations still get the published v1.1.
    expect(listPublishedMasters().find((m) => m.templateId === "tpl-finance-core")?.version.version).toBe(
      publishedVersion(getTemplate("tpl-finance-core")!)!.version,
    );
  });

  it("keeps each organisation's assessments separate", () => {
    expect(listOrgAssessments(GEC).map((a) => a.name)).not.toContain("Patient Services – Custom");
    expect(listOrgAssessments(THS).map((a) => a.name)).toEqual(["Patient Services – Custom"]);
    expect(getOrgAssessment(THS, "oa-sales-custom")).toBeNull();
    expect(() => submitForApproval(THS, "oa-kam", HRBP)).toThrow(/not found in your organisation/);
  });

  it("counts drafts, reviews and approved assessments", () => {
    expect(orgCounts(GEC)).toEqual({ all: 4, drafts: 1, inReview: 1, approved: 3, retired: 0 });
  });

  it("lets only the submitter withdraw a version from review", () => {
    expect(() => withdrawFromReview(GEC, "oa-service-custom", HRBP)).toThrow(/Only the person who submitted/);
    withdrawFromReview(GEC, "oa-service-custom", "Tunde Bakare");
    expect(openVersion(getOrgAssessment(GEC, "oa-service-custom")!)?.status).toBe("draft");
  });
});

describe("Organisation Assessment Library screen", () => {
  it("is the HRBP's Assessment Library", () => {
    const talent = getNavigationConfig("hr_ld_admin")
      .sections.flatMap((s) => s.items)
      .find((i) => i.href === "/talent");
    expect(talent?.children?.find((c) => c.href === "/talent/library")?.label).toBe("Assessment Library");
  });

  it("shows the organisation's assessments by lifecycle", async () => {
    const user = userEvent.setup();
    render(<OrgLibraryView />);
    expect(screen.getByText("Sales Executive – Custom")).toBeTruthy();
    expect(screen.getAllByText("Organisation created").length).toBe(2); // Key Account Manager + interview set
    expect(screen.queryByText("Patient Services – Custom")).toBeNull(); // another organisation

    await user.click(screen.getByRole("tab", { name: "In Review" }));
    expect(screen.getByText("Customer Service – Custom")).toBeTruthy();
    expect(screen.queryByText("Key Account Manager")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Drafts" }));
    expect(screen.getAllByText("Key Account Manager").length).toBeGreaterThan(0); // name and linked role
    expect(screen.queryByText("Sales Executive – Custom")).toBeNull();
  });

  it("browses published BCMS templates and uses one to create a copy", async () => {
    const user = userEvent.setup();
    render(<OrgLibraryView />);
    await user.click(screen.getByRole("button", { name: "Browse BCMS Library" }));
    expect(screen.getByText("Finance Analyst – Core")).toBeTruthy();
    expect(screen.queryByText("Operations Supervisor")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Use template Finance Analyst – Core" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByDisplayValue("Finance Analyst – Custom")).toBeTruthy();
    await user.type(within(dialog).getByLabelText(/Linked role/), "Financial Controller");
    await user.click(within(dialog).getByRole("button", { name: "Create organisation copy" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/talent\/library\/oa-/)));
    const copy = listOrgAssessments(GEC).find((a) => a.name === "Finance Analyst – Custom");
    expect(copy).toMatchObject({ linkedRole: "Financial Controller", hasDraft: true, source: { version: "1.1" } });
  });

  it("creates an assessment from scratch", async () => {
    const user = userEvent.setup();
    render(<OrgLibraryView />);
    await user.click(screen.getByRole("button", { name: "Create Assessment" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Template name"), "Merchandiser");
    await user.type(within(dialog).getByLabelText("Purpose"), "In-store merchandising judgement.");
    await user.type(within(dialog).getByLabelText(/Target competencies/), "Planning");
    await user.click(within(dialog).getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(listOrgAssessments(GEC).find((a) => a.name === "Merchandiser")?.source).toBeNull());
  });

  it("is only for HRBPs", () => {
    session.userId = "user-james";
    render(<OrgLibraryView />);
    expect(screen.getByText(/organisation assessment library is for HRBPs/)).toBeTruthy();
  });
});

describe("Organisation assessment details", () => {
  it("customises a copy and submits it for approval", async () => {
    const user = userEvent.setup();
    const id = copyFromMaster(GEC, "tpl-service-core", { name: "Service – Abuja", linkedRole: null }, HRBP);
    render(<OrgAssessmentDetailsView assessmentId={id} />);
    expect(screen.getByRole("link", { name: "Customer Service – Core v1.0" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Submit for Approval" }));
    await waitFor(() => expect(openVersion(getOrgAssessment(GEC, id)!)?.status).toBe("in_review"));
    expect(screen.getByText(/waiting for approval by an authorised approver/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Withdraw from Review" }));
    await waitFor(() => expect(openVersion(getOrgAssessment(GEC, id)!)?.status).toBe("draft"));
  });

  it("starts a new version of an approved assessment and keeps the approved one in use", async () => {
    const user = userEvent.setup();
    render(<OrgAssessmentDetailsView assessmentId="oa-sales-custom" />);
    await user.click(screen.getByRole("button", { name: "Customise (new version)" }));
    await waitFor(() => expect(openVersion(getOrgAssessment(GEC, "oa-sales-custom")!)?.version).toBe("1.1"));
    expect(screen.getByText("In use: v1.0")).toBeTruthy();
  });

  it("does not show another organisation's assessment", () => {
    session.organisationId = THS;
    render(<OrgAssessmentDetailsView assessmentId="oa-sales-custom" />);
    expect(screen.getByText(/not in your organisation's library/)).toBeTruthy();
  });

  it("shows a BCMS master read-only, without its answer keys", async () => {
    const user = userEvent.setup();
    render(<BcmsTemplateView templateId="tpl-sales-core" />);
    expect(screen.getByText("Read-only")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Scoring" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Items" }));
    expect(screen.getByText(/Answer keys and rubrics come with your organisation copy/)).toBeTruthy();
  });

  it("refuses to show an unpublished master to organisations", () => {
    render(<BcmsTemplateView templateId="tpl-ops-supervisor" />);
    expect(screen.getByText(/not published/)).toBeTruthy();
  });
});
