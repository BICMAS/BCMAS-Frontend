import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { resetOrgLibrary } from "@/features/assessment-library/services/org-library";

import { VacancyApprovalView, VacancyApprovalsView } from "../components/hiring-manager-views";
import { PublicApplicationView } from "../components/public-application-view";
import { VacancyListView } from "../components/vacancy-list-view";
import { NewVacancyView, VacancyView } from "../components/vacancy-view";
import {
  RecruitmentError,
  approveVacancy,
  assessmentOptions,
  createVacancy,
  emptyDetails,
  getPublicVacancy,
  getVacancy,
  listApplications,
  listOutbox,
  pauseVacancy,
  publishVacancy,
  resetRecruitment,
  sendForApproval,
  submitApplication,
  updateVacancy,
  type ApplicationInput,
} from "../services/vacancies";

// BCMS Talent Assessment guide, step 5: vacancies, Hiring Manager approval and public application.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/talent/vacancies",
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
const MICHAEL = { userId: "user-michael", name: getMockUser("user-michael").name };
const SALES_LINK = "gec-sales-executive-7k2p";

const validInput = (overrides: Partial<ApplicationInput> = {}): ApplicationInput => ({
  fullName: "Dami Bello",
  email: "dami.bello@example.com",
  confirmEmail: "dami.bello@example.com",
  phone: "",
  cv: { fileName: "Dami_CV.pdf", sizeBytes: 120_000, mimeType: "application/pdf" },
  consent: true,
  ...overrides,
});

function readyDetails() {
  return {
    ...emptyDetails(),
    title: "Merchandiser",
    department: "Commercial",
    location: "Kano",
    summary: "Keep shelves compliant and stocked across modern-trade stores.",
    roleId: "role-sales-exec",
    assessment: assessmentOptions(GEC).find((a) => a.assessmentId === "oa-sales-custom")!,
    hiringManager: MICHAEL,
  };
}

beforeEach(() => {
  push.mockReset();
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
  session.userId = "user-priya";
  session.organisationId = GEC;
});

