import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockUser } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { resetOrgLibrary } from "@/features/assessment-library/services/org-library";
import { mockClient, renderWithAi } from "@/features/ai/testing";

import { CandidateListView } from "../components/candidate-list-view";
import { CandidateProfileView } from "../components/candidate-profile-view";
import { PublicApplicationView } from "../components/public-application-view";
import {
  addNote,
  candidateCounts,
  completeHumanReview,
  cvSignal,
  flagExtractionIssue,
  getCandidate,
  markForHumanReview,
  replaceCvText,
  saveCvAnalysis,
} from "../services/candidates";
import { docxXmlToText, extractCvText } from "../services/cv-text";
import { listApplications, resetRecruitment } from "../services/vacancies";

// BCMS Talent Assessment guide, step 6a: candidate pipeline, profile and CV analysis.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/talent/candidates",
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

async function docx(lines: string[]) {
  const zip = new JSZip();
  const body = lines.map((l) => `<w:p><w:r><w:t>${l.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("");
  zip.file("word/document.xml", `<w:document><w:body>${body}</w:body></w:document>`);
  const data = await zip.generateAsync({ type: "arraybuffer" });
  return new File([data], "Dami_CV.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

beforeEach(() => {
  push.mockReset();
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
  session.userId = "user-priya";
  session.organisationId = GEC;
});

describe("CV text extraction", () => {
  it("reads paragraphs from a DOCX", async () => {
    expect(docxXmlToText("<w:p><w:r><w:t>Sales &amp; Marketing</w:t></w:r></w:p><w:p><w:t>2021</w:t></w:p>")).toBe(
      "Sales & Marketing\n2021",
    );
    const text = await extractCvText(
      await docx(["Dami Bello", "Sales Executive, Acme (2022 - 2026)", "I negotiated contracts with 30 key distributors every year."]),
    );
    expect(text).toContain("I negotiated contracts with 30 key distributors every year.");
  });

  it("returns null when nothing readable is found", async () => {
    expect(await extractCvText(new File(["x"], "scan.pdf", { type: "application/pdf" }))).toBeNull();
  });
});

describe("Candidate pipeline rules", () => {
  it("moves a new application to CV Analysis when the analysis is saved, without judging it", async () => {
    const result = await mockClient("user-priya").analyzeCv({
      role_title: "Sales Executive",
      requirements: [
        { skill_name: "Negotiation", category: "technical", target_level: "Proficient" },
        { skill_name: "Data analysis", category: "technical", target_level: null },
      ],
      cv_text: getCandidate(GEC, "app-se-1")!.cvText!,
    });
    saveCvAnalysis(GEC, "app-se-1", result, HRBP);
    const c = getCandidate(GEC, "app-se-1")!;
    expect(c.stage).toBe("cv_analysis");
    expect(c.cvAnalysis?.result.skills.map((s) => s.status)).toEqual(["found", "not_found"]);
    expect(c.stageHistory.at(-1)).toMatchObject({ stage: "cv_analysis", actor: HRBP });
    expect(candidateCounts(GEC).cvAnalysed).toBe(1);
    expect(cvSignal(c).label).not.toMatch(/reject|fail/i);
  });

  it("marks for human review and returns to the previous stage afterwards", () => {
    expect(() => markForHumanReview(GEC, "app-se-2", " ", HRBP)).toThrow(/Say why/);
    markForHumanReview(GEC, "app-se-2", "Career gap to discuss", HRBP);
    expect(getCandidate(GEC, "app-se-2")!.stage).toBe("human_review");
    completeHumanReview(GEC, "app-se-2", "Discussed; continue", HRBP);
    expect(getCandidate(GEC, "app-se-2")!.stage).toBe("new_application");
  });

  it("records extraction issues and accepts corrected CV text", () => {
    flagExtractionIssue(GEC, "app-se-3", "Scanned PDF, no text layer", HRBP);
    expect(cvSignal(getCandidate(GEC, "app-se-3")!).label).toBe("Extraction issue");
    expect(() => replaceCvText(GEC, "app-se-3", "too short", HRBP)).toThrow(/50 characters/);
    replaceCvText(GEC, "app-se-3", "Chinedu Eze\nSales Representative, Delta Foods (2020 - 2026)\nPlanned delivery routes for 80 outlets.", HRBP);
    const c = getCandidate(GEC, "app-se-3")!;
    expect(c.extractionIssue).toBeNull();
    expect(c.notes.at(-1)?.text).toMatch(/Scanned PDF, no text layer/);
  });

  it("keeps candidates private to the organisation", () => {
    expect(getCandidate("org-ths", "app-se-1")).toBeNull();
    expect(() => addNote("org-ths", "app-se-1", "hello", HRBP)).toThrow(/not found in your organisation/);
  });
});

describe("Candidate Management screen", () => {
  it("is in the HRBP's Talent Assessment menu", () => {
    const talent = getNavigationConfig("hr_ld_admin").sections.flatMap((s) => s.items).find((i) => i.href === "/talent");
    expect(talent?.children?.map((c) => c.label)).toContain("Candidates");
  });

  it("lists candidates by stage with their CV signal", async () => {
    const user = userEvent.setup();
    markForHumanReview(GEC, "app-se-2", "Check employment dates", HRBP);
    render(<CandidateListView />);
    expect(screen.getByText("Adaeze Okonkwo")).toBeTruthy();
    expect(screen.getByText("CV text unavailable")).toBeTruthy(); // Chinedu's scanned CV
    await user.click(screen.getByRole("tab", { name: "Human Review" }));
    expect(screen.getByText("Bola Adeyemi")).toBeTruthy();
    expect(screen.queryByText("Adaeze Okonkwo")).toBeNull();
  });
});

describe("Candidate profile and CV analysis", () => {
  it("runs the CV analysis and shows evidence with verbatim passages", async () => {
    const user = userEvent.setup();
    renderWithAi(<CandidateProfileView candidateId="app-se-1" />, mockClient("user-priya"));
    await user.click(await screen.findByRole("button", { name: "Run CV Analysis" }));
    const table = await screen.findByRole("table", { name: "CV evidence" });
    const negotiation = within(table).getByText("Negotiation").closest("tr")!;
    expect(within(negotiation).getByText("Evidence found")).toBeTruthy();
    expect(within(negotiation).getByText(/I negotiated annual trading terms/)).toBeTruthy();
    expect(screen.getByText(/missing keyword is not proof/)).toBeTruthy();
    expect(getCandidate(GEC, "app-se-1")!.stage).toBe("cv_analysis");
  });

  it("explains when a CV has no readable text and lets HR paste it", async () => {
    const user = userEvent.setup();
    renderWithAi(<CandidateProfileView candidateId="app-se-3" />, mockClient("user-priya"));
    expect(await screen.findByText(/No text could be read from this CV/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run CV Analysis" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Flag Extraction Issue" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("What is wrong?"), "Scanned image");
    await user.type(
      within(dialog).getByLabelText(/Corrected CV text/),
      "Chinedu Eze. Sales Representative at Delta Foods. Planned delivery routes for 80 outlets every week.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Run CV Analysis" }).hasAttribute("disabled")).toBe(false));
  });

  it("is only for HRBPs", () => {
    session.userId = "user-james";
    renderWithAi(<CandidateProfileView candidateId="app-se-1" />, mockClient("user-james"));
    return screen.findByText(/Vacancy management is for HRBPs/);
  });
});

describe("Public application reads the CV", () => {
  it("stores text read from an uploaded DOCX with the application", async () => {
    const user = userEvent.setup();
    const { container } = render(<PublicApplicationView token="gec-sales-executive-7k2p" />);
    await user.click(screen.getByRole("button", { name: "Apply Now" }));
    await user.type(screen.getByLabelText(/^Full name/), "Dami Bello");
    await user.type(screen.getByLabelText(/^Email/), "dami.bello@example.com");
    await user.type(screen.getByLabelText(/^Confirm email/), "dami.bello@example.com");
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      await docx(["Dami Bello", "I negotiated contracts with 30 key distributors every year."]),
    );
    await waitFor(() => expect(screen.queryByText("Reading your CV…")).toBeNull());
    await user.click(screen.getByLabelText("I agree to the privacy and consent statement"));
    await user.click(screen.getByRole("button", { name: "Submit Application" }));
    expect(await screen.findByText("Application submitted")).toBeTruthy();
    const app = listApplications(GEC, "vac-sales-exec").find((a) => a.email === "dami.bello@example.com")!;
    expect(app.cvText).toContain("I negotiated contracts with 30 key distributors every year.");
  });
});
