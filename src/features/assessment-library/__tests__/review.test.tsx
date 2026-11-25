import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";

import { ApprovalsView } from "../components/approvals-view";
import { OrgAssessmentDetailsView } from "../components/org-assessment-details-view";
import { ReviewView } from "../components/review-view";
import { resetLibrary } from "../services/central-library";
import {
  approveOrgVersion,
  getOrgAssessment,
  listAssignableAssessments,
  resetOrgLibrary,
  returnOrgVersion,
  reviewItem,
  saveOrgItem,
  submitForApproval,
} from "../services/org-library";
import { reviewFlags, reviewProgress } from "../services/review";
import { LibraryError, openVersion, publishedVersion } from "../services/versioning";
import type { TemplateVersion } from "../types";

// BCMS Talent Assessment guide, step 4: Assessment Review & Approval.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/talent/library",
  useSearchParams: () => new URLSearchParams(),
}));

const session = vi.hoisted(() => ({ userId: "user-sarah", organisationId: "org-gec" }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user } = await import("@/config/mock-users");
  const state = () => ({ user: user(session.userId), userId: session.userId, organisationId: session.organisationId });
  const useSessionStore = Object.assign(<T,>(selector: (s: ReturnType<typeof state>) => T) => selector(state()), {
    persist: { onFinishHydration: () => () => {}, hasHydrated: () => true },
    getState: state,
  });
  return { useSessionStore };
});

const GEC = "org-gec";
// HRBPs build and submit; only the HR Admin approves.
const APPROVER = getMockUser("user-sarah").name;
const HR = "organisation_admin" as const;
const AUTHOR = "Tunde Bakare"; // submitted the seeded Customer Service – Custom v1.1
const ID = "oa-service-custom";

const inReview = () => openVersion(getOrgAssessment(GEC, ID)!)!;

beforeEach(() => {
  push.mockReset();
  resetLibrary();
  resetOrgLibrary();
  session.userId = "user-sarah";
});

describe("Review rules", () => {
  it("needs every item approved, then publishes the version and supersedes the old one", () => {
    expect(() => approveOrgVersion(GEC, ID, APPROVER, HR)).toThrow(/3 still pending/);
    for (const item of inReview().items) reviewItem(GEC, ID, item.id, "approved", "", APPROVER, HR);
    approveOrgVersion(GEC, ID, APPROVER, HR);

    const a = getOrgAssessment(GEC, ID)!;
    expect(publishedVersion(a)).toMatchObject({ version: "1.1", reviewedBy: APPROVER });
    expect(a.versions.find((v) => v.version === "1.0")?.status).toBe("superseded");
    expect(listAssignableAssessments(GEC).find((x) => x.assessmentId === ID)?.version.version).toBe("1.1");
    expect(publishedVersion(a)!.history.filter((e) => e.action === "Item approved")).toHaveLength(3);
  });

  it("requires a comment to return or reject, and blocks approval until fixed", () => {
    const [q1] = inReview().items;
    expect(() => reviewItem(GEC, ID, q1!.id, "returned", " ", APPROVER, HR)).toThrow(/what needs to change/);
    reviewItem(GEC, ID, q1!.id, "rejected", "Policy changed in 2026", APPROVER, HR);
    for (const item of inReview().items.slice(1)) reviewItem(GEC, ID, item.id, "approved", "", APPROVER, HR);
    expect(reviewProgress(inReview())).toMatchObject({ approved: 2, rejected: 1, readyToApprove: false });
    expect(() => approveOrgVersion(GEC, ID, APPROVER, HR)).toThrow(/Return the assessment for changes/);
  });

  it("does not let the submitter review their own version", () => {
    const [q1] = inReview().items;
    expect(() => reviewItem(GEC, ID, q1!.id, "approved", "", AUTHOR, HR)).toThrow(LibraryError);
    expect(() => approveOrgVersion(GEC, ID, AUTHOR, HR)).toThrow(/Another approver/);
  });

  it("returns the version to its author with item comments, and an edited item needs a fresh review", () => {
    const [q1, q2] = inReview().items;
    reviewItem(GEC, ID, q1!.id, "returned", "Say 30 days, as in the policy", APPROVER, HR);
    reviewItem(GEC, ID, q2!.id, "approved", "", APPROVER, HR);
    returnOrgVersion(GEC, ID, APPROVER, "Fix Q01, then resubmit", HR);

    const draft = inReview();
    expect(draft.status).toBe("draft");
    expect(draft.itemReviews?.[q1!.id]).toMatchObject({ decision: "returned", comment: "Say 30 days, as in the policy" });
    saveOrgItem(GEC, ID, { ...q1!, text: "Within how many days can an unused product be returned for a full refund?" }, AUTHOR);
    expect(inReview().itemReviews?.[q1!.id]).toBeUndefined(); // edited: review again
    expect(inReview().itemReviews?.[q2!.id]?.decision).toBe("approved"); // untouched items keep their decision
  });

  it("flags missing competencies, duplicates, unclear wording and incomplete scoring", () => {
    const base = inReview();
    const v: TemplateVersion = {
      ...base,
      competencies: [...base.competencies, "Empathy"],
      items: [
        ...base.items,
        { ...base.items[0]!, id: "q04", title: "Copy" },
        { ...base.items[1]!, id: "q05", title: "Vague", text: "What next? TBD" },
        { ...base.items[2]!, id: "q06", title: "No key", scoring: { points: 1 } },
      ],
    };
    const kinds = reviewFlags(v).map((f) => `${f.kind}:${f.itemId ?? "-"}`);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "missing_competency:-",
        "duplicate:q04",
        "unclear_wording:q05",
        "incomplete_scoring:q06",
      ]),
    );
  });
});

