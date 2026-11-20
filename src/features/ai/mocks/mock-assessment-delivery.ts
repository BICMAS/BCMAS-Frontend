/** LOCAL DEVELOPMENT ONLY — participant assessment data (mirrors the AI service's dev "dev-james" assessment). */
import type {
  AssessmentDelivery,
  AssignedAssessment,
  DeliveryAssessment,
  ItemResponse,
} from "../delivery/assessment-delivery";

const RATING = [1, 2, 3, 4, 5].map((level) => ({
  level,
  label: ["Foundation", "Developing", "Proficient", "Advanced", "Expert"][level - 1]!,
}));

function seed(): DeliveryAssessment {
  return {
    assessment_id: "dev-james",
    title: "Senior Solutions Architect capability assessment",
    type: "development",
    objectives: [
      "Establish evidence-based proficiency in the role's priority competencies.",
      "Identify development needs against the role profile.",
    ],
    status: "assigned",
    due_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    items: [
      {
        item_id: "lib-sjt-api",
        type: "situational_judgement",
        title: "Partner API exposing customer data",
        stem: "A partner asks for a new endpoint returning customer records next week. The request has no data expiry rules. What do you do first?",
        competency: "API Governance",
        options: [
          { option_key: "a", text: "Ship it and add rules later." },
          { option_key: "b", text: "Document the endpoint with the API template." },
          { option_key: "c", text: "Review the integration against the API standard first." },
          { option_key: "d", text: "Define expiry and access rules, then review the integration against the standard." },
        ],
        rating_scale: null,
        estimated_minutes: 5,
      },
      {
        item_id: "lib-beh-influence",
        type: "behavioural_assessment",
        title: "Explaining a technical trade-off",
        stem: "Describe a time you explained a technical trade-off to non-technical stakeholders.",
        competency: "Strategic Influence",
        options: null,
        rating_scale: null,
        estimated_minutes: 10,
      },
      {
        item_id: "lib-tech-ms",
        type: "practical_exercise",
        title: "Failure handling between services",
        stem: "Explain how you would split the ordering domain and handle failures between the services.",
        competency: "Microservices Design",
        options: null,
        rating_scale: null,
        estimated_minutes: 15,
      },
      {
        item_id: "lib-self",
        type: "self_assessment",
        title: "Self-assessment: API governance",
        stem: "Rate your API governance proficiency (1-5) and give a work example that shows it.",
        competency: "API Governance",
        options: null,
        rating_scale: RATING,
        estimated_minutes: 5,
      },
    ],
  };
}

export class MockAssessmentDelivery implements AssessmentDelivery {
  readonly connected = true;
  private assessment = seed();
  submitted: ItemResponse[] | null = null;

  constructor(private readonly latencyMs = 200) {}

  private async wait<T>(value: T): Promise<T> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    return structuredClone(value);
  }

  listAssigned(): Promise<AssignedAssessment[]> {
    const { assessment_id, title, type, status, due_at, items } = this.assessment;
    return this.wait([{ assessment_id, title, type, status, due_at, item_count: items.length }]);
  }

  async getAssessment(assessmentId: string): Promise<DeliveryAssessment> {
    if (assessmentId !== this.assessment.assessment_id) {
      const { AiApiError } = await import("../api/errors");
      throw new AiApiError("not_found", "The assessment was not found.", { status: 404 });
    }
    return this.wait(this.assessment);
  }

  submit(_assessmentId: string, responses: ItemResponse[]) {
    this.submitted = responses;
    this.assessment.status = "submitted";
    return this.wait({ status: "submitted" as const, submitted_at: new Date().toISOString() });
  }
}
