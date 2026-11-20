/**
 * Assessment delivery (taking an assessment) — owned by the conventional backend, not the AI
 * service: participants read the instrument WITHOUT answer keys and submit responses to the
 * assessment record. Those endpoints are PROPOSED and not confirmed by the backend team:
 *
 *   BE-072  GET  /me/assessments                                  (assigned assessments)
 *   BE-069  GET  /talent/assessments/{assessment_id}/delivery     (items without keys)
 *   BE-073  POST /talent/assessments/{assessment_id}/responses    (participant responses)
 *
 * `BackendAssessmentDelivery` reports "not connected" instead of pretending; the isolated mock
 * provides local development data. The AI service then evaluates submitted responses (T3).
 */
import { AiApiError } from "../api/errors";

export type DeliveryItemType =
  | "behavioural_assessment"
  | "situational_judgement"
  | "case_study"
  | "practical_exercise"
  | "self_assessment"
  | "manager_assessment";

export type DeliveryItem = {
  item_id: string;
  type: DeliveryItemType;
  title: string;
  stem: string;
  competency: string;
  options: Array<{ option_key: string; text: string }> | null; // no scores: keys stay with the assessor
  rating_scale: Array<{ level: number; label: string }> | null;
  estimated_minutes: number;
};

export type DeliveryAssessment = {
  assessment_id: string;
  title: string;
  type: "development" | "promotion" | "recruitment";
  objectives: string[];
  status: "assigned" | "in_progress" | "submitted";
  due_at: string | null;
  items: DeliveryItem[];
};

export type AssignedAssessment = Omit<DeliveryAssessment, "items" | "objectives"> & { item_count: number };

export type ItemResponse = {
  item_id: string;
  response_text: string | null;
  selected_option_key: string | null;
  rating: number | null;
};

export interface AssessmentDelivery {
  readonly connected: boolean;
  listAssigned(): Promise<AssignedAssessment[]>;
  getAssessment(assessmentId: string): Promise<DeliveryAssessment>;
  submit(assessmentId: string, responses: ItemResponse[]): Promise<{ status: "submitted"; submitted_at: string }>;
}

export function isComplete(item: DeliveryItem, response: ItemResponse | undefined): boolean {
  if (!response) return false;
  if (item.type === "situational_judgement") return Boolean(response.selected_option_key);
  if (item.type === "self_assessment" || item.type === "manager_assessment") {
    return response.rating !== null && Boolean(response.response_text?.trim());
  }
  return Boolean(response.response_text?.trim());
}

/** Live mode: the backend endpoints are not confirmed, so nothing is called and nothing is faked. */
export class BackendAssessmentDelivery implements AssessmentDelivery {
  readonly connected = false;

  private notConnected(ids: string[]): AiApiError {
    return new AiApiError(
      "backend_dependency_unconfirmed",
      "Taking assessments online needs the HR system’s assessment delivery endpoints, which are not available yet.",
      { backendEndpointIds: ids, status: 424 },
    );
  }

  async listAssigned(): Promise<AssignedAssessment[]> {
    throw this.notConnected(["BE-072"]);
  }

  async getAssessment(): Promise<DeliveryAssessment> {
    throw this.notConnected(["BE-069"]);
  }

  async submit(): Promise<{ status: "submitted"; submitted_at: string }> {
    throw this.notConnected(["BE-073"]);
  }
}
