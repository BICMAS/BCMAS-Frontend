import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";

import { CentralLibraryView } from "../components/central-library-view";
import { TemplateDetailsView } from "../components/template-details-view";
import {
  LibraryError,
  approveAndPublish,
  candidateView,
  checkVersion,
  createTemplate,
  currentVersion,
  getTemplate,
  libraryCounts,
  openVersion,
  publishedVersion,
  resetLibrary,
  retireTemplate,
  saveItem,
  startNewVersion,
  submitForReview,
  updateDraft,
} from "../services/central-library";

// BCMS Talent Assessment guide, step 1: Central Assessment Library and Template Details.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/platform/assessment-library",
  useSearchParams: () => new URLSearchParams(),
}));

// A hydrated session without browser storage (the persisted store needs localStorage).
const session = vi.hoisted(() => ({ userId: "user-alex" }));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user } = await import("@/config/mock-users");
  const useSessionStore = Object.assign(
    <T,>(selector: (state: { user: ReturnType<typeof user> }) => T) => selector({ user: user(session.userId) }),
    { persist: { onFinishHydration: () => () => {}, hasHydrated: () => true } },
  );
  return { useSessionStore };
});

const ADMIN = getMockUser("user-alex").name;
const OTHER = "Dayo Adeyemi";

beforeEach(() => {
  push.mockReset();
  resetLibrary();
  session.userId = "user-alex";
});

describe("Central library rules", () => {
  it("keeps a published version unchanged and supersedes it on publish", () => {
    const before = publishedVersion(getTemplate("tpl-sales-core")!)!;
    startNewVersion("tpl-sales-core", ADMIN);
    let template = getTemplate("tpl-sales-core")!;
    expect(openVersion(template)?.version).toBe("1.3");
    updateDraft("tpl-sales-core", { ...openVersion(template)!, name: "Sales Executive – Core (2027)" }, ADMIN);
    template = getTemplate("tpl-sales-core")!;
    expect(publishedVersion(template)).toEqual(before); // live version untouched by the draft edit

    submitForReview("tpl-sales-core", ADMIN);
    expect(() => approveAndPublish("tpl-sales-core", ADMIN)).toThrow(LibraryError); // no self-approval
    approveAndPublish("tpl-sales-core", OTHER);
    template = getTemplate("tpl-sales-core")!;
    expect(publishedVersion(template)?.version).toBe("1.3");
    expect(template.versions.find((v) => v.version === "1.2")?.status).toBe("superseded");
  });

  it("numbers a brand-new master 1.0 when it is first published", () => {
    const id = createTemplate(
      {
        name: "Warehouse Lead",
        purpose: "Assess warehouse leadership.",
        assessmentType: "problem_solving",
        roleFamily: "Operations",
        targetProficiency: "Proficient",
        competencies: ["Planning"],
        durationMinutes: 20,
      },
      ADMIN,
    );
    expect(() => submitForReview(id, ADMIN)).toThrow(/at least one question/);
    saveItem(
      id,
      {
        id: "q01",
        title: "Picking delay",
        text: "Orders are late. What first?",
        responseType: "sjt",
        options: [
          { id: "o1", text: "Wait" },
          { id: "o2", text: "Re-plan the pick waves" },
        ],
        competency: "Planning",
        difficulty: "intermediate",
        scoring: { points: 1, correctOptionId: "o2" },
      },
      ADMIN,
    );
    submitForReview(id, ADMIN);
    approveAndPublish(id, OTHER);
    expect(publishedVersion(getTemplate(id)!)?.version).toBe("1.0");
  });

  it("blocks submission until scoring is complete and flags uncovered competencies", () => {
    const ops = currentVersion(getTemplate("tpl-ops-supervisor")!);
    const result = checkVersion(ops);
    expect(result.problems).toEqual([]);
    expect(result.warnings).toContain('No question covers "People leadership".');
    const broken = { ...ops, items: [{ ...ops.items[0]!, scoring: { points: 1 } }] };
    expect(checkVersion(broken).problems[0]).toMatch(/keyed \(correct\) answer/);
  });

  it("never includes answer keys or rubrics in the candidate view", () => {
    const view = candidateView(publishedVersion(getTemplate("tpl-sales-core")!)!);
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/correctOptionId|rubric|scoring/);
    expect(view.items).toHaveLength(5);
  });

  it("needs a reason to retire, and keeps the version history", () => {
    expect(() => retireTemplate("tpl-kam-case", ADMIN, " ")).toThrow(/reason/);
    retireTemplate("tpl-kam-case", ADMIN, "Merged into Sales Executive – Core");
    const template = getTemplate("tpl-kam-case")!;
    expect(currentVersion(template).status).toBe("retired");
    expect(currentVersion(template).history.at(-1)).toMatchObject({ action: "Retired", actor: ADMIN });
  });
});

