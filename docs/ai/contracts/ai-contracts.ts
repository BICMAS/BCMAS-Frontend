/**
 * CFP AI Service — Frontend API contracts (TypeScript)
 *
 * Status:            DRAFT FOR REVIEW — not yet implemented.
 * Contract version:  1.0.0-rc.1
 * Mirrors:           docs/ai/contracts/cfp_ai_schemas.py (Pydantic, source of truth at runtime)
 * Spec:              docs/ai/AI_API_SPEC.md
 *
 * Type-only module. No runtime code. Field names are snake_case to match the
 * wire format exactly. When the AI service exists, these types will be
 * regenerated from its OpenAPI document (openapi-typescript); this file is
 * the reviewable contract until then.
 *
 * Conventions
 *  - All timestamps are ISO 8601 UTC strings.
 *  - Nullable fields are always present (`T | null`); optional fields (`?`) may be omitted.
 *  - `BackendId` values are opaque IDs issued by the conventional backend.
 *  - AI-issued IDs are prefixed ULIDs (e.g. "cs_01J…").
 */

/* ────────────────────────────────────────────────────────────────────────── */
/* Primitives & identifiers                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export type ContractVersion = "1.0.0-rc.1";
export type IsoDateTime = string;

/** Opaque ID issued by the conventional backend. */
export type BackendId = string;
export type TenantId = BackendId;
export type UserId = BackendId;
export type EmployeeId = BackendId;
export type SkillId = BackendId;
export type IndicatorId = BackendId;
export type RoleId = BackendId;
export type CatalogueItemId = BackendId;
export type PlanId = BackendId;
export type AssessmentId = BackendId;
export type RubricRowId = BackendId;
export type LibraryItemId = BackendId;
export type EvidenceId = BackendId;
export type ResponseItemId = BackendId;

/** IDs issued by the AI service. */
export type ScenarioId = `sc_${string}`;
export type CoachSessionId = `cs_${string}`;
export type MessageId = `msg_${string}`;
export type ConversationId = `cv_${string}`;
export type RoleplayId = `rp_${string}`;
export type DraftId = `drf_${string}`;
export type JobId = `job_${string}`;
export type ApprovalId = `apr_${string}`;
export type SuggestionId = `sug_${string}`;
export type ScoringSetId = `scs_${string}`;
export type FactId = `fact_${string}`;

/** Identifier of a proposed backend endpoint in BACKEND_INTEGRATION_SPEC.md (e.g. "BE-030"). */
export type BackendEndpointId = `BE-${string}`;

/** Proficiency level on the tenant's single framework scale (integer, 1..N). */
export type Level = number;

/* ────────────────────────────────────────────────────────────────────────── */
/* Enumerations                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

export type AgentName = "coaching" | "dev_plan" | "talent_assessment";

export type CapabilityId =
  // AI Coaching Agent
  | "coaching.roleplay_turn" // C1
  | "coaching.evaluate_session" // C2
  | "coaching.recommend_scenarios" // C3
  | "coaching.draft_scenario" // C4
  | "coaching.conversation_turn" // C5
  | "coaching.manager_brief" // C6
  // AI Training & Development Plan Agent
  | "dev_plan.draft_plan" // D1
  | "dev_plan.explain_gaps" // D2
  | "dev_plan.recommend_learning" // D3
  | "dev_plan.review_plan" // D4
  | "dev_plan.draft_cohort_pathway" // D5
  | "dev_plan.manager_recommendations" // D6
  // AI Talent Assessment Agent
  | "talent.draft_items" // T1
  | "talent.roleplay_turn" // T2
  | "talent.recommend_scores" // T3
  | "talent.draft_report" // T4
  | "talent.analyze_evidence" // T5
  | "talent.insights_turn"; // T6

export type Role =
  | "employee"
  | "line_manager"
  | "hr_ld_admin"
  | "organisation_admin"
  | "platform_super_admin";

export type Entitlement = "ai_coaching" | "ai_dev_plans" | "ai_talent_assessment";

export type SkillCategory = "technical" | "behavioural" | "knowledge";

export type GapPriority = "critical" | "high" | "medium" | "low";

export type Confidence = "low" | "medium" | "high";

/* ────────────────────────────────────────────────────────────────────────── */
/* Errors                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export type ErrorCode =
  | "invalid_request" // 400
  | "unauthenticated" // 401
  | "forbidden" // 403
  | "entitlement_required" // 403
  | "not_found" // 404
  | "conflict" // 409
  | "idempotency_conflict" // 409
  | "precondition_failed" // 412
  | "ai_output_invalid" // 422
  | "content_refused" // 422
  | "backend_dependency_unconfirmed" // 424
  | "upstream_unavailable" // 424
  | "rate_limited" // 429
  | "budget_exceeded" // 429
  | "internal_error" // 500
  | "ai_unavailable" // 503
  | "deadline_exceeded"; // 504

export type ErrorDetail = {
  /** JSON path of the offending field, when applicable. */
  field?: string;
  issue: string;
};

export type ErrorBody = {
  code: ErrorCode;
  /** Safe to show to end users. */
  message: string;
  request_id: string;
  retryable: boolean;
  retry_after_s?: number;
  details?: ErrorDetail[];
  /** Present when code is backend_dependency_unconfirmed / upstream_unavailable. */
  backend_endpoint_ids?: BackendEndpointId[];
};

export type ErrorEnvelope = { error: ErrorBody };

/* ────────────────────────────────────────────────────────────────────────── */
/* Shared structures                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

export type Page<T> = {
  items: T[];
  next_cursor: string | null;
};

export type CitationSourceType =
  | "skill_level"
  | "indicator"
  | "role_profile"
  | "catalogue_item"
  | "scenario"
  | "library_item"
  | "evidence"
  | "transcript"
  | "assessment_response";

export type Citation = {
  source_type: CitationSourceType;
  source_id: string;
  source_version: string | null;
  title: string;
  excerpt: string | null;
};

/** Context slices assembled from backend data. See AI_TECHNICAL_SPEC.md §5. */
export type ContextSlice =
  | "subject_profile"
  | "role_profile"
  | "framework"
  | "capabilities"
  | "learning_history"
  | "development_plans"
  | "coaching_history"
  | "team"
  | "assessment"
  | "evidence";

export type ContextGapReason =
  | "backend_unconfirmed"
  | "forbidden"
  | "not_found"
  | "upstream_error";

/** A context slice the agent could not use; outputs are produced without it. */
export type ContextGap = {
  slice: ContextSlice;
  reason: ContextGapReason;
};

export type AiProvenance = {
  capability: CapabilityId;
  model: string;
  prompt_version: string;
  generated_at: IsoDateTime;
  context_as_of: IsoDateTime | null;
  citations: Citation[];
  unavailable_context: ContextGap[];
};

