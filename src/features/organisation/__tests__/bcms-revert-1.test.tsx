import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { BulkMappingView } from "@/features/employees/components/bulk-mapping-view";
import { MappingWorkspaceView } from "@/features/employees/components/mapping-workspace-view";
import { useMappingApprovals } from "@/features/employees/services/mapping-approvals";
import {
  listBulkMappingRows,
  listMappingRoles,
  listMappingWorkspaces,
} from "@/features/employees/services/mock-mapping";
import { listEmployees } from "@/features/employees/services/mock-employees";
import { buildSchedule } from "@/features/ld/assessment-schedule";
import { AssessmentFrequencyPanel } from "@/features/ld/components/assessment-frequency-panel";
import { LearningCatalogueView } from "@/features/ld/components/learning-catalogue-view";
import { TrainingPlanView } from "@/features/ld/components/training-plan-view";
import { TRAINING_PLAN_COLUMNS } from "@/features/ld/training-plan-data";
import { RolesDirectoryView } from "@/features/roles/components/roles-directory-view";
import { listRoles } from "@/features/roles/services/mock-roles";
import { FrameworkSettingsView } from "@/features/skills/components/framework-settings-view";
import { SkillsLibraryView } from "@/features/skills/components/skills-library-view";
import { defaultFrameworkLevels } from "@/features/skills/data/mock-skills";
import { listSkills } from "@/features/skills/services/mock-skills";
import { parseCsv, readSpreadsheetRows } from "@/lib/spreadsheet";
import type { MockUser } from "@/types/user";

// BCMS Revert 1 (HR Admin journey).

const push = vi.fn();
let currentUser: MockUser | null = getMockUser("user-sarah");
const downloads: { filename: string; columns: { header: string }[]; rows: unknown[] }[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("employee=emp-8721"),
}));
vi.mock("@/features/talent/use-hydrated-user", () => ({ useHydratedUser: () => currentUser }));
vi.mock("@/lib/spreadsheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/spreadsheet")>();
  return {
    ...actual,
    downloadWorkbook: vi.fn(async (args: (typeof downloads)[number]) => {
      downloads.push(args);
    }),
  };
});

beforeEach(() => {
  push.mockReset();
  downloads.length = 0;
  currentUser = getMockUser("user-sarah"); // HR Admin
  useMappingApprovals.setState({ changes: [] });
});

