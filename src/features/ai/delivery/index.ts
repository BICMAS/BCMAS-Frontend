import { BackendAssessmentDelivery, type AssessmentDelivery } from "./assessment-delivery";

export * from "./assessment-delivery";

export async function createAssessmentDelivery(): Promise<AssessmentDelivery> {
  // Literal env checks (inlined at build time) so production builds drop the mock entirely.
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_AI_MODE === "mock") {
    const { MockAssessmentDelivery } = await import("../mocks/mock-assessment-delivery");
    return new MockAssessmentDelivery();
  }
  return new BackendAssessmentDelivery();
}