export type SkillTarget = {
  skill_id: SkillId;
  skill_name: string;
  target_level: Level;
  level_label: string | null;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Streaming (Server-Sent Events)                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export type StreamMeta = {
  request_id: string;
  capability: CapabilityId;
  model: string;
  resource_id: string | null;
  turn_id: string | null;
};

/** Discriminated union of SSE frames. `event` is the SSE `event:` field; `data` is the JSON payload. */
export type StreamEvent<TResult> =
  | { event: "meta"; data: StreamMeta }
  | { event: "delta"; data: { text: string } }
  | { event: "progress"; data: JobProgress }
  | { event: "result"; data: TResult }
  | { event: "error"; data: ErrorBody }
  | { event: "done"; data: Record<string, never> };

/* ────────────────────────────────────────────────────────────────────────── */
/* Async jobs                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

export type JobStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export type JobProgress = {
  step: string;
  pct: number; // 0..100
};

export type JobAccepted = {
  job_id: JobId;
  status: "queued";
  status_url: string;
  events_url: string;
};

export type Job<TResult> = {
  job_id: JobId;
  capability: CapabilityId;
  status: JobStatus;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  progress: JobProgress | null;
  result: TResult | null;
  error: ErrorBody | null;
  /** Set when status === "awaiting_approval". */
  approval_id: ApprovalId | null;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Human approval workflows: drafts & approvals                                */
/* ────────────────────────────────────────────────────────────────────────── */

export type DraftKind =
  | "development_plan"
  | "plan_adjustment"
  | "cohort_pathway"
  | "scenario"
  | "assessment_items"
  | "assessment_report";

export type DraftStatus =
  | "open"
  | "accepted"
  | "edited"
  | "rejected"
  | "expired"
  | "committed"
  | "commit_failed";

export type ApprovalMode =
  /** Advisory output; nothing to commit. */
  | "none"
  /** The requesting user accepts, edits or rejects. */
  | "user_accept"
  /** A user holding one of `approver_roles` must approve. */
  | "role_approval"
  /** Each item (e.g. rubric row) is individually accepted or overridden. */
  | "per_item_review";

export type ApprovalPolicy = {
  mode: ApprovalMode;
  approver_roles: Role[];
  /** Where an accepted draft is persisted. */
  commit_target: "backend" | "ai_service" | "none";
  /** Backend endpoint used to commit; every one is PROPOSED until confirmed. */
  commit_endpoint_id: BackendEndpointId | null;
};

export type CommittedRef = {
  system: "backend" | "ai_service";
  resource_type: string;
  resource_id: string;
};

export type DraftResolution = {
  decision: "accepted" | "edited" | "rejected";
  resolved_by: UserId;
  resolved_at: IsoDateTime;
  reason: string | null;
  committed_ref: CommittedRef | null;
};

export type Draft<TKind extends DraftKind, TPayload> = {
  draft_id: DraftId;
  kind: TKind;
  status: DraftStatus;
  subject_employee_id: EmployeeId | null;
  payload: TPayload;
  provenance: AiProvenance;
  approval_policy: ApprovalPolicy;
  disclaimer: string;
  created_by: UserId;
  created_at: IsoDateTime;
  expires_at: IsoDateTime;
  resolution: DraftResolution | null;
};

export type DraftResolutionRequest<TPayload> = {
  decision: "accepted" | "edited" | "rejected";
  /** Required when decision === "edited". */
  edited_payload?: TPayload;
  reason?: string;
};

export type DraftCommitReport = {
  /** Reported by the frontend after it committed the draft to the backend. */
  committed_ref: CommittedRef;
};

export type ApprovalCheckpoint = "cohort_members" | "item_blueprint";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/** A paused workflow (LangGraph interrupt) waiting for a human decision. */
export type ApprovalRequest<TProposal> = {
  approval_id: ApprovalId;
  job_id: JobId;
  capability: CapabilityId;
  checkpoint: ApprovalCheckpoint;
  summary: string;
  proposal: TProposal;
  allowed_decisions: Array<"approve" | "reject" | "modify">;
  approver_roles: Role[];
  status: ApprovalStatus;
  created_at: IsoDateTime;
  expires_at: IsoDateTime;
};

export type ApprovalDecisionRequest<TProposal> = {
  decision: "approve" | "reject" | "modify";
  /** Required when decision === "modify". */
  modified_proposal?: TProposal;
  comment?: string;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Capability discovery & feature flags                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export type AvailabilityReason =
  | "not_entitled"
  | "role_not_permitted"
  | "backend_dependency_unconfirmed"
  | "backend_dependency_down"
  | "ai_disabled";

export type CapabilityStatus = {
  capability: CapabilityId;
  agent: AgentName;
  /** "degraded": runs, but without some optional context (see missing_backend_endpoints). */
  availability: "available" | "degraded" | "unavailable";
  reasons: AvailabilityReason[];
  missing_backend_endpoints: BackendEndpointId[];
};

export type CapabilitiesResponse = {
  contract_version: ContractVersion;
  tenant_id: TenantId;
  capabilities: CapabilityStatus[];
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Agent 1 — AI Coaching Agent                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

export type ScenarioCategory = "role" | "soft" | "technical" | "custom";
export type ScenarioDifficulty = "foundation" | "intermediate" | "advanced" | "expert";
export type ScenarioStatus = "draft" | "published" | "archived";

export type PersonaPublic = {
  name: string;
  role: string;
  avatar_url: string | null;
};

export type SuccessCriterion = {
  criterion_id: string;
  text: string;
  skill_id: SkillId;
  indicator_id: IndicatorId | null;
};

/** Scenario as visible to learners. Hidden persona constraints are never exposed here. */
export type CoachScenario = {
  scenario_id: ScenarioId;
  version: number;
  title: string;
  description: string;
  category: ScenarioCategory;
  difficulty: ScenarioDifficulty;
  estimated_minutes: number;
  target_skills: SkillTarget[];
  persona: PersonaPublic;
  opening: string;
  status: ScenarioStatus;
  updated_at: IsoDateTime;
};

/** Authoring fields, visible to hr_ld_admin only. */
export type ScenarioAuthoring = {
  persona_brief: string;
  hidden_constraints: string[];
  escalation_rules: string[];
  success_criteria: SuccessCriterion[];
};

export type CoachScenarioAdmin = CoachScenario & { authoring: ScenarioAuthoring };

export type ListScenariosQuery = {
  category?: ScenarioCategory;
  skill_id?: SkillId;
  q?: string;
  status?: ScenarioStatus; // admin only
  cursor?: string;
  limit?: number; // 1..50, default 20
};

export type ScenarioRecommendation = {
  scenario: CoachScenario;
  reason: string;
  target_skill_id: SkillId | null;
  gap: number | null;
};

export type ScenarioRecommendationsResponse = {
  recommendations: ScenarioRecommendation[];
  provenance: AiProvenance;
};

export type ScenarioDraftRequest = {
  title: string; // 3..120
  brief: string | null; // ≤ 2000
  category: ScenarioCategory;
  difficulty: ScenarioDifficulty | null;
  target_skills: Array<{ skill_id: SkillId; target_level: Level }>; // 1..3
};

export type ScenarioDraftPayload = Omit<
  CoachScenario,
  "scenario_id" | "version" | "status" | "updated_at"
> & { authoring: ScenarioAuthoring };

export type ScenarioDraft = Draft<"scenario", ScenarioDraftPayload>;

export type PublishScenarioRequest = {
  from_draft_id: DraftId | null;
  scenario: ScenarioDraftPayload;
};

export type UpdateScenarioRequest = Partial<ScenarioDraftPayload> & {
  status?: ScenarioStatus;
  /** Optimistic concurrency: must equal current version. */
  expected_version: number;
};

export type CoachMessage = {
  message_id: MessageId;
  role: "coach" | "user";
  text: string;
  created_at: IsoDateTime;
};

export type CoachSessionStatus = "active" | "evaluating" | "evaluated" | "abandoned";
export type EvaluationStatus = "none" | "pending" | "ready" | "failed";

export type CreateCoachSessionRequest = {
  scenario_id: ScenarioId;
  mode: "practice";
};

export type CoachSession = {
  session_id: CoachSessionId;
  employee_id: EmployeeId;
  scenario_id: ScenarioId;
  scenario_version: number;
  title: string;
  status: CoachSessionStatus;
  evaluation_status: EvaluationStatus;
  persona: PersonaPublic;
  target_skills: SkillTarget[];
  started_at: IsoDateTime;
  ended_at: IsoDateTime | null;
  duration_s: number | null;
  time_limit_s: number;
  messages: CoachMessage[];
};

export type CoachSessionSummary = Omit<CoachSession, "messages"> & {
  practice_score: number | null;
};

export type ListCoachSessionsQuery = {
  /** Managers may pass a direct report's employee_id; returns summaries only. */
  employee_id?: EmployeeId;
  status?: CoachSessionStatus;
  cursor?: string;
  limit?: number;
};

export type SendCoachMessageRequest = {
  text: string; // 1..4000 chars
  /** Client-generated UUID; resending the same ID never duplicates a turn. */
  client_message_id: string;
};

export type CoachTurnResult = {
  user_message: CoachMessage;
  coach_message: CoachMessage;
  session_status: CoachSessionStatus;
  /** The persona has reached a natural end; UI may prompt the user to end. */
  suggest_end: boolean;
  remaining_s: number;
};

export type EndCoachSessionRequest = {
  reason: "user_ended" | "time_limit";
};

export type TranscriptQuote = {
  message_id: MessageId;
  quote: string;
};

export type SkillObservation = {
  skill_id: SkillId;
  skill_name: string;
  target_level: Level;
  observed_level: Level | null;
  evidence: TranscriptQuote[];
};

export type FeedbackPoint = {
  text: string;
  indicator_id: IndicatorId | null;
  evidence: TranscriptQuote[];
};

export type GrowthPoint = FeedbackPoint & { tip: string };

export type NextStep = {
  type: "learning" | "scenario";
  ref_id: CatalogueItemId | ScenarioId;
  title: string;
  reason: string;
};

export type SessionEvaluation = {
  session_id: CoachSessionId;
  overall_practice_score: number; // 0..100
  skill_observations: SkillObservation[];
  strengths: FeedbackPoint[];
  growth_areas: GrowthPoint[];
  next_steps: NextStep[];
  provenance: AiProvenance;
  disclaimer: string;
};

export type CoachMetrics = {
  total_sessions: number;
  sessions_this_month: number;
  skills_targeted: number;
  average_practice_score: number | null;
  minutes_coached: number;
};

export type SuggestedAction = {
  type: "open_scenario" | "view_learning" | "generate_plan" | "view_gap";
  label: string;
  ref_id: string | null;
};

export type CreateConversationRequest = {
  topic: string | null; // ≤ 200
};

export type Conversation = {
  conversation_id: ConversationId;
  status: "active" | "closed";
  created_at: IsoDateTime;
  messages: CoachMessage[];
};

export type SendConversationMessageRequest = SendCoachMessageRequest;

export type ConversationTurnResult = {
  user_message: CoachMessage;
  assistant_message: CoachMessage;
  suggested_actions: SuggestedAction[];
};

export type ManagerBriefRequest = {
  employee_id: EmployeeId;
};

export type ManagerCoachingBrief = {
  employee_id: EmployeeId;
  focus_skills: SkillTarget[];
  talking_points: string[];
  questions_to_ask: string[];
  suggested_scenarios: ScenarioRecommendation[];
  provenance: AiProvenance;
  disclaimer: string;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Agent 2 — AI Training & Development Plan Agent                              */
/* ────────────────────────────────────────────────────────────────────────── */

/** Deterministic gap computed by the AI service from backend data (not by the LLM). */
export type SkillGap = {
  skill_id: SkillId;
  skill_name: string;
  category: SkillCategory;
  required_level: Level;
  verified_level: Level | null;
  self_assessed_level: Level | null;
  gap: number;
  priority: GapPriority;
};

export type GapInsight = SkillGap & {
  why_it_matters: string;
  priority_rationale: string;
  citations: Citation[];
};

export type GapInsightsResponse = {
  employee_id: EmployeeId;
  role_id: RoleId;
  role_profile_version: string;
  gaps: GapInsight[];
  provenance: AiProvenance;
};

export type LearningRecommendationsQuery = {
  employee_id: EmployeeId;
  skill_id?: SkillId;
  limit?: number; // 1..20, default 5
};

export type LearningRecommendation = {
  catalogue_item_id: CatalogueItemId;
  title: string;
  kind: string;
  provider: string | null;
  duration_minutes: number | null;
  skill_id: SkillId;
  target_level: Level | null;
  fit_reason: string;
  citations: Citation[];
};

export type LearningRecommendationsResponse = {
  recommendations: LearningRecommendation[];
  provenance: AiProvenance;
};

export type PlanActionType =
  | "learning"
  | "workplace_practice"
  | "coaching_scenario"
  | "mentoring"
  | "evidence";

export type PlanAction = {
  /** Stable within a draft; used by edits and adjustment proposals. */
  action_key: string;
  type: PlanActionType;
  title: string;
  description: string;
  /** Must reference an existing catalogue item when type === "learning". */
  catalogue_item_id: CatalogueItemId | null;
  /** Must reference a published scenario when type === "coaching_scenario". */
  scenario_id: ScenarioId | null;
  success_indicator_ids: IndicatorId[];
  due_in_days: number;
};

export type PlanGoal = {
  goal_key: string;
  skill_id: SkillId;
  skill_name: string;
  from_level: Level;
  to_level: Level;
  priority: GapPriority;
  objective: string;
  actions: PlanAction[];
  evidence_expectations: string[];
};

export type ValidationIssue = {
  code: string;
  message: string;
  path: string;
};

export type DraftValidationReport = {
  passed: boolean;
  repaired: boolean;
  issues: ValidationIssue[];
};

export type DevelopmentPlanDraftRequest = {
  employee_id: EmployeeId;
  role_id: RoleId | null; // null = employee's current role
  focus_skill_ids: SkillId[] | null;
  horizon_weeks: number; // 4..52, default 12
  constraints: {
    hours_per_week: number | null;
    preferred_formats: string[] | null;
  } | null;
};

export type DevelopmentPlanDraftPayload = {
  employee_id: EmployeeId;
  role_id: RoleId;
  role_profile_version: string;
  horizon_weeks: number;
  rationale: string;
  goals: PlanGoal[];
  validation: DraftValidationReport;
};

export type DevelopmentPlanDraft = Draft<"development_plan", DevelopmentPlanDraftPayload>;

export type PlanReviewTrigger =
  | "manual"
  | "capability_verified"
  | "learning_completed"
  | "coaching_evaluated"
  | "assessment_reported";

export type PlanReviewRequest = {
  trigger: PlanReviewTrigger;
};

export type PlanChange = {
  op:
    | "add_goal"
    | "remove_goal"
    | "update_goal"
    | "add_action"
    | "remove_action"
    | "update_action"
    | "mark_goal_complete";
  /** Backend goal ID for existing goals, or goal_key for new goals. */
  goal_ref: string;
  action_ref: string | null;
  goal: PlanGoal | null;
  action: PlanAction | null;
  reason: string;
};

export type PlanAdjustmentPayload = {
  plan_id: PlanId;
  trigger: PlanReviewTrigger;
  changes: PlanChange[];
  rationale: string;
  validation: DraftValidationReport;
};

export type PlanAdjustmentDraft = Draft<"plan_adjustment", PlanAdjustmentPayload>;

export type CohortPathwayRequest = {
  skill_id: SkillId;
  target_level: Level;
  employee_ids: EmployeeId[]; // 1..200
};

export type CohortMember = {
  employee_id: EmployeeId;
  name: string;
  current_level: Level | null;
};

/** Proposal shown at the "cohort_members" approval checkpoint. */
export type CohortMembersProposal = {
  skill_id: SkillId;
  target_level: Level;
  included: CohortMember[];
  excluded: Array<CohortMember & { reason: string }>;
};

export type CohortPathwayPayload = {
  skill_id: SkillId;
  target_level: Level;
  members: CohortMember[];
  shared_actions: PlanAction[];
  member_overrides: Array<{
    employee_id: EmployeeId;
    extra_actions: PlanAction[];
    note: string;
  }>;
  rationale: string;
  validation: DraftValidationReport;
};

export type CohortPathwayDraft = Draft<"cohort_pathway", CohortPathwayPayload>;

export type ManagerRecommendation = {
  employee_id: EmployeeId;
  kind: "start_plan" | "assign_learning" | "suggest_practice" | "review_evidence" | "plan_at_risk";
  title: string;
  detail: string;
  skill_id: SkillId | null;
  ref_id: string | null;
  priority: GapPriority;
};

export type ManagerRecommendationsResponse = {
  employee_id: EmployeeId;
  recommendations: ManagerRecommendation[];
  provenance: AiProvenance;
};

/** Created by agent-to-agent handoffs; acted on by a user later. */
export type Suggestion = {
  suggestion_id: SuggestionId;
  kind: "plan_review" | "plan_draft" | "practice_scenario";
  subject_employee_id: EmployeeId;
  title: string;
  detail: string;
  source_handoff: HandoffType;
  ref_id: string | null;
  status: "pending" | "dismissed" | "acted";
  created_at: IsoDateTime;
};

export type HandoffType =
  | "coaching.session_evaluated"
  | "talent.assessment_reported"
  | "dev_plan.practice_needed";

/* ────────────────────────────────────────────────────────────────────────── */
/* Agent 3 — AI Talent Assessment Agent                                        */
/* ────────────────────────────────────────────────────────────────────────── */

export type AssessmentItemType =
  | "knowledge_test"
  | "situational_judgement"
  | "case_study"
  | "ai_roleplay"
  | "practical_exercise"
  | "behavioural_assessment";

export type ItemDraftRequest = {
  type: AssessmentItemType;
  skill_id: SkillId;
  target_level: Level;
  role_id: RoleId | null;
  count: number; // 1..5
  guidance: string | null; // ≤ 2000
};

/** Proposal shown at the "item_blueprint" approval checkpoint. */
export type ItemBlueprint = {
  type: AssessmentItemType;
  skill_id: SkillId;
  target_level: Level;
  indicators: Array<{ indicator_id: IndicatorId; text: string }>;
  item_outlines: string[];
};

export type MarkingGuideBand = {
  level: Level;
  descriptor: string;
  indicator_ids: IndicatorId[];
};

export type AssessmentItemDraftPayload = {
  item_key: string;
  type: AssessmentItemType;
  skill_id: SkillId;
  target_level: Level;
  title: string;
  stem: string;
  options: Array<{ option_key: string; text: string; score: number }> | null;
  model_answer: string | null;
  marking_guide: MarkingGuideBand[];
  estimated_minutes: number;
  /** Present only when type === "ai_roleplay". */
  roleplay: (ScenarioAuthoring & { persona: PersonaPublic; opening: string }) | null;
};

export type AssessmentItemsDraft = Draft<
  "assessment_items",
  { items: AssessmentItemDraftPayload[]; validation: DraftValidationReport }
>;

export type RoleplayMessage = {
  message_id: MessageId;
  role: "persona" | "participant";
  text: string;
  created_at: IsoDateTime;
};

export type StartRoleplayRequest = {
  assessment_id: AssessmentId;
  library_item_id: LibraryItemId;
};

export type RoleplaySession = {
  roleplay_id: RoleplayId;
  assessment_id: AssessmentId;
  library_item_id: LibraryItemId;
  status: "active" | "submitted" | "expired";
  persona: PersonaPublic;
  time_limit_s: number;
  started_at: IsoDateTime;
  expires_at: IsoDateTime;
  messages: RoleplayMessage[];
};

export type SendRoleplayMessageRequest = SendCoachMessageRequest;

export type RoleplayTurnResult = {
  participant_message: RoleplayMessage;
  persona_message: RoleplayMessage;
  remaining_s: number;
};

export type RoleplaySubmitResult = {
  roleplay_id: RoleplayId;
  status: "submitted";
  /**
   * "pending_backend": the transcript is held by the AI service until BE-062 is confirmed and available.
   * No score is ever returned to the participant.
   */
  backend_submission: "submitted" | "pending_backend";
};

export type ScoringRequest = {
  /** null = all rubric rows with responses. */
  rubric_row_ids: RubricRowId[] | null;
};

export type ResponseQuote = {
  response_item_id: ResponseItemId;
  quote: string;
};

export type ScoringRecommendation = {
  rubric_row_id: RubricRowId;
  skill_id: SkillId;
  required_level: Level;
  recommended_score: 1 | 2 | 3 | 4 | 5;
  confidence: Confidence;
  rationale: string;
  evidence: ResponseQuote[];
  indicators_met: IndicatorId[];
  indicators_missing: IndicatorId[];
};

/** No readiness band: the backend derives it from reviewer-confirmed scores. */
export type ScoringRecommendationSet = {
  scoring_set_id: ScoringSetId;
  assessment_id: AssessmentId;
  rubric_version: string;
  blind: true;
  recommendations: ScoringRecommendation[];
  approval_policy: ApprovalPolicy;
  provenance: AiProvenance;
  disclaimer: string;
};

/** Per-row reviewer decision. Recorded in the AI service for evaluation; committed to the backend via BE-063. */
export type ScoreReviewRequest = {
  reviews: Array<{
    rubric_row_id: RubricRowId;
    decision: "accepted" | "overridden";
    final_score: 1 | 2 | 3 | 4 | 5;
    comment: string | null;
  }>;
};

export type AssessmentReportPayload = {
  assessment_id: AssessmentId;
  summary: string;
  strengths: string[];
  risks: string[];
  per_skill: Array<{
    skill_id: SkillId;
    narrative: string;
    recommended_score: number | null;
    final_score: number | null;
  }>;
  development_handoff: Array<{ skill_id: SkillId; suggestion: string }>;
};

export type AssessmentReportDraft = Draft<"assessment_report", AssessmentReportPayload>;

export type EvidenceAnalysisRequest = {
  target_level: Level | null; // null = role requirement
};

export type EvidenceAnalysis = {
  evidence_id: EvidenceId;
  skill_id: SkillId;
  target_level: Level;
  indicators_supported: Array<{ indicator_id: IndicatorId; quote: string }>;
  indicators_missing: Array<{ indicator_id: IndicatorId; suggested_question: string }>;
  summary: string;
  provenance: AiProvenance;
  disclaimer: string;
};

export type ChartSpec = {
  type: "bar" | "line" | "donut" | "table";
  title: string;
  x_label: string | null;
  y_label: string | null;
  series: Array<{ name: string; points: Array<{ x: string; y: number }> }>;
};

export type InsightsTurnRequest = {
  conversation_id: ConversationId | null;
  text: string; // 1..2000
  client_message_id: string;
};

export type InsightsTurnResult = {
  conversation_id: ConversationId;
  answer: string;
  chart: ChartSpec | null;
  provenance: AiProvenance;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Feedback, personal data                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

export type FeedbackRequest = {
  target: {
    type: "message" | "draft" | "evaluation" | "recommendation" | "scoring_set" | "analysis";
    id: string;
  };
  rating: "up" | "down";
  reasons: string[];
  comment: string | null; // ≤ 1000
};

export type LearnerMemoryFact = {
  fact_id: FactId;
  kind: "preference" | "goal" | "theme";
  text: string;
  source_session_id: CoachSessionId | ConversationId | null;
  created_at: IsoDateTime;
};

export type MyAiDataExport = {
  generated_at: IsoDateTime;
  coaching_sessions: CoachSession[];
  conversations: Conversation[];
  learner_memory: LearnerMemoryFact[];
  drafts: Array<Draft<DraftKind, unknown>>;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Platform console (platform_super_admin)                                     */
/* ────────────────────────────────────────────────────────────────────────── */

export type DependencyHealth = {
  name: string; // "llm:anthropic", "postgres", "redis", "backend:BE-030", …
  status: "healthy" | "degraded" | "down" | "not_configured";
  detail: string | null;
};

export type AdminHealthResponse = {
  status: "healthy" | "degraded" | "down";
  version: string;
  contract_version: ContractVersion;
  dependencies: DependencyHealth[];
  checked_at: IsoDateTime;
};

export type TenantUsageRow = {
  tenant_id: TenantId;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  budget_used_ratio: number | null;
};

export type AdminMetricsResponse = {
  period_start: IsoDateTime;
  period_end: IsoDateTime;
  tenants: TenantUsageRow[];
  p95_latency_ms_by_capability: Partial<Record<CapabilityId, number>>;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Orchestrator (docs/ai/ORCHESTRATION.md) — addition pending review.          */
/* Mirrors ai-service/src/cfp_ai/orchestrator/models.py and agents/steps.py.  */
/* ────────────────────────────────────────────────────────────────────────── */

export type ExecutionId = `exe_${string}`;

export type OrchestrationRequest = {
  /** Natural-language request (routed), or… */
  message?: string; // 1..2000
  /** …an explicit capability (no routing). One of the two is required. */
  capability?: CapabilityId;
  subject_employee_id?: EmployeeId;
  args?: Record<string, string>; // e.g. { assessment_id }
  allow_handoffs?: boolean; // default true
};

export type ExecutionStatus =
  | "routing"
  | "running"
  | "awaiting_approval"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "needs_clarification"
  | "cancelled";

export type StepStatus =
  | "planned"
  | "authorized"
  | "running"
  | "retrying"
  | "awaiting_approval"
  | "succeeded"
  | "approved"
  | "modified"
  | "rejected"
  | "failed"
  | "denied"
  | "skipped"
  | "cancelled";

export type StepOrigin = "explicit" | "router" | "keyword_router" | "handoff";

export type ApprovalItem = {
  item_id: string;
  label: string;
  proposal: Record<string, unknown>;
};

/** A backend write the frontend MAY perform after a human decision. Never executed by the AI service. */
export type CommitInstruction = {
  endpoint_id: BackendEndpointId;
  method: "POST" | "PATCH" | "PUT";
  path: string;
  body: Record<string, unknown>;
  /** Registry status of the endpoint ("proposed", "mocked", "available"…). */
  endpoint_status: string;
};

export type OrchestratorApproval = {
  approval_id: ApprovalId;
  step_id: string;
  capability: CapabilityId;
  mode: ApprovalMode;
  approver_roles: Role[];
  summary: string;
  items: ApprovalItem[];
  status: "pending" | "approved" | "modified" | "rejected" | "cancelled";
  commit_endpoint_id: BackendEndpointId | null;
  decided_by_hash: string | null;
  decided_at: IsoDateTime | null;
  decision: Record<string, unknown> | null;
  reviewed_output: Record<string, unknown> | null;
  commit_plan: CommitInstruction[];
};

export type StepRecord = {
  step_id: string;
  capability: CapabilityId;
  agent: AgentName | "unknown";
  origin: StepOrigin;
  subject_employee_id: EmployeeId | null;
  args: Record<string, string>;
  depends_on: string[];
  condition: { depends_on_step: string; output_field: string } | null;
  handoff_depth: number;
  handoff_payload: Record<string, unknown> | null;
  rationale: string | null;
  status: StepStatus;
  attempts: number;
  max_attempts: number;
  error: { code: ErrorCode; message: string; retryable: boolean } | null;
  summary: string | null;
  /** e.g. "GapInsightsResponse", "ManagerCoachingBrief", "ScoringRecommendationSet". */
  output_type: string | null;
  output: Record<string, unknown> | null;
  approval: OrchestratorApproval | null;
  started_at: IsoDateTime | null;
  finished_at: IsoDateTime | null;
};

export type ExecutionEventType =
  | "created"
  | "routed"
  | "clarification"
  | "step_authorized"
  | "step_denied"
  | "context_loaded"
  | "step_started"
  | "step_retry"
  | "step_succeeded"
  | "step_failed"
  | "step_skipped"
  | "approval_requested"
  | "approval_decided"
  | "handoff_executed"
  | "handoff_suggested"
  | "handoff_dropped"
  | "cancelled"
  | "completed";

export type ExecutionRecord = {
  execution_id: ExecutionId;
  tenant_id: TenantId;
  requested_by_hash: string;
  status: ExecutionStatus;
  request: OrchestrationRequest & { allow_handoffs: boolean; args: Record<string, string> };
  routing: {
    method: "explicit" | "llm" | "keyword_fallback";
    rationale: string | null;
    offered_capabilities: CapabilityId[];
  } | null;
  clarification: string | null;
  steps: StepRecord[];
  suggestions: Suggestion[];
  events: Array<{ at: IsoDateTime; type: ExecutionEventType; step_id: string | null; detail: string | null }>;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  completed_at: IsoDateTime | null;
};

export type OrchestratorApprovalDecision = {
  decision: "approve" | "reject" | "modify";
  items?: Array<{
    item_id: string;
    decision: "accepted" | "overridden";
    value?: number; // required when overridden (e.g. score 1..5)
    comment?: string;
  }>;
  comment?: string;
};

export type PendingApproval = {
  execution_id: ExecutionId;
  approval: OrchestratorApproval;
  requested_by_hash: string;
  created_at: IsoDateTime;
};

export type AgentSummary = {
  name: AgentName;
  title: string;
  description: string;
  capabilities: CapabilityStatus[];
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Coaching v1.2 (docs/ai/COACHING_AGENT.md §8) — additions pending review.    */
/* Mirrors ai-service/src/cfp_ai/agents/coaching/models.py and modes.py.       */
/* ────────────────────────────────────────────────────────────────────────── */

export type CoachingMode =
  | "career"
  | "leadership"
  | "performance"
  | "behavioural"
  | "technical_skills"
  | "communication"
  | "situational"
  | "role_play";

export type ConversationMode = Exclude<CoachingMode, "role_play">;

export type ModeInfo = {
  mode: CoachingMode;
  title: string;
  description: string;
  method: string;
  interaction: "conversation" | "role_play";
};

export type StartConversationRequest = {
  mode: ConversationMode;
  topic?: string | null; // ≤ 200
  focus_skill_ids?: SkillId[]; // ≤ 3, must be role skills in the mode's scope
  use_memory?: boolean; // default true; false = learner memory neither read nor written
};

export type CoachingStage = "goal" | "reality" | "options" | "way_forward" | "review";
export type CoachingMove =
  | "question"
  | "reflect"
  | "reframe"
  | "feedback"
  | "challenge"
  | "summarise"
  | "suggest_action";

export type TurnCoaching = {
  /** Always present and always contained in the assistant message. */
  reflective_question: string;
  coaching_move: CoachingMove;
  stage: CoachingStage;
  observations: Array<{ type: "strength" | "development_opportunity"; skill_id: SkillId | null; note: string }>;
  safety_flag: "none" | "wellbeing_concern" | "formal_complaint";
};

export type CoachingTurnResult = {
  user_message: CoachMessage;
  assistant_message: CoachMessage;
  suggested_actions: SuggestedAction[];
  coaching: TurnCoaching;
  conversation_status: "active" | "ended";
  turns_remaining: number;
};

export type CoachingConversation = {
  conversation_id: ConversationId;
  mode: CoachingMode;
  topic: string | null;
  status: "active" | "ended";
  stage: CoachingStage;
  use_memory: boolean;
  focus_skills: SkillTarget[];
  turn_count: number;
  created_at: IsoDateTime;
  ended_at: IsoDateTime | null;
  has_summary: boolean;
  messages: CoachMessage[]; // empty in list responses
};

export type AgreedAction = { action: string; timeframe: string; success_measure: string };

export type CoachingSummary = {
  conversation_id: ConversationId;
  mode: CoachingMode;
  summary: string;
  key_themes: string[];
  development_opportunities: Array<{ skill_id: SkillId | null; skill_name: string | null; description: string }>;
  agreed_actions: AgreedAction[];
  reflective_questions: string[];
  learning_recommendations: Array<{ catalogue_item_id: CatalogueItemId; title: string; kind: string; reason: string }>;
  memory_facts_saved: number;
  provenance: AiProvenance;
  disclaimer: string;
  created_at: IsoDateTime;
};

/** Line manager's view of a direct report's coaching: summaries only, never transcripts. */
export type ManagerSessionView = {
  kind: "conversation" | "role_play";
  id: string;
  mode: CoachingMode;
  title: string;
  status: string;
  started_at: IsoDateTime;
  ended_at: IsoDateTime | null;
  practice_score: number | null;
  key_themes: string[];
  agreed_actions: AgreedAction[];
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Development Plan v1.3 (docs/ai/DEVELOPMENT_PLAN_AGENT.md §8) — pending review. */
/* Mirrors ai-service/src/cfp_ai/agents/dev_plan/models.py and drafts/service.py. */
/* ────────────────────────────────────────────────────────────────────────── */

export type IdpEmployeeRef = {
  employee_id: EmployeeId;
  job_title: string | null;
  department: string | null;
  current_role_id: RoleId | null;
  /** The role the plan targets: the current role, or a target role for progression. */
  plan_role_id: RoleId;
  plan_role_title: string;
  role_profile_version: string;
};

/** An existing organisational learning resource used by the plan (resolved from the catalogue). */
export type IdpLearningResource = {
  catalogue_item_id: CatalogueItemId;
  title: string;
  kind: string;
  provider: string | null;
  duration_minutes: number | null;
};

export type IdpSuccessIndicator = { indicator_id: IndicatorId; level: Level; text: string };

export type IdpMilestone = {
  milestone_key: string;
  title: string;
  due_week: number;
  /** How achievement is measured. */
  measure: string;
  success_indicator_ids: IndicatorId[];
};

export type IdpEvidenceItem = {
  source: "verified_levels" | "self_assessment" | "assessment" | "coaching_practice" | "learning_history";
  skill_id: SkillId | null;
  detail: string;
};

/** current/target level, gap, priority and resources are computed from backend data and cannot be edited. */
export type IdpGoal = {
  goal_key: string;
  skill_id: SkillId;
  skill_name: string;
  category: SkillCategory;
  current_level: Level | null;
  current_level_source: "verified" | "assessment" | "self_assessed" | "none";
  target_level: Level;
  gap: number;
  priority: GapPriority;
  priority_rationale: string;
  objective: string;
  /** Learning (org catalogue), workplace assignments, coaching scenarios, mentoring, evidence. */
  interventions: PlanAction[];
  resources: IdpLearningResource[];
  milestones: IdpMilestone[];
  expected_outcomes: string[];
  success_indicators: IdpSuccessIndicator[];
  start_week: number;
  end_week: number;
};

/** Payload of a `development_plan` draft (v1.3; replaces DevelopmentPlanDraftPayload, pending review). */
export type IndividualDevelopmentPlan = {
  plan_type: "individual_development_plan";
  employee: IdpEmployeeRef;
  horizon_weeks: number;
  /** ISO date (YYYY-MM-DD). */
  start_date: string;
  end_date: string;
  development_objectives: string[];
  goals: IdpGoal[];
  weekly_learning_minutes: number;
  evidence_basis: IdpEvidenceItem[];
  rationale: string;
  validation: DraftValidationReport;
};

export type DraftReviewEvent = {
  at: IsoDateTime;
  action: "created" | "edit_proposed" | "accepted" | "edited" | "rejected" | "commit_reported" | "expired";
  actor_hash: string | null;
  version: number;
  note: string | null;
};

/** Every draft read returns this envelope. The frontend executes `commit_plan` after acceptance. */
export type DraftEnvelope<TKind extends DraftKind = DraftKind, TPayload = unknown> = {
  draft: Draft<TKind, TPayload>;
  version: number;
  review_history: DraftReviewEvent[];
  commit_plan: CommitInstruction[];
  can_resolve: boolean;
  can_propose_edits: boolean;
};

export type IdpDraftEnvelope = DraftEnvelope<"development_plan", IndividualDevelopmentPlan>;
export type PlanAdjustmentEnvelope = DraftEnvelope<"plan_adjustment", PlanAdjustmentPayload>;

export type ProposeDraftEditRequest = {
  payload: unknown;
  expected_version: number;
  note?: string | null;
};

export type ResolveDraftRequest = {
  decision: "accepted" | "edited" | "rejected";
  edited_payload?: unknown;
  reason?: string | null;
  expected_version?: number | null;
};

export type GoalProgressStatus = "achieved" | "on_track" | "at_risk" | "overdue" | "not_started";

export type GoalProgress = {
  goal_id: string;
  skill_id: SkillId;
  skill_name: string;
  from_level: Level;
  to_level: Level;
  current_verified_level: Level | null;
  status: GoalProgressStatus;
  progress_pct: number;
  /** Share of the goal's time window already elapsed. */
  expected_pct: number;
  actions_done: number;
  actions_total: number;
  overdue_actions: string[];
  completed_learning: string[];
};

export type PlanProgressReport = {
  plan_id: PlanId;
  employee_id: EmployeeId;
  generated_at: IsoDateTime;
  overall_progress_pct: number;
  goals: GoalProgress[];
  new_evidence: IdpEvidenceItem[];
  unavailable_context: ContextGap[];
};

export type PlanReviewResult = {
  progress: PlanProgressReport;
  /** null when no change is needed. */
  adjustment: PlanAdjustmentEnvelope | null;
  summary: string;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Talent Assessment v1.4 (docs/ai/TALENT_ASSESSMENT_AGENT.md §8) — pending review. */
/* Mirrors ai-service/src/cfp_ai/agents/talent/models.py and api/routes/talent.py. */
/* ────────────────────────────────────────────────────────────────────────── */

export type AssessmentMethod =
  | "competency_based"
  | "behavioural"
  | "situational_judgement"
  | "scenario_based"
  | "technical"
  | "leadership"
  | "self_assessment"
  | "manager_assessment";

export type AssessmentQuestionType =
  | "behavioural"
  | "situational_judgement"
  | "scenario"
  | "technical"
  | "self_rating"
  | "manager_rating";

export type AssessmentRespondent = "subject" | "manager" | "assessor";

export type AssessmentDesignRequest = {
  method?: AssessmentMethod; // default competency_based
  role_id?: RoleId | null;
  skill_ids?: SkillId[] | null; // max 6; must be role requirements when role_id is given
  target_level?: Level | null; // default: the role's required level
  questions_per_competency?: number; // 1..3, default 2
};

/** A framework indicator used as an evaluation criterion. */
export type EvaluationCriterion = { criterion_id: IndicatorId; skill_id: SkillId; level: Level; text: string };

/** A framework proficiency definition. */
export type RubricBand = { level: Level; label: string; descriptor: string; indicator_ids: IndicatorId[] };

export type CompetencyRubric = {
  skill_id: SkillId;
  skill_name: string;
  category: SkillCategory;
  target_level: Level;
  bands: RubricBand[];
  criteria: EvaluationCriterion[];
};

export type AssessmentQuestion = {
  question_key: string;
  type: AssessmentQuestionType;
  respondent: AssessmentRespondent;
  skill_id: SkillId;
  target_level: Level;
  prompt: string;
  /** Situational judgement only: keyed options (exactly one best, at least one poor). */
  options: { option_key: string; text: string; score: number; indicator_ids: IndicatorId[]; rationale: string }[] | null;
  expected_indicator_ids: IndicatorId[];
  look_fors: string[];
  model_answer_outline: string | null;
  feedback: { strong: string; developing: string };
  evidence_required: string;
  estimated_minutes: number;
};

/** Payload of an `assessment_items` draft. Competencies, bands and criteria are fixed (framework). */
export type AssessmentDesign = {
  design_type: "assessment_design";
  method: AssessmentMethod;
  title: string;
  objectives: string[];
  role_id: RoleId | null;
  role_profile_version: string | null;
  competencies: CompetencyRubric[];
  questions: AssessmentQuestion[];
  rating_scale: RubricBand[];
  scoring_method: string;
  evidence_policy: string;
  total_minutes: number;
  validation: DraftValidationReport;
};

export type CriterionJudgement = "met" | "partial" | "not_met" | "not_evidenced";

export type AssessmentEvidenceRef = {
  kind: "quote" | "keyed_option";
  response_item_id: ResponseItemId;
  respondent: AssessmentRespondent;
  item_type: string;
  quote: string | null; // verbatim (blinded) response text
  option_key: string | null;
  option_score: number | null;
  self_reported: boolean;
};

export type CriterionResult = {
  criterion_id: IndicatorId;
  level: Level;
  text: string;
  judgement: CriterionJudgement;
  evidence: AssessmentEvidenceRef[];
  basis: "ai_judgement" | "keyed_option" | "combined" | "none";
};

export type LevelResult = {
  level: Level;
  status: "demonstrated" | "partially" | "not_demonstrated" | "no_evidence";
  coverage: number;
};

/** A self/manager rating: compared with the evidence, never counted as evidence. */
export type RatingClaim = {
  respondent: AssessmentRespondent;
  response_item_id: ResponseItemId;
  rating: Level;
  alignment: "aligned" | "above_evidence" | "below_evidence" | "not_comparable";
};

export type CompetencyScore = {
  rubric_row_id: RubricRowId;
  skill_id: SkillId;
  skill_name: string;
  required_level: Level;
  /** null when the evidence demonstrates no assessed level: the assessor decides. */
  recommended_score: Level | null;
  determination: string;
  levels: LevelResult[];
  criteria: CriterionResult[];
  confidence: Confidence;
  rationale: string;
  evidence: ResponseQuote[];
  indicators_met: IndicatorId[];
  indicators_missing: IndicatorId[];
  gap: number | null;
  below_required: boolean;
  rating_claims: RatingClaim[];
  sufficient_evidence: boolean;
};

/** v1.4: replaces ScoringRecommendationSet (pending review). */
export type AssessmentEvaluation = {
  scoring_set_id: ScoringSetId;
  assessment_id: AssessmentId;
  assessment_type: "recruitment" | "promotion" | "development";
  rubric_version: string;
  blind: true;
  objectives: string[];
  methods: string[];
  scoring_rule: string;
  /** v1.8: names of suspected prompt-injection patterns found in responses; shown to the assessor, never auto-penalised. */
  integrity_warnings: string[];
  recommendations: CompetencyScore[];
  approval_policy: ApprovalPolicy;
  provenance: AiProvenance;
  disclaimer: string;
};

/** v1.8: security / governance audit events. Actors are hashed; no message text or personal data. */
export type AuditAction =
  | "approval_decided"
  | "draft_resolved"
  | "draft_commit_reported"
  | "assessment_scored"
  | "prompt_injection_suspected"
  | "rate_limited"
  | "subject_erased";

export type AuditEvent = {
  at: IsoDateTime;
  tenant_id: TenantId;
  actor_hash: string | null;
  action: AuditAction | (string & {});
  resource_type: string;
  resource: string | null;
  outcome: string;
  detail: string | null;
  request_id: string | null;
};

/** A scoring set and its assessor review (the review is an orchestrator approval). */
export type ScoringView = {
  execution_id: string;
  status: ExecutionStatus;
  evaluation: AssessmentEvaluation;
  review: OrchestratorApproval | null;
  follow_ups: { capability: CapabilityId; status: string; subject_employee_id: EmployeeId | null; summary: string | null }[];
  suggestions: Suggestion[];
};

export type AssessmentReportV14 = {
  report_type: "assessment_report";
  assessment_id: AssessmentId;
  assessment_type: string;
  title: string | null;
  subject: { type: string; id: string };
  objectives: string[];
  methods: string[];
  summary: string;
  competencies: {
    rubric_row_id: RubricRowId;
    skill_id: SkillId;
    skill_name: string;
    required_level: Level;
    confirmed_level: Level;
    score_source: string;
    gap: number;
    criteria_met: string[];
    criteria_missing: string[];
    evidence: ResponseQuote[];
    feedback: string;
  }[];
  strengths: string[];
  development_needs: { skill_id: SkillId; skill_name: string; gap: number; priority: GapPriority }[];
  development_recommendations: {
    skill_id: SkillId;
    recommendation: string;
    catalogue_item_ids: CatalogueItemId[];
    scenario_ids: ScenarioId[];
  }[];
  participant_feedback: string;
  evidence_basis: string;
  validation: DraftValidationReport;
};

export type AssessmentDesignEnvelope = DraftEnvelope<"assessment_items", AssessmentDesign>;
export type AssessmentReportEnvelope = DraftEnvelope<"assessment_report", AssessmentReportV14>;

/* ────────────────────────────────────────────────────────────────────────── */
/* Collaborative workflows v1.5 (docs/ai/WORKFLOWS.md §7) — pending review.    */
/* Mirrors ai-service/src/cfp_ai/workflows/models.py.                          */
/* ────────────────────────────────────────────────────────────────────────── */

export type WorkflowType = "assessment_to_development" | "personal_development" | "continuous_development";

export type WorkflowStatus =
  | "running"
  | "awaiting_input"
  | "completed"
  | "completed_with_warnings"
  | "failed"
  | "cancelled";

export type WorkflowStageStatus = "pending" | "running" | "awaiting" | "succeeded" | "failed" | "skipped";

/** Who may run a stage: anyone with access, the employee, an HR assessor, or the manager/HR (not the employee). */
export type WorkflowActor = "any" | "subject" | "assessor" | "approver";

export type WorkflowStage = {
  key: string;
  title: string;
  agent: "talent_assessment" | "dev_plan" | "coaching" | "system";
  actor: WorkflowActor;
  optional: boolean;
  status: WorkflowStageStatus;
  attempts: number;
  started_at: IsoDateTime | null;
  finished_at: IsoDateTime | null;
  summary: string | null;
  output: Record<string, unknown>;
  /** References that prevent duplicate actions (execution_id, draft_id, conversation_id, …). */
  refs: Record<string, string>;
  error: { code: string; message: string; retryable: boolean; retry_from: string | null } | null;
};

/** The checkpoint a workflow is waiting on, and who must act. */
export type WorkflowAwaiting = {
  stage: string;
  actor: "subject" | "assessor" | "approver" | "manager_or_hr";
  action: string;
  ref_type: "draft" | "scoring_set" | "assessment" | null;
  ref_id: string | null;
};

export type WorkflowEvent = {
  at: IsoDateTime;
  type: string;
  stage: string | null;
  actor_hash: string | null;
  detail: string | null;
};

export type WorkflowRecord = {
  workflow_id: string;
  type: WorkflowType;
  title: string;
  tenant_id: TenantId;
  subject_employee_id: EmployeeId;
  initiated_by_hash: string;
  inputs: Record<string, unknown>;
  status: WorkflowStatus;
  outcome: string | null;
  awaiting: WorkflowAwaiting | null;
  stages: WorkflowStage[];
  data: Record<string, unknown>;
  events: WorkflowEvent[];
  version: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  completed_at: IsoDateTime | null;
};

export type StartWorkflowRequest = {
  type: WorkflowType;
  subject_employee_id?: EmployeeId | null; // default: the caller
  assessment_id?: AssessmentId | null; // workflow A (required)
  objectives?: string[]; // workflow B
  focus_skill_ids?: SkillId[]; // workflow B
  horizon_weeks?: number | null;
};

export type WorkflowDefinition = {
  type: WorkflowType;
  title: string;
  description: string;
  stages: { key: string; title: string; agent: string; actor: WorkflowActor; optional: boolean; checkpoint: boolean }[];
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Frontend integration v1.7 (docs/ai/FRONTEND_INTEGRATION.md) — pending review. */
/* ────────────────────────────────────────────────────────────────────────── */

/** GET /v1/me/identity: the verified caller as the AI service sees it (no token data). */
export type AiIdentity = {
  tenant_id: TenantId;
  employee_id: EmployeeId | null;
  principal_type: "user" | "candidate" | "service";
  roles: Role[];
  entitlements: Entitlement[];
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Endpoint map (path → request/response).                                     */
/* `Stream<T>` = SSE response whose final `result` frame carries T.           */
/* `Accepted<T>` = 202 JobAccepted; Job<T>.result carries T on success.        */
/* ────────────────────────────────────────────────────────────────────────── */

export type Stream<T> = { kind: "stream"; result: T };
export type Accepted<T> = { kind: "job"; result: T };
export type NoBody = Record<string, never>;

export interface AiApiEndpoints {
  // Discovery & cross-cutting
  "GET /v1/capabilities": { request: NoBody; response: CapabilitiesResponse };
  "GET /v1/me/identity": { request: NoBody; response: AiIdentity };
  "GET /v1/jobs/{job_id}": { request: NoBody; response: Job<unknown> };
  "GET /v1/jobs/{job_id}/events": { request: NoBody; response: Stream<unknown> };
  "POST /v1/jobs/{job_id}/cancel": { request: NoBody; response: Job<unknown> };
  "GET /v1/drafts/{draft_id}": { request: NoBody; response: Draft<DraftKind, unknown> };
  "POST /v1/drafts/{draft_id}/resolution": {
    request: DraftResolutionRequest<unknown>;
    response: Draft<DraftKind, unknown>;
  };
  "POST /v1/drafts/{draft_id}/commit-report": {
    request: DraftCommitReport;
    response: Draft<DraftKind, unknown>;
  };
  "GET /v1/approvals?status=pending": { request: NoBody; response: Page<ApprovalRequest<unknown>> };
  "GET /v1/approvals/{approval_id}": { request: NoBody; response: ApprovalRequest<unknown> };
  "POST /v1/approvals/{approval_id}/decision": {
    request: ApprovalDecisionRequest<unknown>;
    response: ApprovalRequest<unknown>;
  };
  "GET /v1/suggestions": { request: NoBody; response: Page<Suggestion> };
  "POST /v1/suggestions/{suggestion_id}/dismiss": { request: NoBody; response: Suggestion };
  "POST /v1/feedback": { request: FeedbackRequest; response: { feedback_id: string } };
  "GET /v1/me/ai-data": { request: NoBody; response: MyAiDataExport };
  "GET /v1/me/learner-memory": { request: NoBody; response: LearnerMemoryFact[] };
  "DELETE /v1/me/learner-memory/{fact_id}": { request: NoBody; response: NoBody };

  // Coaching Agent
  "GET /v1/coaching/scenarios": { request: ListScenariosQuery; response: Page<CoachScenario> };
  "GET /v1/coaching/scenarios/{scenario_id}": { request: NoBody; response: CoachScenario | CoachScenarioAdmin };
  "GET /v1/coaching/scenarios/recommended": {
    request: { limit?: number };
    response: ScenarioRecommendationsResponse;
  };
  "POST /v1/coaching/scenarios/drafts": { request: ScenarioDraftRequest; response: Accepted<ScenarioDraft> };
  "POST /v1/coaching/scenarios": { request: PublishScenarioRequest; response: CoachScenarioAdmin };
  "PATCH /v1/coaching/scenarios/{scenario_id}": { request: UpdateScenarioRequest; response: CoachScenarioAdmin };
  "POST /v1/coaching/sessions": { request: CreateCoachSessionRequest; response: CoachSession };
  "GET /v1/coaching/sessions": { request: ListCoachSessionsQuery; response: Page<CoachSessionSummary> };
  "GET /v1/coaching/sessions/{session_id}": { request: NoBody; response: CoachSession };
  "POST /v1/coaching/sessions/{session_id}/messages": {
    request: SendCoachMessageRequest;
    response: Stream<CoachTurnResult>;
  };
  /** v1.2: synchronous for now (was a 202 job); moves to the job queue with the worker work. */
  "POST /v1/coaching/sessions/{session_id}/end": {
    request: EndCoachSessionRequest | NoBody;
    response: SessionEvaluation;
  };
  "GET /v1/coaching/sessions/{session_id}/evaluation": { request: NoBody; response: SessionEvaluation };
  "GET /v1/coaching/metrics/me": { request: NoBody; response: CoachMetrics };
  // v1.2 (pending review): conversations take a coaching mode and return structured turns + summaries.
  "GET /v1/coaching/modes": { request: NoBody; response: ModeInfo[] };
  "POST /v1/coaching/conversations": { request: StartConversationRequest; response: CoachingConversation };
  "GET /v1/coaching/conversations": { request: NoBody; response: CoachingConversation[] };
  "GET /v1/coaching/conversations/{conversation_id}": { request: NoBody; response: CoachingConversation };
  "POST /v1/coaching/conversations/{conversation_id}/messages": {
    request: SendConversationMessageRequest;
    response: Stream<CoachingTurnResult>;
  };
  "POST /v1/coaching/conversations/{conversation_id}/end": { request: NoBody; response: CoachingSummary };
  "GET /v1/coaching/conversations/{conversation_id}/summary": { request: NoBody; response: CoachingSummary };
  "DELETE /v1/coaching/conversations/{conversation_id}": { request: NoBody; response: NoBody };
  "DELETE /v1/coaching/sessions/{session_id}": { request: NoBody; response: NoBody };
  "GET /v1/coaching/team/{employee_id}/activity": { request: NoBody; response: ManagerSessionView[] };
  "POST /v1/coaching/manager-briefs": { request: ManagerBriefRequest; response: ManagerCoachingBrief };

  // Development Plan Agent
  "POST /v1/dev-plans/drafts": {
    request: DevelopmentPlanDraftRequest;
    response: Accepted<DevelopmentPlanDraft>;
  };
  "GET /v1/dev-plans/gaps/{employee_id}": { request: NoBody; response: GapInsightsResponse };
  "GET /v1/dev-plans/recommendations/learning": {
    request: LearningRecommendationsQuery;
    response: LearningRecommendationsResponse;
  };
  "POST /v1/dev-plans/plans/{plan_id}/review": {
    request: PlanReviewRequest;
    response: Accepted<PlanAdjustmentDraft>;
  };
  // v1.3 (pending review): synchronous drafts with a review envelope; progress tracking.
  "POST /v1/dev-plans/drafts (v1.3)": { request: DevelopmentPlanDraftRequest; response: IdpDraftEnvelope };
  "GET /v1/dev-plans/plans/{plan_id}/progress": { request: NoBody; response: PlanProgressReport };
  "POST /v1/dev-plans/plans/{plan_id}/review (v1.3)": { request: PlanReviewRequest; response: PlanReviewResult };
  "POST /v1/dev-plans/cohort-drafts": {
    request: CohortPathwayRequest;
    response: Accepted<CohortPathwayDraft>;
  };
  "GET /v1/dev-plans/manager-recommendations/{employee_id}": {
    request: NoBody;
    response: ManagerRecommendationsResponse;
  };

  // Draft review (v1.3, pending review)
  "GET /v1/drafts": { request: { subject_employee_id?: EmployeeId; status?: DraftStatus }; response: DraftEnvelope[] };
  "GET /v1/drafts/{draft_id} (v1.3)": { request: NoBody; response: DraftEnvelope };
  "PATCH /v1/drafts/{draft_id}": { request: ProposeDraftEditRequest; response: DraftEnvelope };
  "POST /v1/drafts/{draft_id}/resolution (v1.3)": { request: ResolveDraftRequest; response: DraftEnvelope };
  "POST /v1/drafts/{draft_id}/commit-report (v1.3)": { request: DraftCommitReport; response: DraftEnvelope };

  // Talent Assessment Agent
  "POST /v1/talent/item-drafts": { request: ItemDraftRequest; response: Accepted<AssessmentItemsDraft> };
  "POST /v1/talent/roleplays": { request: StartRoleplayRequest; response: RoleplaySession };
  "GET /v1/talent/roleplays/{roleplay_id}": { request: NoBody; response: RoleplaySession };
  "POST /v1/talent/roleplays/{roleplay_id}/messages": {
    request: SendRoleplayMessageRequest;
    response: Stream<RoleplayTurnResult>;
  };
  "POST /v1/talent/roleplays/{roleplay_id}/submit": { request: NoBody; response: RoleplaySubmitResult };
  "POST /v1/talent/assessments/{assessment_id}/scoring": {
    request: ScoringRequest;
    response: Accepted<ScoringRecommendationSet>;
  };
  "GET /v1/talent/scoring-sets/{scoring_set_id}": { request: NoBody; response: ScoringRecommendationSet };
  "POST /v1/talent/scoring-sets/{scoring_set_id}/reviews": {
    request: ScoreReviewRequest;
    response: ScoringRecommendationSet;
  };
  "POST /v1/talent/assessments/{assessment_id}/report-drafts": {
    request: NoBody;
    response: Accepted<AssessmentReportDraft>;
  };
  "POST /v1/talent/evidence/{evidence_id}/analysis": {
    request: EvidenceAnalysisRequest;
    response: EvidenceAnalysis;
  };
  "POST /v1/talent/insights/messages": { request: InsightsTurnRequest; response: Stream<InsightsTurnResult> };
  // v1.4 (pending review): multi-method design, evidence-based scoring with assessor review, reports.
  "POST /v1/talent/item-drafts (v1.4)": { request: AssessmentDesignRequest; response: AssessmentDesignEnvelope };
  "POST /v1/talent/assessments/{assessment_id}/scoring (v1.4)": { request: ScoringRequest; response: ScoringView };
  "GET /v1/talent/scoring-sets/{scoring_set_id} (v1.4)": { request: NoBody; response: ScoringView };
  "POST /v1/talent/scoring-sets/{scoring_set_id}/reviews (v1.4)": {
    request: OrchestratorApprovalDecision;
    response: ScoringView;
  };
  "POST /v1/talent/assessments/{assessment_id}/report-drafts (v1.4)": {
    request: NoBody;
    response: AssessmentReportEnvelope;
  };

  // Orchestrator (pending review)
  "GET /v1/orchestrator/agents": { request: NoBody; response: AgentSummary[] };
  "POST /v1/orchestrator/executions": { request: OrchestrationRequest; response: ExecutionRecord };
  "GET /v1/orchestrator/executions": {
    request: { status?: ExecutionStatus; limit?: number };
    response: Page<ExecutionRecord>;
  };
  "GET /v1/orchestrator/executions/{execution_id}": { request: NoBody; response: ExecutionRecord };
  "POST /v1/orchestrator/executions/{execution_id}/approvals/{approval_id}/decision": {
    request: OrchestratorApprovalDecision;
    response: ExecutionRecord;
  };
  "POST /v1/orchestrator/executions/{execution_id}/cancel": { request: NoBody; response: ExecutionRecord };
  "GET /v1/orchestrator/approvals": { request: NoBody; response: PendingApproval[] };

  // Collaborative workflows (v1.5, pending review). Start returns 201, or 200 with the active workflow.
  "GET /v1/workflows/definitions": { request: NoBody; response: WorkflowDefinition[] };
  "POST /v1/workflows": { request: StartWorkflowRequest; response: WorkflowRecord };
  "GET /v1/workflows": {
    request: { subject_employee_id?: EmployeeId; status?: WorkflowStatus };
    response: WorkflowRecord[];
  };
  "GET /v1/workflows/{workflow_id}": { request: NoBody; response: WorkflowRecord };
  "GET /v1/workflows/{workflow_id}/events": { request: NoBody; response: WorkflowEvent[] };
  "POST /v1/workflows/{workflow_id}/advance": { request: NoBody; response: WorkflowRecord };
  "POST /v1/workflows/{workflow_id}/retry": { request: NoBody; response: WorkflowRecord };
  "POST /v1/workflows/{workflow_id}/cancel": { request: NoBody; response: WorkflowRecord };

  // Audit trail (v1.8, pending review). hr_ld_admin / platform_super_admin only; tenant-scoped.
  "GET /v1/audit/events": { request: { action?: AuditAction; limit?: number }; response: AuditEvent[] };

  // Platform console
  "GET /v1/admin/health": { request: NoBody; response: AdminHealthResponse };
  "GET /v1/admin/metrics": { request: { from?: IsoDateTime; to?: IsoDateTime }; response: AdminMetricsResponse };
}

export type AiEndpointKey = keyof AiApiEndpoints;
export type AiRequest<K extends AiEndpointKey> = AiApiEndpoints[K]["request"];
export type AiResponse<K extends AiEndpointKey> = AiApiEndpoints[K]["response"];
