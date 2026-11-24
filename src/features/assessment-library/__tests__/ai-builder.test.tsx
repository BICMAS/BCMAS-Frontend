import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { mockClient, renderWithAi } from "@/features/ai/testing";
import { listRoleRecords } from "@/features/roles/services/mock-roles";

import { AiBuilderView } from "../components/ai-builder-view";
import {
  candidatesFromDesign,
  findDuplicates,
  recommendTemplates,
  roleCompetencies,
  similarity,
} from "../services/ai-builder";
import { listPublishedMasters, resetLibrary } from "../services/central-library";
import { createOrgAssessment, getOrgAssessment, resetOrgLibrary } from "../services/org-library";
import { currentVersion, openVersion } from "../services/versioning";

// BCMS Talent Assessment guide, step 3: AI Assessment Builder.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/talent/library",
  useSearchParams: () => new URLSearchParams(),
}));

const session = vi.hoisted(() => ({ userId: "user-priya", organisationId: "org-gec" }));
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
const HRBP = getMockUser("user-priya").name;
const ssa = listRoleRecords().find((r) => r.id === "role-ssa")!;
const profile = roleCompetencies(ssa);

function newDraft() {
  return createOrgAssessment(
    GEC,
    {
      name: "Solutions Architect – Lagos",
      purpose: "Architecture hiring.",
      assessmentType: "technical_competency",
      roleFamily: "Technology",
      targetProficiency: "Advanced",
      competencies: ["Cloud Infrastructure Design"],
      durationMinutes: 30,
    },
    "Senior Solutions Architect",
    HRBP,
  );
}

beforeEach(() => {
  push.mockReset();
  resetLibrary();
  resetOrgLibrary();
  session.userId = "user-priya";
});

describe("Builder logic", () => {
  it("maps an AI design to draft items with model, date and source, and flags competencies outside the role profile", async () => {
    const envelope = await mockClient("user-priya").designAssessment({ role_id: "role-ssa", questions_per_competency: 2 });
    const candidates = candidatesFromDesign(envelope, profile);
    expect(candidates).toHaveLength(8); // 4 framework competencies × 2

    const cloud = candidates.find((c) => c.item.competency === "Cloud Infrastructure Design" && c.item.responseType === "sjt")!;
    expect(cloud.include).toBe(true);
    expect(cloud.item.origin).toMatchObject({ kind: "ai", model: "mock-model", draftId: envelope.draft.draft_id });
    expect(cloud.item.origin?.source).toMatch(/Cloud Infrastructure Design level 4 criteria .*role profile v3/);
    expect(cloud.item.scoring.correctOptionId).toBe("b"); // highest-scored option is the key

    const api = candidates.filter((c) => c.item.competency === "API Governance");
    expect(api.every((c) => c.outsideProfile && !c.include)).toBe(true); // not in this role profile
  });

  it("recommends templates that cover the role's competencies, with a reason", () => {
    const recs = recommendTemplates(listPublishedMasters(), profile);
    expect(recs[0]?.templateId).toBe("tpl-solutions-architect");
    expect(recs[0]?.reason).toMatch(/Covers 2 of 8 role competencies \(Cloud Infrastructure Design, Microservices Design\)/);
    expect(recs.some((r) => r.templateId === "tpl-sales-core")).toBe(false);
  });

  it("flags likely duplicate questions", () => {
    expect(similarity("Two teams keep breaking each other's releases", "Two teams keep breaking releases")).toBeGreaterThan(0.6);
    const master = listPublishedMasters().find((m) => m.templateId === "tpl-solutions-architect")!;
    const copy = { key: "k1", item: { ...master.version.items[1]!, id: "x" }, outsideProfile: false, skillId: null, sourceTexts: [], include: true };
    expect(findDuplicates([copy], master.version.items).get("k1")).toMatch(/Q02/);
  });
});

describe("AI Assessment Builder screen", () => {
  it("generates AI drafts, lets HR review them, and saves them as drafts with their source", async () => {
    const user = userEvent.setup();
    const id = newDraft();
    renderWithAi(<AiBuilderView assessmentId={id} />, mockClient("user-priya"));

    expect(await screen.findByRole("heading", { name: "AI Assessment Builder" })).toBeTruthy();
    expect(screen.getAllByText("Senior Solutions Architect").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("tab", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Generate Draft Items" }));
    const list = await screen.findByRole("list", { name: "Draft items" });
    expect(within(list).getAllByText("AI draft").length).toBe(8);
    expect(within(list).getAllByText(/is not in the selected role profile/).length).toBe(4);

    await user.click(screen.getByRole("button", { name: "Check Coverage" }));
    expect(screen.getByRole("region", { name: "Coverage check" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save Draft (4)" }));
    await waitFor(() => expect(openVersion(getOrgAssessment(GEC, id)!)?.items).toHaveLength(4));
    const saved = currentVersion(getOrgAssessment(GEC, id)!);
    expect(saved.status).toBe("draft"); // AI never approves
    expect(saved.items.every((item) => item.origin?.kind === "ai" && item.origin.model === "mock-model")).toBe(true);
    expect(saved.items.map((i) => i.id)).toEqual(["q01", "q02", "q03", "q04"]);
    expect(saved.history.at(-1)?.note).toMatch(/4 AI-drafted by mock-model; still drafts until approved/);
  });

  it("adds questions from a recommended template", async () => {
    const user = userEvent.setup();
    const id = newDraft();
    renderWithAi(<AiBuilderView assessmentId={id} />, mockClient("user-priya"));
    await user.click(await screen.findByRole("tab", { name: "Template" }));
    await user.click(screen.getByRole("button", { name: "Recommend Templates" }));
    const recs = screen.getByRole("list", { name: "Recommended templates" });
    expect(within(recs).getByText("Best match")).toBeTruthy();
    await user.click(within(recs).getAllByRole("button", { name: "Add matching questions" })[0]!);
    const list = await screen.findByRole("list", { name: "Draft items" });
    expect(within(list).getAllByText("Template · draft")).toHaveLength(2);
  });

  it("regenerates a single draft item", async () => {
    const user = userEvent.setup();
    const id = newDraft();
    const client = mockClient("user-priya");
    const design = vi.spyOn(client, "designAssessment");
    renderWithAi(<AiBuilderView assessmentId={id} />, client);
    await user.click(await screen.findByRole("tab", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Generate Draft Items" }));
    await screen.findByRole("list", { name: "Draft items" });
    await user.click(screen.getAllByRole("button", { name: /^Regenerate / })[0]!);
    await waitFor(() => expect(design).toHaveBeenCalledTimes(2));
    expect(design.mock.calls[1]![0]).toMatchObject({ role_id: "role-ssa", skill_ids: ["skl-cloud"], questions_per_competency: 1 });
  });

  it("shows the AI service's error when the role has no framework profile", async () => {
    const user = userEvent.setup();
    const id = newDraft();
    renderWithAi(<AiBuilderView assessmentId={id} />, mockClient("user-priya"));
    await user.selectOptions(await screen.findByLabelText("Approved role profile"), "role-fc");
    await user.click(screen.getByRole("tab", { name: "Generate" }));
    await user.click(screen.getByRole("button", { name: "Generate Draft Items" }));
    expect(await screen.findByText(/no framework role profile for this role/)).toBeTruthy();
  });

  it("will not add items to an approved version", async () => {
    renderWithAi(<AiBuilderView assessmentId="oa-sales-custom" />, mockClient("user-priya"));
    expect(await screen.findByRole("button", { name: "Start a new draft version" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Generate" })).toBeNull();
  });
});
