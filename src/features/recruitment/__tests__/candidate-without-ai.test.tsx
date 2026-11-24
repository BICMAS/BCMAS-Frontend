import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { AiActionsProvider } from "@/features/ai";
import { resetLibrary } from "@/features/assessment-library/services/central-library";
import { resetOrgLibrary } from "@/features/assessment-library/services/org-library";

import { CandidateProfileView } from "../components/candidate-profile-view";
import { attemptFor } from "../services/delivery";
import { resetRecruitment } from "../services/vacancies";

// The AI service being down must not stop HR from working with a candidate.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/talent/candidates",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/features/ai/api", async (original) => ({
  ...(await original<typeof import("@/features/ai/api")>()),
  createAiClient: async () => ({
    analyzeCv: async () => {
      const { AiApiError } = await import("@/features/ai/api/errors");
      throw AiApiError.fromBody({ code: "dependency_unavailable", message: "The AI service could not be reached.", request_id: "bff" } as never, 503);
    },
  }),
}));
vi.mock("@/stores/session-store", async () => {
  const { getMockUser: user } = await import("@/config/mock-users");
  const state = () => ({ user: user("user-priya"), userId: "user-priya", organisationId: "org-gec" });
  const useSessionStore = Object.assign(<T,>(selector: (s: ReturnType<typeof state>) => T) => selector(state()), {
    persist: { onFinishHydration: () => () => {}, hasHydrated: () => true },
    getState: state,
  });
  return { useSessionStore };
});

beforeEach(() => {
  resetLibrary();
  resetOrgLibrary();
  resetRecruitment();
});

it("shows the candidate and sends invitations; only the AI action fails", async () => {
  render(
    <AiActionsProvider>
      <CandidateProfileView candidateId="app-se-1" />
    </AiActionsProvider>,
  );
  expect(screen.getByRole("heading", { name: "Adaeze Okonkwo" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Run CV Analysis" }));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be reached");
  await userEvent.click(screen.getByRole("button", { name: "Send Assessment Invitation" }));
  expect(attemptFor("org-gec", "app-se-1")!.status).toBe("invited");
});
