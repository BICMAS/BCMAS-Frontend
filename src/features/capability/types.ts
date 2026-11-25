/** Employee capability assessment model (BCMS Employee Capability Assessment methodology). */

export type CycleStatus = "scheduled" | "active" | "completed";

export type Calibration = { by: string; at: string; note: string };

export type CapabilityCycle = {
  id: string;
  organisationId: string;
  name: string;
  /** ORGANISATION_SCOPE or a department name. */
  scope: string;
  year: number;
  cyclesPerYear: 1 | 2 | 3 | 4;
  /** Position in the year, from 1. */
  number: number;
  period: string;
  /** e.g. "December 2026" (from the timetable). */
  verificationDeadline: string;
  status: CycleStatus;
  /** Exact dates, confirmed when the cycle is activated (YYYY-MM-DD). */
  startsOn: string | null;
  endsOn: string | null;
  verifyBy: string | null;
  createdBy: string;
  calibration: Calibration | null;
  /** People left out when the cycle was activated, with the reason. */
  excluded: Array<{ name: string; reason: string }>;
};

export type CapabilityEvidence = {
  id: string;
  title: string;
  fileNames: string[];
  notes: string;
  /** When the work was done (YYYY-MM-DD). */
  workDate: string;
  addedAt: string;
};

export type VerificationDecision = "verified" | "more_evidence" | "not_verified";

export type Verification = {
  decision: VerificationDecision;
  /** The verified level; null while more evidence is needed. 0 = no level evidenced. */
  level: number | null;
  feedback: string;
  /** Decided after the cycle's verification deadline (flagged, not refused). */
  late: boolean;
  by: string;
  byUserId: string;
  at: string;
};

export type Disagreement = {
  reason: string;
  at: string;
  /** Chosen by the HR Admin; never the original reviewer. */
  reviewer: { userId: string; name: string } | null;
  outcome: { changed: boolean; by: string; at: string } | null;
};

export type AssessmentItem = {
  skillId: string;
  name: string;
  category: "technical" | "behavioural";
  required: number;
  /** Safety or compliance skill: any gap is critical. */
  essential: boolean;
  self: number | null;
  evidence: CapabilityEvidence[];
  /** Current decision. Earlier decisions stay in the events. */
  verification: Verification | null;
  disagreement: Disagreement | null;
};

export type CapabilityEvent = { at: string; actor: string; action: string; detail: string };

export type CapabilityAssessment = {
  id: string;
  cycleId: string;
  organisationId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  roleId: string;
  roleTitle: string;
  profileVersion: string;
  reviewer: { userId: string; name: string };
  items: AssessmentItem[];
  submittedAt: string | null;
  /** Self-assessment extension agreed for this person (YYYY-MM-DD). */
  extension: { until: string; reason: string; by: string; at: string } | null;
  /** When results became final and visible to the employee. */
  releasedAt: string | null;
  adjustments: Array<{ request: string; at: string; response: { text: string; by: string; at: string } | null }>;
  events: CapabilityEvent[];
};

export type AssessmentStage = "not_started" | "in_progress" | "awaiting_verification" | "more_evidence" | "reviewed" | "released";

export const STAGE_LABEL: Record<AssessmentStage, string> = {
  not_started: "Not started",
  in_progress: "Self-assessment in progress",
  awaiting_verification: "Awaiting verification",
  more_evidence: "More evidence requested",
  reviewed: "Reviewed – awaiting release",
  released: "Results released",
};

export const DECISION_LABEL: Record<VerificationDecision, string> = {
  verified: "Verified – Requirements Met",
  more_evidence: "Additional Evidence Required",
  not_verified: "Not Verified – Requirements Not Met",
};

export type GapPriority = "met" | "moderate" | "critical" | "not_verified";

export const PRIORITY_LABEL: Record<GapPriority, string> = {
  met: "Met",
  moderate: "Moderate gap",
  critical: "Critical gap",
  not_verified: "Not verified",
};