describe("Roles Directory status meanings", () => {
  it("explains each status on hover/focus and lists them all", async () => {
    render(<RolesDirectoryView initialRoles={await listRoles()} />);
    expect(screen.getAllByLabelText("Draft: Role profile is being created").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Status meanings" })).toBeTruthy();
    expect(screen.getByText(/skills and competencies required for effective performance/)).toBeTruthy();
  });
});

describe("Framework Settings", () => {
  it("ships the reviewed five-level default scale", () => {
    expect(defaultFrameworkLevels.map((l) => [l.label, l.headline, l.tag])).toEqual([
      ["Awareness", "Understands the basics", "Foundation"],
      ["Developing", "Applies with supervision", "Developing"],
      ["Proficient", "Works independently", "Independent"],
      ["Advanced", "Handles complexity and guides others", "Advanced"],
      ["Expert", "Sets standards and leads expertise", "Expert"],
    ]);
    render(<FrameworkSettingsView initialLevels={defaultFrameworkLevels} />);
    expect(screen.getByDisplayValue("Works independently")).toBeTruthy();
    expect(screen.getByText(/Define the proficiency levels used to measure/)).toBeTruthy();
  });
});

describe("Skills Library", () => {
  it("shows summary indicators that filter, proficiency levels and employees requiring", async () => {
    const user = userEvent.setup();
    render(<SkillsLibraryView initialSkills={await listSkills()} />);
    expect(screen.getByRole("columnheader", { name: "Proficiency Level" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Employees Requiring" })).toBeTruthy();
    expect(screen.getByText(/BCMS has identified 3 skills that may overlap/)).toBeTruthy();
    const row = screen.getByRole("link", { name: "Cloud Infrastructure Design" }).closest("tr")!;
    expect(within(row).getByText("Level 3–5")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^Draft Skills: 1/ }));
    expect(screen.getByRole("link", { name: "Regulatory Knowledge" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Cloud Infrastructure Design" })).toBeNull();
  });
});

describe("Bulk Mapping: changes need a second administrator", () => {
  async function renderBulk() {
    const [rows, roles] = await Promise.all([listBulkMappingRows(), listMappingRoles()]);
    return render(<BulkMappingView initialRows={rows} roles={roles} />);
  }

  it("renames the actions and explains how to remove a leaver", async () => {
    await renderBulk();
    expect(screen.getByRole("button", { name: "Bulk Upload" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add New Employee" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Auto-Map|Finalise All/ })).toBeNull();
    expect(screen.getByText(/Employee has left the organisation\?/)).toBeTruthy();
  });

  it("a removal waits for approval, the submitter cannot approve, another admin can", async () => {
    const user = userEvent.setup();
    const view = await renderBulk();
    await user.click(screen.getByRole("button", { name: "Remove Tom Nguyen from the organisation" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Reason"), "Resigned");
    await user.type(within(dialog).getByLabelText("Last working day"), "2026-12-31");
    await user.click(within(dialog).getByRole("button", { name: "Submit removal for approval" }));

    const panel = screen.getByRole("region", { name: /Pending approval \(1\)/ });
    expect(within(panel).getByText(/You submitted this change/)).toBeTruthy();
    expect((within(panel).getByRole("button", { name: /Approve removal/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Tom Nguyen", { selector: "span.font-bold" })).toBeTruthy(); // still listed until approved

    currentUser = getMockUser("user-priya"); // HRBP
    view.rerender(<BulkMappingView initialRows={await listBulkMappingRows()} roles={await listMappingRoles()} />);
    await user.click(screen.getByRole("button", { name: /Approve removal for Tom Nguyen/ }));
    await waitFor(() => expect(screen.queryByText("Tom Nguyen", { selector: "span.font-bold" })).toBeNull());
    expect(useMappingApprovals.getState().changes[0]).toMatchObject({
      status: "approved",
      decidedBy: { name: "Priya Nair" },
    });
  });

  it("adds a new employee only after approval", async () => {
    const user = userEvent.setup();
    const view = await renderBulk();
    await user.click(screen.getByRole("button", { name: "Add New Employee" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Full name"), "Ngozi Bello");
    await user.type(within(dialog).getByLabelText("Employee ID"), "EMP-1234");
    await user.type(within(dialog).getByLabelText("Work email"), "ngozi.bello@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Submit for approval" }));
    expect(screen.queryByText("Ngozi Bello", { selector: "span.font-bold" })).toBeNull();

    currentUser = getMockUser("user-priya");
    view.rerender(<BulkMappingView initialRows={await listBulkMappingRows()} roles={await listMappingRoles()} />);
    await user.click(screen.getByRole("button", { name: /Approve new employee for Ngozi Bello/ }));
    expect(await screen.findByText("Ngozi Bello", { selector: "span.font-bold" })).toBeTruthy();
  });

  it("downloads an Excel template and validates uploaded files", async () => {
    const user = userEvent.setup();
    await renderBulk();
    await user.click(screen.getByRole("button", { name: "Bulk Upload" }));
    await user.click(await screen.findByRole("button", { name: "Download template (.xlsx)" }));
    expect(downloads[0]!.filename).toBe("bcms-employee-upload-template.xlsx");
    expect(downloads[0]!.columns.map((c) => c.header)).toContain("job_role");

    const bad = new File(["employee_id,full_name,email,department,job_role\nE1,Ann,not-an-email,IT,Astronaut\n"], "bad.csv", {
      type: "text/csv",
    });
    await user.upload(screen.getByLabelText("2. Upload the completed file"), bad);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/email "not-an-email" is not valid/);
    expect(alert.textContent).toMatch(/role "Astronaut" is not in the Roles Directory/);
    expect(useMappingApprovals.getState().changes).toHaveLength(0);
  });
});

describe("Spreadsheet helpers", () => {
  it("parses quoted CSV and keys rows by header", async () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
    const file = new File(["Employee_ID,Full_Name\nE1, Ann \n\n"], "t.csv");
    expect(await readSpreadsheetRows(file)).toEqual([{ employee_id: "E1", full_name: "Ann" }]);
  });
});

describe("Mapping Workspace", () => {
  it("compares required and assessed levels with the gap", async () => {
    const [employees, roles, workspaces] = await Promise.all([listEmployees(), listMappingRoles(), listMappingWorkspaces()]);
    render(<MappingWorkspaceView employees={employees} roles={roles} workspaces={workspaces} />);
    const table = screen.getByRole("region", { name: "Required vs Current Skills" });
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Skill", "Required Level", "Assessed Level", "Gap", "Suggested Action"]);
    const gapRow = within(table).getByText("Advanced AI Governance").closest("tr")!;
    expect(within(gapRow).getAllByRole("cell").map((c) => c.textContent)).toEqual(
      expect.arrayContaining(["4", "2", "2"]),
    );
  });
});

describe("Assessment frequency", () => {
  it("builds month-by-month windows for 1 to 4 cycles", () => {
    expect(buildSchedule(2, 2027)).toEqual([
      { cycle: 1, period: "January – June", verificationDeadline: "June 2027" },
      { cycle: 2, period: "July – December", verificationDeadline: "December 2027" },
    ]);
    expect(buildSchedule(4, 2027).map((w) => w.period)).toEqual([
      "January – March",
      "April – June",
      "July – September",
      "October – December",
    ]);
    expect(buildSchedule(3, 2027)[1]!.period).toBe("May – August");
    expect(buildSchedule(1, 2027)[0]!.verificationDeadline).toBe("December 2027");
  });

  it("lets the admin pick scope and cycles, and shows the timetable", async () => {
    const user = userEvent.setup();
    render(<AssessmentFrequencyPanel />);
    await user.selectOptions(screen.getByLabelText("Applies to"), "Human Resources");
    await user.click(screen.getByRole("radio", { name: /4\s*Quarterly/ }));
    expect(screen.getByText(/4 assessment cycles per year \(Quarterly\) · Human Resources/)).toBeTruthy();
    expect(screen.getByText("October – December")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save Assessment Configuration" }));
    expect(screen.getByText("Saved programmes")).toBeTruthy();
  });
});

describe("Learning and Development Library", () => {
  it("uses the reviewed name and tabs, without the skill-gap tab", () => {
    render(<LearningCatalogueView />);
    expect(screen.getByRole("heading", { level: 1, name: "Learning and Development Library" })).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "All Resources",
      "Internal Learning Resources",
      "Workplace Learning",
      "AI Coaching",
      "E-Learning Courses",
      "Workshop & Classroom Training",
    ]);
  });

  it("lets admins move a resource to another category, updating the skills per category", async () => {
    const user = userEvent.setup();
    render(<LearningCatalogueView />);
    await user.click(screen.getByRole("tab", { name: "Workshop & Classroom Training" }));
    expect(screen.getByText("Strategic Influence Masterclass")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Category"), "internal");
    expect(screen.queryByText("Strategic Influence Masterclass")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Internal Learning Resources" }));
    expect(screen.getByText("Strategic Influence Masterclass")).toBeTruthy();
    const skills = screen.getByRole("region", { name: "Skills by category" });
    expect(within(skills).getByText("Influence")).toBeTruthy();
  });

  it("is read-only for employees", () => {
    currentUser = getMockUser("user-james");
    render(<LearningCatalogueView />);
    expect(screen.queryByLabelText("Category")).toBeNull();
  });
});

describe("Training Plan", () => {
  it("summarises, filters and exports all 13 columns to Excel", async () => {
    const user = userEvent.setup();
    render(<TrainingPlanView />);
    expect(screen.getByRole("button", { name: /^4\s*Awaiting Allocation/ })).toBeTruthy();
    expect(TRAINING_PLAN_COLUMNS).toHaveLength(13);
    await user.selectOptions(screen.getByLabelText("Status filter"), "Overdue");
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + 1
    await user.click(screen.getByRole("button", { name: "Download Excel" }));
    await act(async () => {});
    expect(downloads[0]!.filename).toBe("bcms-training-plan.xlsx");
    expect(downloads[0]!.columns.map((c) => c.header)).toEqual(TRAINING_PLAN_COLUMNS.map((c) => c.header));
    expect(downloads[0]!.rows).toHaveLength(1); // exports what is shown
  });
});

describe("HR Admin navigation", () => {
  it("adds Training Plan and renames the learning library", () => {
    const items = getNavigationConfig("organisation_admin").sections.flatMap((s) => s.items);
    expect(items.find((i) => i.id === "training-plan")?.href).toBe("/training-plan");
    expect(items.find((i) => i.id === "learning")?.label).toBe("Learning & Development");
    const skills = items.find((i) => i.id === "skills")!.children!.map((c) => c.label);
    expect(skills).toEqual(["Framework Settings", "Skills Library"]);
  });
});
