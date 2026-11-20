import type {
  AgentSummary,
  AiIdentity,
  AssessmentDesignEnvelope,
  AssessmentDesignRequest,
  AssessmentReportEnvelope,
  CapabilitiesResponse,
  CoachingConversation,
  CoachingSummary,
  CoachingTurnResult,
  CoachMetrics,
  CoachScenario,
  CoachSession,
  CoachSessionSummary,
  CoachTurnResult,
  CommittedRef,
  DevelopmentPlanDraftRequest,
  DraftEnvelope,
  DraftStatus,
  EmployeeId,
  ExecutionRecord,
  GapInsightsResponse,
  IdpDraftEnvelope,
  LearningRecommendationsResponse,
  ModeInfo,
  OrchestrationRequest,
  OrchestratorApprovalDecision,
  Page,
  PlanProgressReport,
  PlanReviewResult,
  PlanReviewTrigger,
  ResolveDraftRequest,
  ScenarioRecommendationsResponse,
  ScoringRequest,
  ScoringView,
  SessionEvaluation,
  StartConversationRequest,
  StartWorkflowRequest,
  Suggestion,
  WorkflowDefinition,
  WorkflowRecord,
} from "@ai/contracts";

/** Called with each streamed text fragment while a reply is generated. */
export type DeltaHandler = (text: string) => void;

/**
 * Typed client for the AI service (AI_API_SPEC.md). Implemented over HTTP via the
 * same-origin BFF (`/api/ai/*`), and by an isolated mock for local development.
 */
export interface AiClient {
  readonly mode: "live" | "mock";

  // ── capability centre ──
  getIdentity(): Promise<AiIdentity>;
  getCapabilities(): Promise<CapabilitiesResponse>;
  listAgents(): Promise<AgentSummary[]>;
  listSuggestions(): Promise<Page<Suggestion>>;
  dismissSuggestion(suggestionId: string): Promise<Suggestion>;
  runOrchestration(request: OrchestrationRequest): Promise<ExecutionRecord>;
  listExecutions(): Promise<Page<ExecutionRecord>>;
  getExecution(executionId: string): Promise<ExecutionRecord>;
  listWorkflowDefinitions(): Promise<WorkflowDefinition[]>;
  listWorkflows(): Promise<WorkflowRecord[]>;
  startWorkflow(request: StartWorkflowRequest, idempotencyKey?: string): Promise<WorkflowRecord>;
  advanceWorkflow(workflowId: string): Promise<WorkflowRecord>;
  retryWorkflow(workflowId: string): Promise<WorkflowRecord>;
  cancelWorkflow(workflowId: string): Promise<WorkflowRecord>;

  // ── coaching ──
  listModes(): Promise<ModeInfo[]>;
  listConversations(): Promise<CoachingConversation[]>;
  startConversation(request: StartConversationRequest): Promise<CoachingConversation>;
  getConversation(conversationId: string): Promise<CoachingConversation>;
  sendConversationMessage(
    conversationId: string,
    text: string,
    clientMessageId: string,
    onDelta?: DeltaHandler,
  ): Promise<CoachingTurnResult>;
  endConversation(conversationId: string): Promise<CoachingSummary>;
  getConversationSummary(conversationId: string): Promise<CoachingSummary>;
  listScenarios(): Promise<CoachScenario[]>;
  recommendedScenarios(): Promise<ScenarioRecommendationsResponse>;
  startSession(scenarioId: string): Promise<CoachSession>;
  listSessions(): Promise<CoachSessionSummary[]>;
  getSession(sessionId: string): Promise<CoachSession>;
  sendSessionMessage(
    sessionId: string,
    text: string,
    clientMessageId: string,
    onDelta?: DeltaHandler,
  ): Promise<CoachTurnResult>;
  endSession(sessionId: string): Promise<SessionEvaluation>;
  getEvaluation(sessionId: string): Promise<SessionEvaluation>;
  getCoachMetrics(): Promise<CoachMetrics>;

  // ── training plans ──
  getGaps(employeeId: EmployeeId): Promise<GapInsightsResponse>;
  getLearningRecommendations(query: {
    employeeId?: EmployeeId;
    skillId?: string;
    limit?: number;
  }): Promise<LearningRecommendationsResponse>;
  draftPlan(request: DevelopmentPlanDraftRequest): Promise<IdpDraftEnvelope>;
  listDrafts(query?: { subjectEmployeeId?: EmployeeId; status?: DraftStatus }): Promise<DraftEnvelope[]>;
  getDraft(draftId: string): Promise<DraftEnvelope>;
  resolveDraft(draftId: string, request: ResolveDraftRequest): Promise<DraftEnvelope>;
  reportCommit(draftId: string, committedRef: CommittedRef): Promise<DraftEnvelope>;
  getPlanProgress(planId: string): Promise<PlanProgressReport>;
  reviewPlan(planId: string, trigger: PlanReviewTrigger): Promise<PlanReviewResult>;

  // ── talent assessment ──
  designAssessment(request: AssessmentDesignRequest): Promise<AssessmentDesignEnvelope>;
  scoreAssessment(assessmentId: string, request: ScoringRequest): Promise<ScoringView>;
  getScoringSet(scoringSetId: string): Promise<ScoringView>;
  reviewScoringSet(scoringSetId: string, decision: OrchestratorApprovalDecision): Promise<ScoringView>;
  draftAssessmentReport(assessmentId: string): Promise<AssessmentReportEnvelope>;
}

/** Client-generated idempotency/message IDs (the service de-duplicates on them). */
export function newClientId(prefix = "cm"): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}