describe("Assessment Review & Approval screen", () => {
  it("approves each item, then approves and publishes the assessment", async () => {
    const user = userEvent.setup();
    render(<ReviewView assessmentId={ID} />);
    expect(screen.getByRole("heading", { name: /Assessment Review & Approval/ })).toBeTruthy();
    expect(screen.getByText(/submitted by Tunde Bakare/)).toBeTruthy();

    const approve = screen.getByRole("button", { name: "Approve and Publish" });
    expect(approve.hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("tab", { name: "Items" }));
    const list = screen.getByRole("list", { name: "Items to review" });
    for (const id of ["Q01", "Q02", "Q03"]) {
      await user.click(within(list).getByRole("button", { name: `Approve ${id}` }));
    }
    expect(screen.getByText(/3 of 3 items approved/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Approve and Publish" }));

    await waitFor(() => expect(publishedVersion(getOrgAssessment(GEC, ID)!)?.version).toBe("1.1"));
    expect(push).toHaveBeenCalledWith("/talent/approvals");
  });

  it("returns an item with a comment that the author then sees", async () => {
    const user = userEvent.setup();
    render(<ReviewView assessmentId={ID} />);
    await user.click(screen.getByRole("tab", { name: "Items" }));
    await user.click(screen.getByRole("button", { name: "Return Q02" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/What needs to change/), "Add an option about consent");
    await user.click(within(dialog).getByRole("button", { name: "Return item" }));
    expect(await screen.findByText(/Add an option about consent/)).toBeTruthy();
    expect(screen.getByText(/Use Return for Changes so the author can fix them|still pending/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Return for Changes" }));
    const returnDialog = await screen.findByRole("dialog");
    await user.type(within(returnDialog).getByLabelText(/What needs to change/), "See Q02");
    await user.click(within(returnDialog).getByRole("button", { name: "Return to draft" }));
    await waitFor(() => expect(inReview().status).toBe("draft"));
  });

  it("shows the author's returned items on the assessment page", async () => {
    const user = userEvent.setup();
    const [q1] = inReview().items;
    reviewItem(GEC, ID, q1!.id, "returned", "Wrong refund period", APPROVER, HR);
    returnOrgVersion(GEC, ID, APPROVER, "Fix Q01", HR);
    session.userId = "user-priya";
    render(<OrgAssessmentDetailsView assessmentId={ID} />);
    await user.click(screen.getByRole("tab", { name: "Items" }));
    expect(screen.getByText(/Returned by .*Wrong refund period/)).toBeTruthy();
  });

  it("is view-only for an HRBP, who cannot approve", () => {
    const priya = getMockUser("user-priya").name;
    expect(() => reviewItem(GEC, ID, inReview().items[0]!.id, "approved", "", priya, "hr_ld_admin")).toThrow(/Only an HR Admin/);
    expect(() => approveOrgVersion(GEC, ID, priya, "hr_ld_admin")).toThrow(/Only an HR Admin/);
    expect(() => returnOrgVersion(GEC, ID, priya, "No", "hr_ld_admin")).toThrow(/Only an HR Admin/);
    session.userId = "user-priya";
    render(<ReviewView assessmentId={ID} />);
    expect(screen.getByText(/Waiting for an HR Admin/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve and Publish" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Approve Q/ })).toBeNull();
  });

  it("is view-only for an HR Admin who submitted the version", () => {
    returnOrgVersion(GEC, ID, APPROVER, "Please recheck", HR);
    submitForApproval(GEC, ID, APPROVER);
    render(<ReviewView assessmentId={ID} />);
    expect(screen.getByText(/another HR Admin must review it/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve and Publish" })).toBeNull();
  });

  it("lists assessments waiting for the HR Admin", () => {
    render(<ApprovalsView />);
    expect(screen.getByRole("link", { name: /Review/ }).getAttribute("href")).toBe(`/talent/library/${ID}/review`);
    cleanup();
    session.userId = "user-priya";
    render(<ApprovalsView />);
    expect(screen.getByText(/for the HR Admin/)).toBeTruthy();
  });

  it("says when nothing is waiting for review", () => {
    render(<ReviewView assessmentId="oa-sales-custom" />);
    expect(screen.getByText(/Nothing is waiting for review/)).toBeTruthy();
  });
});