describe("Vacancy rules", () => {
  it("runs draft → approval → publish → application, keeping the approved snapshot", () => {
    const id = createVacancy(GEC, { ...readyDetails(), roleId: null }, HRBP);
    expect(() => sendForApproval(GEC, id, HRBP)).toThrow(/approved BCMS role profile/);
    updateVacancy(GEC, id, readyDetails(), HRBP);
    expect(() => publishVacancy(GEC, id, HRBP)).toThrow(/approved by the Hiring Manager/);
    sendForApproval(GEC, id, HRBP);

    expect(() => approveVacancy(GEC, id, { userId: "user-priya", name: HRBP })).toThrow(/Only the vacancy's Hiring Manager/);
    approveVacancy(GEC, id, MICHAEL);
    expect(getVacancy(GEC, id)!.approvals[0]).toMatchObject({
      version: 1,
      assessment: 70,
      interview: null,
      approvedBy: MICHAEL.name,
      assessmentRef: { assessmentId: "oa-sales-custom", version: "1.0" },
    });

    const token = publishVacancy(GEC, id, HRBP);
    expect(getPublicVacancy(token)).toMatchObject({ title: "Merchandiser", organisationName: "Global Enterprise Corp", closedReason: null });
    const { reference, applicationId } = submitApplication(token, validInput());
    const app = listApplications(GEC, id).find((a) => a.id === applicationId)!;
    expect(reference).toMatch(/^GEC-M-\d{4}-0001$/);
    expect(app).toMatchObject({ email: "dami.bello@example.com", thresholdVersion: 1, stage: "new_application", possibleDuplicateOf: null });
    expect(listOutbox(GEC, id)[0]).toMatchObject({ to: "dami.bello@example.com", subject: expect.stringContaining(reference) });
  });

  it("sends an approved vacancy back to Draft when it is edited", () => {
    approveVacancy(GEC, "vac-kam", MICHAEL);
    const v = getVacancy(GEC, "vac-kam")!;
    expect(v.status).toBe("approved");
    updateVacancy(GEC, "vac-kam", { ...v, stages: { ...v.stages, assessment: { enabled: true, threshold: 60 } } }, HRBP);
    const after = getVacancy(GEC, "vac-kam")!;
    expect(after.status).toBe("draft");
    expect(after.history.at(-1)?.note).toMatch(/approval again/);
    expect(() => publishVacancy(GEC, "vac-kam", HRBP)).toThrow(/approved by the Hiring Manager/);
  });

  it("only offers approved, active assessment versions", () => {
    const ids = assessmentOptions(GEC).map((a) => `${a.assessmentId}@${a.version}`);
    expect(ids).toContain("oa-sales-custom@1.0");
    expect(ids.some((id) => id.startsWith("oa-kam"))).toBe(false); // draft only
  });

  it("refuses invalid status changes", () => {
    expect(() => pauseVacancy(GEC, "vac-kam", HRBP)).toThrow(RecruitmentError);
    expect(() => publishVacancy(GEC, "vac-kam", HRBP)).toThrow(/approved by the Hiring Manager/);
  });

  it("validates applications and flags a repeat email as a possible duplicate", () => {
    expect(() => submitApplication(SALES_LINK, validInput({ confirmEmail: "other@example.com" }))).toThrow(/do not match/);
    expect(() => submitApplication(SALES_LINK, validInput({ cv: { fileName: "cv.exe", sizeBytes: 10, mimeType: "" } }))).toThrow(/PDF or DOCX/);
    expect(() => submitApplication(SALES_LINK, validInput({ cv: { fileName: "cv.pdf", sizeBytes: 6 * 1024 * 1024, mimeType: "" } }))).toThrow(/5 MB/);
    expect(() => submitApplication(SALES_LINK, validInput({ consent: false }))).toThrow(/must agree/);
    const { applicationId } = submitApplication(SALES_LINK, validInput({ email: "Adaeze.Okonkwo@example.com", confirmEmail: "adaeze.okonkwo@example.com" }));
    expect(listApplications(GEC).find((a) => a.id === applicationId)?.possibleDuplicateOf).toBe("app-se-1");
  });

  it("stops applications when a vacancy is paused, and never exposes thresholds publicly", () => {
    pauseVacancy(GEC, "vac-sales-exec", HRBP);
    expect(getPublicVacancy(SALES_LINK)?.closedReason).toMatch(/paused/);
    expect(() => submitApplication(SALES_LINK, validInput())).toThrow(/paused/);
    const publicView = getPublicVacancy(SALES_LINK)!;
    expect(Object.keys(publicView)).not.toEqual(expect.arrayContaining(["stages"]));
    expect(JSON.stringify(publicView)).not.toMatch(/threshold|approvals|oa-sales-custom|hiringManager/);
  });
});

describe("Vacancy Management screens", () => {
  it("are the HRBP's Vacancies menu, and the Hiring Manager's Vacancy Approvals", () => {
    const hr = getNavigationConfig("hr_ld_admin").sections.flatMap((s) => s.items).find((i) => i.href === "/talent");
    expect(hr?.children?.map((c) => c.label)).toContain("Vacancies");
    expect(hr?.children?.some((c) => c.href.startsWith("/talent/recruitment"))).toBe(false);
    const lm = getNavigationConfig("line_manager").sections.flatMap((s) => s.items).map((i) => i.href);
    expect(lm).toContain("/manager/vacancies");
  });

  it("lists vacancies with counts and status tabs", async () => {
    const user = userEvent.setup();
    render(<VacancyListView />);
    expect(screen.getByText("Sales Executive")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Pending Approval" }));
    expect(screen.getByText("Key Account Manager")).toBeTruthy();
    expect(screen.queryByText("Sales Executive")).toBeNull();
  });

  it("creates a vacancy as a draft", async () => {
    const user = userEvent.setup();
    render(<NewVacancyView />);
    await user.type(screen.getByLabelText("Vacancy title"), "Route Planner");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/talent\/vacancies\/vac-/)));
  });

  it("shows a published vacancy's link and applicants", async () => {
    const user = userEvent.setup();
    render(<VacancyView vacancyId="vac-sales-exec" />);
    expect(screen.getByRole("button", { name: "Copy Link" })).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Candidate Link" }));
    expect(screen.getByLabelText("Application link").textContent).toMatch(/\/apply\/gec-sales-executive-7k2p$/);
    await user.click(screen.getByRole("tab", { name: /Applicants/ }));
    expect(within(screen.getByRole("table", { name: "Applicants" })).getByText("Adaeze Okonkwo")).toBeTruthy();
  });

  it("lets HR send a ready draft for approval", async () => {
    const user = userEvent.setup();
    updateVacancy(GEC, "vac-ops-supervisor", { ...readyDetails(), title: "Operations Supervisor" }, HRBP);
    render(<VacancyView vacancyId="vac-ops-supervisor" />);
    await user.click(screen.getByRole("button", { name: "Send for Approval" }));
    await waitFor(() => expect(getVacancy(GEC, "vac-ops-supervisor")?.status).toBe("pending_approval"));
  });
});