describe("Central Assessment Library screen", () => {
  it("is in the BICMAS admin menu only", () => {
    const hrefs = (portal: Parameters<typeof getNavigationConfig>[0]) =>
      getNavigationConfig(portal).sections.flatMap((s) => s.items).map((i) => i.href);
    expect(hrefs("platform_super_admin")).toContain("/platform/assessment-library");
    expect(hrefs("hr_ld_admin")).not.toContain("/platform/assessment-library");
  });

  it("shows counts, filters templates and opens details", async () => {
    const user = userEvent.setup();
    render(<CentralLibraryView />);
    const counts = libraryCounts();
    expect(counts).toEqual({ all: 7, published: 5, draft: 2, retired: 1 });
    expect(screen.getByText("Sales Executive – Core")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Retired" }));
    expect(screen.getByText("Field Sales – Legacy")).toBeTruthy();
    expect(screen.queryByText("Sales Executive – Core")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "All Templates" }));
    await user.selectOptions(screen.getByLabelText("Role family"), "Finance");
    expect(screen.getByText("Finance Analyst – Core")).toBeTruthy();
    expect(screen.queryByText("Sales Executive – Core")).toBeNull();

    await user.click(screen.getByText("Finance Analyst – Core"));
    expect(push).toHaveBeenCalledWith("/platform/assessment-library/tpl-finance-core");
  });

  it("creates a draft master and opens it", async () => {
    const user = userEvent.setup();
    render(<CentralLibraryView />);
    await user.click(screen.getByRole("button", { name: "Create Master" }));
    await user.type(screen.getByLabelText("Template name"), "Retail Merchandiser");
    await user.type(screen.getByLabelText("Purpose"), "Assess in-store merchandising judgement.");
    await user.type(screen.getByLabelText(/Target competencies/), "Planning, Customer focus");
    await user.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/platform\/assessment-library\/tpl-/)));
    expect(libraryCounts().all).toBe(8);
  });

  it("previews the candidate experience without answer keys", async () => {
    const user = userEvent.setup();
    render(<CentralLibraryView />);
    await user.click(screen.getByRole("button", { name: "Preview Customer Service – Core" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Welcome to your assessment")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Start preview" }));
    expect(within(dialog).getByText(/Question 1 of 3/)).toBeTruthy();
    expect(within(dialog).queryByText(/Keyed answer/)).toBeNull();
  });

  it("is only available to BICMAS administrators", () => {
    session.userId = "user-priya";
    render(<CentralLibraryView />);
    expect(screen.getByText(/available to the Platform Super Admin/)).toBeTruthy();
  });
});

describe("Assessment Template Details screen", () => {
  it("approves and publishes a version another administrator submitted", async () => {
    const user = userEvent.setup();
    render(<TemplateDetailsView templateId="tpl-finance-core" />);
    expect(screen.getByRole("heading", { name: "Finance Analyst – Core" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Publish New Version" }));
    await waitFor(() => expect(publishedVersion(getTemplate("tpl-finance-core")!)?.version).toBe("1.2"));
    expect(screen.getByRole("button", { name: "Edit Master (new version)" })).toBeTruthy();
  });

  it("does not let you approve your own submission", async () => {
    const user = userEvent.setup();
    render(<TemplateDetailsView templateId="tpl-ops-supervisor" />);
    await user.click(screen.getByRole("button", { name: "Submit for Review" }));
    expect((await screen.findByRole("button", { name: "Publish New Version" })).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/another BICMAS administrator must approve/)).toBeTruthy();
  });

  it("adds a question to a draft and records it in the version history", async () => {
    const user = userEvent.setup();
    render(<TemplateDetailsView templateId="tpl-ops-supervisor" />);
    await user.click(screen.getByRole("button", { name: "Add Question" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Short title"), "Team conflict");
    await user.type(within(dialog).getByLabelText("Question text"), "Two operators disagree about a handover. What do you do?");
    await user.selectOptions(within(dialog).getByLabelText("Competency"), "People leadership");
    await user.type(within(dialog).getByLabelText("Option 1"), "Ignore it");
    await user.type(within(dialog).getByLabelText("Option 2"), "Meet both, agree a handover standard");
    await user.click(within(dialog).getByLabelText("Option 2 is the keyed answer"));
    await user.click(within(dialog).getByRole("button", { name: "Save question" }));

    await waitFor(() => expect(currentVersion(getTemplate("tpl-ops-supervisor")!).items).toHaveLength(3));
    await user.click(screen.getByRole("tab", { name: "Version History" }));
    expect(screen.getByText(/Team conflict/)).toBeTruthy();
  });

  it("starts a new draft from a published version and keeps the live version", async () => {
    const user = userEvent.setup();
    render(<TemplateDetailsView templateId="tpl-service-core" />);
    await user.click(screen.getByRole("button", { name: "Edit Master (new version)" }));
    await waitFor(() => expect(openVersion(getTemplate("tpl-service-core")!)?.version).toBe("1.1"));
    expect(screen.getByText("Live: v1.0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit for Review" })).toBeTruthy();
  });
});