describe("Hiring Manager approval", () => {
  it("shows the Line Manager what is waiting and approves it", async () => {
    session.userId = "user-michael";
    render(<VacancyApprovalsView />);
    expect(screen.getByText("Key Account Manager")).toBeTruthy();
    expect(screen.getByText("Assessment 75%")).toBeTruthy();
  });

  it("approves the thresholds from the vacancy page", async () => {
    session.userId = "user-michael";
    const user = userEvent.setup();
    render(<VacancyApprovalView vacancyId="vac-kam" />);
    expect(screen.getByText(/pass at 75%/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(getVacancy(GEC, "vac-kam")?.status).toBe("approved"));
    expect(getVacancy(GEC, "vac-kam")?.approvals[0]?.approvedBy).toBe(MICHAEL.name);
  });

  it("returns a vacancy to HR with a comment", async () => {
    session.userId = "user-michael";
    const user = userEvent.setup();
    render(<VacancyApprovalView vacancyId="vac-kam" />);
    await user.click(screen.getByRole("button", { name: "Return for Changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/What needs to change/), "Raise the pass mark to 80%");
    await user.click(within(dialog).getByRole("button", { name: "Return to HR" }));
    await waitFor(() => expect(getVacancy(GEC, "vac-kam")?.status).toBe("draft"));
    expect(getVacancy(GEC, "vac-kam")?.history.at(-1)?.note).toBe("Raise the pass mark to 80%");
  });
});

describe("Public application page", () => {
  it("lets a candidate apply without logging in and shows their reference", async () => {
    const user = userEvent.setup();
    const { container } = render(<PublicApplicationView token={SALES_LINK} />);
    expect(screen.getByRole("heading", { name: "Sales Executive" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Apply Now" }));

    await user.click(screen.getByRole("button", { name: "Submit Application" }));
    expect(screen.getByText("Enter your full name.")).toBeTruthy();
    expect(screen.getByText(/Upload your CV/)).toBeTruthy();

    await user.type(screen.getByLabelText(/^Full name/), "Dami Bello");
    await user.type(screen.getByLabelText(/^Email/), "dami.bello@example.com");
    await user.type(screen.getByLabelText(/^Confirm email/), "dami.bello@example.com");
    const file = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(file, new File(["cv"], "Dami_CV.pdf", { type: "application/pdf" }));
    expect(screen.getByText("Dami_CV.pdf")).toBeTruthy();
    await user.click(screen.getByLabelText("I agree to the privacy and consent statement"));
    await user.click(screen.getByRole("button", { name: "Submit Application" }));

    expect(await screen.findByText("Application submitted")).toBeTruthy();
    expect(screen.getByText(/GEC-SE-\d{4}-0004/)).toBeTruthy();
    expect(listApplications(GEC, "vac-sales-exec")).toHaveLength(4);
  });

  it("tells candidates when a link is not valid or not open", () => {
    render(<PublicApplicationView token="not-a-real-link" />);
    expect(screen.getByText("Application link not found")).toBeTruthy();
  });
});
