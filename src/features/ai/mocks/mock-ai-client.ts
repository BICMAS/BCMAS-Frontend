/**
 * LOCAL DEVELOPMENT ONLY — an in-memory stand-in for the AI service.
 *
 * Selected only when NEXT_PUBLIC_AI_MODE=mock outside production, and loaded via a dynamic
 * import so it never ships in the production bundle. It mirrors the AI service contract
 * (docs/ai/contracts/ai-contracts.ts) closely enough to develop and test every screen
 * without the service running. It is not a source of truth for anything.
 */
import type {
  AgentSummary,
  AiIdentity,
  AiProvenance,
  AssessmentDesign,
  AssessmentDesignEnvelope,
  AssessmentQuestion,
  CompetencyRubric,
  CvAnalysis,
  CvSkillEvidence,
  InterviewQuestionScore,
  InterviewScoring,
  AssessmentEvaluation,
  AssessmentReportEnvelope,
  CapabilityId,
  CapabilityStatus,
  CoachingConversation,
  CoachingSummary,
  CoachingTurnResult,
  CoachMessage,
  CoachScenario,
  CoachSession,
  CoachSessionSummary,
  CoachTurnResult,
  CompetencyScore,
  DraftEnvelope,
  DraftStatus,
  ExecutionRecord,
  GapInsight,
  IdpDraftEnvelope,
  IndividualDevelopmentPlan,
  LearningRecommendation,
  ModeInfo,
  OrchestratorApproval,
  PlanProgressReport,
  ScoringView,
  SessionEvaluation,
  Suggestion,
  WorkflowDefinition,
  WorkflowRecord,
} from "@ai/contracts";

import { useSessionStore } from "@/stores/session-store";

import type { AiClient, DeltaHandler } from "../api/client";
import { AiApiError } from "../api/errors";

type Persona = { employeeId: string | null; roles: AiIdentity["roles"]; tenant: string };

const PERSONAS: Record<string, Persona> = {
  "user-james": { employeeId: "emp-8721", roles: ["employee"], tenant: "org-gec" },
  "user-michael": { employeeId: "emp-1001", roles: ["line_manager"], tenant: "org-gec" },
  "user-priya": { employeeId: "emp-5001", roles: ["hr_ld_admin"], tenant: "org-gec" },
  "user-sarah": { employeeId: "emp-2002", roles: ["organisation_admin"], tenant: "org-gec" },
  "user-alex": { employeeId: null, roles: ["platform_super_admin"], tenant: "org-gec" },
};

let counter = 0;
const nextId = (prefix: string) => `${prefix}_01MOCK${String(++counter).padStart(20, "0")}`;
const now = () => new Date().toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function provenance(capability: CapabilityId, model = "mock-model"): AiProvenance {
  return {
    capability,
    model,
    prompt_version: "mock@v1",
    generated_at: now(),
    context_as_of: now(),
    citations: [],
    unavailable_context: [],
  };
}

/** The framework role profiles the AI service mock backend knows (mirrors ai-service mock data). */
const FRAMEWORK_ROLES: Record<
  string,
  {
    title: string;
    version: string;
    requirements: Array<{ skill_id: string; skill_name: string; required_level: number; category: "technical" | "behavioural" }>;
  }
> = {
  "role-ssa": {
    title: "Senior Solutions Architect",
    version: "3",
    requirements: [
      { skill_id: "skl-cloud", skill_name: "Cloud Infrastructure Design", required_level: 4, category: "technical" },
      { skill_id: "skl-api-gov", skill_name: "API Governance", required_level: 4, category: "technical" },
      { skill_id: "skl-microservices", skill_name: "Microservices Design", required_level: 4, category: "technical" },
      { skill_id: "skl-influence", skill_name: "Strategic Influence", required_level: 5, category: "behavioural" },
    ],
  },
  "role-lde": {
    title: "Lead Data Engineer",
    version: "1",
    requirements: [
      { skill_id: "skl-cloud", skill_name: "Cloud Infrastructure Design", required_level: 3, category: "technical" },
      { skill_id: "skl-microservices", skill_name: "Microservices Design", required_level: 3, category: "technical" },
      { skill_id: "skl-api-gov", skill_name: "API Governance", required_level: 2, category: "technical" },
    ],
  },
};
const LEVEL_LABELS = ["Foundation", "Developing", "Proficient", "Advanced", "Expert"];

const MODES: ModeInfo[] = [
  ["career", "Career coaching", "Explore direction and next steps.", "GROW"],
  ["leadership", "Leadership coaching", "Grow how you lead people and change.", "GROW + SBI"],
  ["performance", "Performance coaching", "Make progress on goals in your role.", "GROW"],
  ["behavioural", "Behavioural coaching", "Reflect on behaviour and impact.", "STAR / SBI"],
  ["technical_skills", "Technical skills coaching", "Plan deliberate practice on technical skills.", "Deliberate practice"],
  ["communication", "Communication coaching", "Prepare messages for an audience.", "Audience-first"],
  ["situational", "Situational coaching", "Think through a specific situation.", "Options & consequences"],
  ["role_play", "Interactive role-play", "Rehearse a realistic conversation.", "Simulation + feedback"],
].map(([mode, title, description, method]) => ({
  mode: mode as ModeInfo["mode"],
  title: title!,
  description: description!,
  method: method!,
  interaction: mode === "role_play" ? "role_play" : "conversation",
}));

const SCENARIOS: CoachScenario[] = [
  {
    scenario_id: "sc_01JDSEED000000000000000001",
    version: 1,
    title: "Data Retention Briefing with the CPO",
    description: "Defend an API data-retention approach to a privacy-focused executive.",
    category: "role",
    difficulty: "advanced",
    estimated_minutes: 15,
    target_skills: [{ skill_id: "skl-api-gov", skill_name: "API Governance", target_level: 4, level_label: "Advanced" }],
    persona: { name: "Dana Okafor", role: "Chief Privacy Officer", avatar_url: "/coach/amara.jpg" },
    opening: "I've read the proposal. How long will customer data exposed through the partner API be kept?",
    status: "published",
    updated_at: now(),
  },
  {
    scenario_id: "sc_01JDSEED000000000000000002",
    version: 1,
    title: "Cloud Cost Review",
    description: "Lead an engineering lead through cutting multi-cloud waste.",
    category: "technical",
    difficulty: "intermediate",
    estimated_minutes: 20,
    target_skills: [{ skill_id: "skl-cloud", skill_name: "Cloud Infrastructure Design", target_level: 4, level_label: "Advanced" }],
    persona: { name: "Sam Patel", role: "Engineering Lead", avatar_url: null },
    opening: "Our cloud bill rose 18% this quarter. Where would you start?",
    status: "published",
    updated_at: now(),
  },
];

const GAPS: GapInsight[] = [
  {
    skill_id: "skl-api-gov",
    skill_name: "API Governance",
    category: "technical",
    required_level: 4,
    verified_level: null,
    self_assessed_level: 2,
    gap: 4,
    priority: "critical",
    why_it_matters: "The role sets API standards for customer-facing platforms.",
    priority_rationale: "No verified level against a level 4 requirement.",
    citations: [],
  },
  {
    skill_id: "skl-influence",
    skill_name: "Strategic Influence",
    category: "behavioural",
    required_level: 5,
    verified_level: 3,
    self_assessed_level: 3,
    gap: 2,
    priority: "critical",
    why_it_matters: "Architects shape executive technology decisions.",
    priority_rationale: "Two levels below the requirement.",
    citations: [],
  },
  {
    skill_id: "skl-microservices",
    skill_name: "Microservices Design",
    category: "technical",
    required_level: 4,
    verified_level: 3,
    self_assessed_level: 4,
    gap: 1,
    priority: "medium",
    why_it_matters: "Service design decisions affect platform reliability.",
    priority_rationale: "One level below the requirement.",
    citations: [],
  },
];

const LEARNING: LearningRecommendation[] = [
  ["cat-api-gov-2024", "Advanced API Governance & Ethics 2024", "e_learning", "skl-api-gov", 720],
  ["cat-influence-masterclass", "Strategic Influence Masterclass", "workshop", "skl-influence", 120],
  ["cat-microservices-patterns", "Microservices Failure Patterns", "e_learning", "skl-microservices", 120],
].map(([id, title, kind, skill, minutes]) => ({
  catalogue_item_id: id as string,
  title: title as string,
  kind: kind as string,
  provider: "Internal",
  duration_minutes: minutes as number,
  skill_id: skill as string,
  target_level: 4,
  fit_reason: `Organisational resource for ${title as string}.`,
  citations: [],
}));

export class MockAiClient implements AiClient {
  readonly mode = "mock" as const;
  private readonly latency: number;
  private readonly persona: () => Persona;
  private conversations = new Map<string, CoachingConversation>();
  private summaries = new Map<string, CoachingSummary>();
  private sessions = new Map<string, CoachSession>();
  private evaluations = new Map<string, SessionEvaluation>();
  private drafts = new Map<string, DraftEnvelope>();
  private executions: ExecutionRecord[] = [];
  private workflows: WorkflowRecord[] = [];
  private scoring = new Map<string, ScoringView>();
  private suggestions: Suggestion[] = [
    {
      suggestion_id: "sug_01MOCK0000000000000000000001",
      kind: "practice_scenario",
      subject_employee_id: "emp-8721",
      title: "Practise: Data Retention Briefing with the CPO",
      detail: "Coaching practice for API Governance, your highest-priority gap.",
      source_handoff: "dev_plan.practice_needed",
      ref_id: "sc_01JDSEED000000000000000001",
      status: "pending",
      created_at: now(),
    },
  ];

  constructor(options: { latencyMs?: number; userId?: () => string } = {}) {
    this.latency = options.latencyMs ?? 250;
    const userId = options.userId ?? (() => useSessionStore.getState().userId);
    this.persona = () => PERSONAS[userId()] ?? PERSONAS["user-james"]!;
  }

  private async wait<T>(value: T): Promise<T> {
    if (this.latency > 0) await new Promise((resolve) => setTimeout(resolve, this.latency));
    return structuredClone(value);
  }

  private fail(code: "not_found" | "forbidden" | "invalid_request", message: string): never {
    throw new AiApiError(code, message, { status: code === "not_found" ? 404 : code === "forbidden" ? 403 : 400 });
  }

  private async streamText(text: string, onDelta?: DeltaHandler) {
    for (const word of text.split(" ")) {
      onDelta?.(`${word} `);
      if (this.latency > 0) await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  private isManagerOrHr() {
    const roles = this.persona().roles;
    return roles.includes("line_manager") || roles.includes("hr_ld_admin");
  }

  // ── capability centre ──────────────────────────────────────────────────

  getIdentity = () => {
    const p = this.persona();
    return this.wait<AiIdentity>({
      tenant_id: p.tenant,
      employee_id: p.employeeId,
      principal_type: "user",
      roles: p.roles,
      entitlements: ["ai_coaching", "ai_dev_plans", "ai_talent_assessment"],
    });
  };

  private capabilities(): CapabilityStatus[] {
    const hr = this.persona().roles.includes("hr_ld_admin");
    const rows: Array<[CapabilityId, AgentSummary["name"], boolean]> = [
      ["coaching.conversation_turn", "coaching", true],
      ["coaching.roleplay_turn", "coaching", true],
      ["coaching.recommend_scenarios", "coaching", true],
      ["dev_plan.explain_gaps", "dev_plan", true],
      ["dev_plan.recommend_learning", "dev_plan", true],
      ["dev_plan.draft_plan", "dev_plan", true],
      ["dev_plan.review_plan", "dev_plan", true],
      ["talent.recommend_scores", "talent_assessment", hr],
      ["talent.draft_items", "talent_assessment", hr],
      ["talent.draft_report", "talent_assessment", hr || this.isManagerOrHr()],
      ["talent.analyze_cv", "talent_assessment", hr],
      ["talent.score_interview", "talent_assessment", hr],
    ];
    return rows.map(([capability, agent, ok]) => ({
      capability,
      agent,
      availability: ok ? "available" : "unavailable",
      reasons: ok ? [] : ["role_not_permitted"],
      missing_backend_endpoints: [],
    }));
  }

  getCapabilities = () =>
    this.wait({ contract_version: "1.0.0-rc.1" as const, tenant_id: this.persona().tenant, capabilities: this.capabilities() });

  listAgents = () => {
    const caps = this.capabilities();
    const agents: AgentSummary[] = [
      ["coaching", "AI Coaching Agent", "Guided coaching conversations, role-play practice and feedback."],
      ["dev_plan", "AI Training & Development Plan Agent", "Gap analysis, learning recommendations and IDPs."],
      ["talent_assessment", "AI Talent Assessment Agent", "Assessment design and evidence-based scoring."],
    ].map(([name, title, description]) => ({
      name: name as AgentSummary["name"],
      title: title!,
      description: description!,
      capabilities: caps.filter((c) => c.agent === name),
    }));
    return this.wait(agents);
  };

  listSuggestions = () =>
    this.wait({ items: this.suggestions.filter((s) => s.status === "pending"), next_cursor: null });

  dismissSuggestion = (id: string) => {
    const found = this.suggestions.find((s) => s.suggestion_id === id);
    if (!found) this.fail("not_found", "The suggestion was not found.");
    found.status = "dismissed";
    return this.wait(found);
  };

  runOrchestration: AiClient["runOrchestration"] = async (request) => {
    const capability: CapabilityId = request.capability ?? "dev_plan.explain_gaps";
    const record: ExecutionRecord = {
      execution_id: nextId("exe") as ExecutionRecord["execution_id"],
      tenant_id: this.persona().tenant,
      requested_by_hash: "mock",
      status: "succeeded",
      request: { ...request, allow_handoffs: request.allow_handoffs ?? true, args: request.args ?? {} },
      routing: { method: request.capability ? "explicit" : "llm", rationale: "Matched your request.", offered_capabilities: [] },
      clarification: null,
      steps: [
        {
          step_id: "st_1",
          capability,
          agent: capability.split(".")[0] === "talent" ? "talent_assessment" : (capability.split(".")[0] as "coaching" | "dev_plan"),
          origin: request.capability ? "explicit" : "router",
          subject_employee_id: this.persona().employeeId,
          args: request.args ?? {},
          depends_on: [],
          condition: null,
          handoff_depth: 0,
          handoff_payload: null,
          rationale: null,
          status: "succeeded",
          attempts: 1,
          max_attempts: 2,
          error: null,
          summary: `${GAPS.length} skill gap(s) explained; API Governance is the highest priority.`,
          output_type: "GapInsightsResponse",
          output: null,
          approval: null,
          started_at: now(),
          finished_at: now(),
        },
      ],
      suggestions: [],
      events: [{ at: now(), type: "created", step_id: null, detail: null }, { at: now(), type: "completed", step_id: null, detail: "succeeded" }],
      created_at: now(),
      updated_at: now(),
      completed_at: now(),
    };
    this.executions.unshift(record);
    return this.wait(record);
  };

  listExecutions = () => this.wait({ items: this.executions, next_cursor: null });

  getExecution = (id: string) => {
    const found = this.executions.find((e) => e.execution_id === id);
    if (!found) this.fail("not_found", "The execution was not found.");
    return this.wait(found);
  };

  listWorkflowDefinitions = () =>
    this.wait<WorkflowDefinition[]>([
      { type: "assessment_to_development", title: "Capability assessment to development", description: "Assessment → gaps → IDP → approval → coaching.", stages: [] },
      { type: "personal_development", title: "Personal development", description: "Profile → gaps → learning → plan → coaching → progress.", stages: [] },
      { type: "continuous_development", title: "Continuous development", description: "History → progress → remaining gaps → reassessment.", stages: [] },
    ]);

  listWorkflows = () => this.wait(this.workflows);

  startWorkflow: AiClient["startWorkflow"] = async (request) => {
    const existing = this.workflows.find((w) => w.type === request.type && !["completed", "cancelled"].includes(w.status));
    if (existing) return this.wait(existing);
    const record: WorkflowRecord = {
      workflow_id: nextId("wf"),
      type: request.type,
      title: request.type.replace(/_/g, " "),
      tenant_id: this.persona().tenant,
      subject_employee_id: request.subject_employee_id ?? this.persona().employeeId ?? "emp-8721",
      initiated_by_hash: "mock",
      inputs: {},
      status: "awaiting_input",
      outcome: null,
      awaiting: { stage: "plan_approval", actor: "manager_or_hr", action: "Review and approve the development plan", ref_type: null, ref_id: null },
      stages: ["profile", "objectives", "analyse_gaps", "recommend_learning", "generate_plan", "plan_approval"].map((key, i) => ({
        key,
        title: key.replace(/_/g, " "),
        agent: i < 2 ? "system" : "dev_plan",
        actor: "any",
        optional: key === "recommend_learning",
        status: key === "plan_approval" ? "awaiting" : "succeeded",
        attempts: key === "plan_approval" ? 0 : 1,
        started_at: now(),
        finished_at: key === "plan_approval" ? null : now(),
        summary: key === "plan_approval" ? null : `${key.replace(/_/g, " ")} done.`,
        output: {},
        refs: {},
        error: null,
      })),
      data: {},
      events: [{ at: now(), type: "started", stage: null, actor_hash: "mock", detail: request.type }],
      version: 1,
      created_at: now(),
      updated_at: now(),
      completed_at: null,
    };
    this.workflows.unshift(record);
    return this.wait(record);
  };

  private workflow(id: string) {
    const found = this.workflows.find((w) => w.workflow_id === id);
    if (!found) this.fail("not_found", "The workflow was not found.");
    return found;
  }

  advanceWorkflow = (id: string) => this.wait(this.workflow(id));
  retryWorkflow = (id: string) => this.wait(this.workflow(id));
  cancelWorkflow = (id: string) => {
    const found = this.workflow(id);
    found.status = "cancelled";
    found.awaiting = null;
    return this.wait(found);
  };

  // ── coaching ───────────────────────────────────────────────────────────

  listModes = () => this.wait(MODES);
  listConversations = () => this.wait([...this.conversations.values()].map((c) => ({ ...c, messages: [] })));

  startConversation: AiClient["startConversation"] = async (request) => {
    const mode = MODES.find((m) => m.mode === request.mode)!;
    const conversation: CoachingConversation = {
      conversation_id: nextId("cv") as CoachingConversation["conversation_id"],
      mode: request.mode,
      topic: request.topic ?? null,
      status: "active",
      stage: "goal",
      use_memory: request.use_memory ?? true,
      focus_skills: [],
      turn_count: 0,
      created_at: now(),
      ended_at: null,
      has_summary: false,
      messages: [this.message("coach", `Welcome to ${mode.title.toLowerCase()}. What would you like to focus on today?`)],
    };
    this.conversations.set(conversation.conversation_id, conversation);
    return this.wait(conversation);
  };

  private message(role: "coach" | "user", text: string): CoachMessage {
    return { message_id: nextId("msg") as CoachMessage["message_id"], role, text, created_at: now() };
  }

  private conversation(id: string) {
    const found = this.conversations.get(id);
    if (!found) this.fail("not_found", "The conversation was not found.");
    return found;
  }

  getConversation = (id: string) => this.wait(this.conversation(id));

  sendConversationMessage: AiClient["sendConversationMessage"] = async (id, text, _clientId, onDelta) => {
    const conversation = this.conversation(id);
    if (conversation.status !== "active") this.fail("invalid_request", "This conversation has ended.");
    const question = "What would a good first step look like for you this week?";
    const reply = `Thanks — that helps me understand. ${question}`;
    await this.streamText(reply, onDelta);
    const user = this.message("user", text);
    const assistant = this.message("coach", reply);
    conversation.messages.push(user, assistant);
    conversation.turn_count += 1;
    conversation.stage = conversation.turn_count > 1 ? "options" : "reality";
    const result: CoachingTurnResult = {
      user_message: user,
      assistant_message: assistant,
      suggested_actions: [{ type: "open_scenario", label: "Rehearse a related scenario", ref_id: SCENARIOS[0]!.scenario_id }],
      coaching: { reflective_question: question, coaching_move: "question", stage: conversation.stage, observations: [], safety_flag: "none" },
      conversation_status: "active",
      turns_remaining: 100 - conversation.turn_count,
    };
    return this.wait(result);
  };

  endConversation = (id: string) => {
    const conversation = this.conversation(id);
    conversation.status = "ended";
    conversation.ended_at = now();
    conversation.has_summary = true;
    const summary: CoachingSummary = {
      conversation_id: conversation.conversation_id,
      mode: conversation.mode,
      summary: "You explored a concrete next step and how you will measure progress.",
      key_themes: ["Setting a measurable first step", "Building stakeholder support"],
      development_opportunities: [{ skill_id: "skl-influence", skill_name: "Strategic Influence", description: "Practise framing trade-offs for executives." }],
      agreed_actions: [{ action: "Draft a one-page proposal", timeframe: "This week", success_measure: "Shared with your manager" }],
      reflective_questions: ["What support will you ask for?"],
      learning_recommendations: [{ catalogue_item_id: "cat-influence-masterclass", title: "Strategic Influence Masterclass", kind: "workshop", reason: "Builds executive influence." }],
      memory_facts_saved: 0,
      provenance: provenance("coaching.conversation_turn"),
      disclaimer: "AI coaching supports your development; it does not change verified capability levels.",
      created_at: now(),
    };
    this.summaries.set(id, summary);
    return this.wait(summary);
  };

  getConversationSummary = (id: string) => {
    const found = this.summaries.get(id);
    if (!found) this.fail("not_found", "No summary yet.");
    return this.wait(found);
  };

  listScenarios = () => this.wait(SCENARIOS);
  recommendedScenarios = () =>
    this.wait({
      recommendations: SCENARIOS.map((scenario) => ({
        scenario,
        reason: `Targets ${scenario.target_skills[0]!.skill_name}, one of your gaps.`,
        target_skill_id: scenario.target_skills[0]!.skill_id,
        gap: 2,
      })),
      provenance: provenance("coaching.recommend_scenarios", "none"),
    });

  startSession = (scenarioId: string) => {
    const scenario = SCENARIOS.find((s) => s.scenario_id === scenarioId);
    if (!scenario) this.fail("not_found", "The scenario was not found.");
    const session: CoachSession = {
      session_id: nextId("cs") as CoachSession["session_id"],
      employee_id: this.persona().employeeId ?? "emp-8721",
      scenario_id: scenario.scenario_id,
      scenario_version: scenario.version,
      title: scenario.title,
      status: "active",
      evaluation_status: "none",
      persona: scenario.persona,
      target_skills: scenario.target_skills,
      started_at: now(),
      ended_at: null,
      duration_s: null,
      time_limit_s: scenario.estimated_minutes * 60,
      messages: [this.message("coach", scenario.opening)],
    };
    this.sessions.set(session.session_id, session);
    return this.wait(session);
  };

  listSessions = () =>
    this.wait<CoachSessionSummary[]>(
      [...this.sessions.values()].map((session) => {
        const { messages, ...rest } = session;
        void messages;
        return {
        ...rest,
          practice_score: this.evaluations.get(rest.session_id)?.overall_practice_score ?? null,
        };
      }),
    );

  private session(id: string) {
    const found = this.sessions.get(id);
    if (!found) this.fail("not_found", "The session was not found.");
    return found;
  }

  getSession = (id: string) => this.wait(this.session(id));

  sendSessionMessage: AiClient["sendSessionMessage"] = async (id, text, _clientId, onDelta) => {
    const session = this.session(id);
    if (session.status !== "active") this.fail("invalid_request", "This session has ended.");
    const reply = "That's a fair point. But what happens to the data after the contract ends?";
    await this.streamText(reply, onDelta);
    const user = this.message("user", text);
    const persona = this.message("coach", reply);
    session.messages.push(user, persona);
    const result: CoachTurnResult = {
      user_message: user,
      coach_message: persona,
      session_status: "active",
      suggest_end: session.messages.length >= 7,
      remaining_s: Math.max(0, session.time_limit_s - session.messages.length * 30),
    };
    return this.wait(result);
  };

  endSession = (id: string) => {
    const session = this.session(id);
    session.status = "evaluated";
    session.evaluation_status = "ready";
    session.ended_at = now();
    const firstUser = session.messages.find((m) => m.role === "user");
    const quote = firstUser ? [{ message_id: firstUser.message_id, quote: firstUser.text.slice(0, 80) }] : [];
    const evaluation: SessionEvaluation = {
      session_id: session.session_id,
      overall_practice_score: firstUser ? 72 : 0,
      skill_observations: session.target_skills.map((t) => ({
        skill_id: t.skill_id,
        skill_name: t.skill_name,
        target_level: t.target_level,
        observed_level: firstUser ? t.target_level - 1 : null,
        evidence: quote,
      })),
      strengths: firstUser ? [{ text: "You stated a clear position early.", indicator_id: null, evidence: quote }] : [],
      growth_areas: [{ text: "Address the retention period explicitly.", indicator_id: null, evidence: quote, tip: "Name the expiry rule and who enforces it." }],
      next_steps: [{ type: "learning", ref_id: "cat-api-gov-2024", title: "Advanced API Governance & Ethics 2024", reason: "Covers retention rules." }],
      provenance: provenance("coaching.evaluate_session"),
      disclaimer: "Practice feedback only; it does not change verified capability levels.",
    };
    this.evaluations.set(id, evaluation);
    return this.wait(evaluation);
  };

  getEvaluation = (id: string) => {
    const found = this.evaluations.get(id);
    if (!found) this.fail("not_found", "The evaluation is not ready.");
    return this.wait(found);
  };

  getCoachMetrics = () =>
    this.wait({
      total_sessions: this.sessions.size,
      sessions_this_month: this.sessions.size,
      skills_targeted: 2,
      average_practice_score: this.evaluations.size ? 72 : null,
      minutes_coached: this.sessions.size * 12,
    });

  // ── training plans ─────────────────────────────────────────────────────

  getGaps = (employeeId: string) =>
    this.wait({
      employee_id: employeeId,
      role_id: "role-ssa",
      role_profile_version: "3",
      gaps: GAPS,
      provenance: provenance("dev_plan.explain_gaps"),
    });

  getLearningRecommendations: AiClient["getLearningRecommendations"] = ({ skillId, limit }) =>
    this.wait({
      recommendations: LEARNING.filter((l) => !skillId || l.skill_id === skillId).slice(0, limit ?? 5),
      provenance: provenance("dev_plan.recommend_learning", "none"),
    });

  draftPlan: AiClient["draftPlan"] = async (request) => {
    const focus = request.focus_skill_ids?.length ? GAPS.filter((g) => request.focus_skill_ids!.includes(g.skill_id)) : GAPS.slice(0, 2);
    const horizon = request.horizon_weeks;
    const start = new Date();
    const plan: IndividualDevelopmentPlan = {
      plan_type: "individual_development_plan",
      employee: {
        employee_id: request.employee_id,
        job_title: "Senior Solutions Architect",
        department: "IT Infrastructure",
        current_role_id: "role-ssa",
        plan_role_id: request.role_id ?? "role-ssa",
        plan_role_title: "Senior Solutions Architect",
        role_profile_version: "3",
      },
      horizon_weeks: horizon,
      start_date: start.toISOString().slice(0, 10),
      end_date: new Date(start.getTime() + horizon * 7 * 86_400_000).toISOString().slice(0, 10),
      development_objectives: ["Close the role's priority capability gaps."],
      goals: focus.map((gap, index) => {
        const learning = LEARNING.find((l) => l.skill_id === gap.skill_id)!;
        return {
          goal_key: `goal-${gap.skill_id}`,
          skill_id: gap.skill_id,
          skill_name: gap.skill_name,
          category: gap.category,
          current_level: gap.verified_level,
          current_level_source: gap.verified_level === null ? "none" : "verified",
          target_level: gap.required_level,
          gap: gap.gap,
          priority: gap.priority,
          priority_rationale: gap.priority_rationale,
          objective: `Demonstrate ${gap.skill_name} at level ${gap.required_level} in day-to-day work.`,
          interventions: [
            { action_key: `${gap.skill_id}-learning`, type: "learning", title: learning.title, description: "Complete the course and apply one idea.", catalogue_item_id: learning.catalogue_item_id, scenario_id: null, success_indicator_ids: [], due_in_days: 42 },
            { action_key: `${gap.skill_id}-assignment`, type: "workplace_practice", title: `Lead a live piece of work needing ${gap.skill_name}`, description: "Agree the assignment with your manager.", catalogue_item_id: null, scenario_id: null, success_indicator_ids: [], due_in_days: horizon * 7 },
          ],
          resources: [{ catalogue_item_id: learning.catalogue_item_id, title: learning.title, kind: learning.kind, provider: learning.provider, duration_minutes: learning.duration_minutes }],
          milestones: [
            { milestone_key: `${gap.skill_id}-m1`, title: "Learning applied", due_week: Math.max(1, Math.floor(horizon / 2)), measure: "One work example discussed with your manager.", success_indicator_ids: [] },
            { milestone_key: `${gap.skill_id}-m2`, title: "Target level evidenced", due_week: horizon, measure: `Evidence submitted for level ${gap.required_level}.`, success_indicator_ids: [] },
          ],
          expected_outcomes: [`Works at level ${gap.required_level} in ${gap.skill_name} without close support.`],
          success_indicators: [{ indicator_id: `ind-${gap.skill_id}`, level: gap.required_level, text: `Demonstrates ${gap.skill_name} at level ${gap.required_level}.` }],
          start_week: 1 + index * 2,
          end_week: horizon,
        };
      }),
      weekly_learning_minutes: 70,
      evidence_basis: [],
      rationale: "Goals follow the gap priorities; organisational resources are used first.",
      validation: { passed: true, repaired: false, issues: [] },
    };
    const envelope: IdpDraftEnvelope = {
      draft: {
        draft_id: nextId("drf") as IdpDraftEnvelope["draft"]["draft_id"],
        kind: "development_plan",
        status: "open",
        subject_employee_id: request.employee_id,
        payload: plan,
        provenance: provenance("dev_plan.draft_plan"),
        approval_policy: { mode: "role_approval", approver_roles: ["line_manager", "hr_ld_admin"], commit_target: "backend", commit_endpoint_id: "BE-052" },
        disclaimer: "AI-generated draft development plan. It becomes official only after review and approval.",
        created_by: "user-mock",
        created_at: now(),
        expires_at: inDays(14),
        resolution: null,
      },
      version: 1,
      review_history: [{ at: now(), action: "created", actor_hash: "mock", version: 1, note: null }],
      commit_plan: [],
      can_resolve: this.isManagerOrHr() && this.persona().employeeId !== request.employee_id,
      can_propose_edits: true,
    };
    this.drafts.set(envelope.draft.draft_id, envelope as DraftEnvelope);
    return this.wait({ ...envelope, can_resolve: this.view(envelope as DraftEnvelope).can_resolve });
  };

  /** Like the service: whether the *current viewer* may resolve is computed on every read. */
  private view(envelope: DraftEnvelope): DraftEnvelope {
    const p = this.persona();
    const canResolve =
      envelope.draft.status === "open" && this.isManagerOrHr() && p.employeeId !== envelope.draft.subject_employee_id;
    return { ...envelope, can_resolve: canResolve, can_propose_edits: envelope.draft.status === "open" };
  }

  listDrafts: AiClient["listDrafts"] = (query = {}) =>
    this.wait(
      [...this.drafts.values()].map((d) => this.view(d)).filter(
        (d) =>
          (!query.subjectEmployeeId || d.draft.subject_employee_id === query.subjectEmployeeId) &&
          (!query.status || d.draft.status === query.status),
      ),
    );

  private draft(id: string) {
    const found = this.drafts.get(id);
    if (!found) this.fail("not_found", "The draft was not found.");
    return found;
  }

  getDraft = (id: string) => this.wait(this.view(this.draft(id)));

  resolveDraft: AiClient["resolveDraft"] = async (id, request) => {
    const envelope = this.draft(id);
    if (!this.isManagerOrHr() || this.persona().employeeId === envelope.draft.subject_employee_id) {
      this.fail("forbidden", "Only the line manager or HR can approve this plan.");
    }
    const status: DraftStatus = request.decision;
    envelope.draft.status = status;
    envelope.draft.resolution = { decision: request.decision, resolved_by: "user-mock", resolved_at: now(), reason: request.reason ?? null, committed_ref: null };
    if (request.edited_payload) envelope.draft.payload = request.edited_payload;
    envelope.can_resolve = false;
    envelope.review_history.push({ at: now(), action: request.decision, actor_hash: "mock", version: envelope.version, note: request.reason ?? null });
    envelope.version += 1;
    envelope.commit_plan =
      request.decision === "rejected"
        ? []
        : [{ endpoint_id: "BE-052", method: "POST", path: "/development-plans", body: { source: { type: request.decision === "edited" ? "ai_edited" : "ai", draft_id: id } }, endpoint_status: "mocked" }];
    return this.wait(this.view(envelope));
  };

  reportCommit: AiClient["reportCommit"] = async (id, ref) => {
    const envelope = this.draft(id);
    envelope.draft.status = "committed";
    if (envelope.draft.resolution) envelope.draft.resolution.committed_ref = ref;
    envelope.review_history.push({ at: now(), action: "commit_reported", actor_hash: "mock", version: envelope.version, note: null });
    return this.wait(envelope);
  };

  getPlanProgress = (planId: string) =>
    this.wait<PlanProgressReport>({
      plan_id: planId,
      employee_id: this.persona().employeeId ?? "emp-8721",
      generated_at: now(),
      overall_progress_pct: 40,
      goals: [
        { goal_id: "goal-5501-1", skill_id: "skl-api-gov", skill_name: "API Governance", from_level: 2, to_level: 4, current_verified_level: null, status: "at_risk", progress_pct: 40, expected_pct: 60, actions_done: 1, actions_total: 3, overdue_actions: [], completed_learning: [] },
        { goal_id: "goal-5501-2", skill_id: "skl-influence", skill_name: "Strategic Influence", from_level: 3, to_level: 5, current_verified_level: 3, status: "on_track", progress_pct: 50, expected_pct: 45, actions_done: 1, actions_total: 2, overdue_actions: [], completed_learning: ["Strategic Influence Masterclass"] },
      ],
      new_evidence: [],
      unavailable_context: [],
    });

  reviewPlan: AiClient["reviewPlan"] = async (planId) =>
    this.wait({ progress: await this.getPlanProgress(planId), adjustment: null, summary: "The plan is on track; no changes are proposed." });

  // ── talent assessment ──────────────────────────────────────────────────

  /** T8 talent.score_interview: same rules as the AI service fake (content only, verbatim evidence). */
  scoreInterview: AiClient["scoreInterview"] = async (request) => {
    if (!this.persona().roles.includes("hr_ld_admin")) this.fail("forbidden", "Interview scoring is available to HR only.");
    const stems = (text: string) =>
      new Set((text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
    const answers = new Map(request.answers.map((a) => [a.question_id, a.text]));
    const scores: InterviewQuestionScore[] = request.questions.map((q) => {
      const answer = answers.get(q.question_id) ?? "";
      const levels = [...q.rubric].sort((a, b) => a.score - b.score);
      const max = levels[levels.length - 1]!.score;
      const words = answer.split(/\s+/).filter(Boolean).length;
      if (!answer.trim()) {
        return { question_id: q.question_id, competency: q.competency, score: 0, max_score: max, confidence: "high", evidence: [], rationale: "No answer was given." };
      }
      const answerStems = words >= 25 ? new Set([...stems(answer), ...stems(q.question)]) : stems(answer);
      let chosen = levels[0]!;
      for (const level of levels) {
        if ([...stems(level.descriptor)].filter((w) => answerStems.has(w)).length >= 2) chosen = level;
      }
      if (words < 8) chosen = levels[0]!;
      const sentences = answer.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      const quote = sentences.reduce((a, b) => (b.length > a.length ? b : a), sentences[0] ?? answer.trim());
      return {
        question_id: q.question_id,
        competency: q.competency,
        score: chosen.score,
        max_score: max,
        confidence: words >= 25 ? "medium" : "low",
        evidence: quote.length >= 4 ? [quote] : [],
        rationale: `The answer matches the level ${chosen.score} description for ${q.competency}.`,
      };
    });
    const result: InterviewScoring = {
      role_title: request.role_title,
      scores,
      summary: "Scores are based on the content of each answer against its approved rubric.",
      validation: { passed: true, repaired: false, issues: [] },
      provenance: provenance("talent.score_interview"),
      disclaimer: "Suggested scores for a person to confirm. Only the content of answers was considered; appearance, accent, fluency and expression are never scored.",
    };
    return this.wait(result);
  };

  /** T7 talent.analyze_cv: same rules as the AI service fake (verbatim passages, never a decision). */
  analyzeCv: AiClient["analyzeCv"] = async (request) => {
    if (!this.persona().roles.includes("hr_ld_admin")) this.fail("forbidden", "CV analysis is available to HR only.");
    if (request.cv_text.trim().length < 50) this.fail("invalid_request", "The CV text is too short to analyse.");
    const stems = (text: string) =>
      new Set((text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));
    const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
    const lines = request.cv_text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const sentences = lines.flatMap((l) =>
      l
        .split(/(?<=[.!?])\s+/)
        .map((x) => x.trim())
        .filter(Boolean),
    );
    const skills: CvSkillEvidence[] = request.requirements.map((req) => {
      const want = stems(req.skill_name);
      let best: { ratio: number; sentence: string } | null = null;
      for (const sentence of sentences) {
        const have = stems(sentence);
        const shared = [...want].filter((w) => have.has(w)).length;
        const ratio = want.size ? shared / want.size : 0;
        if (shared && (!best || ratio > best.ratio)) best = { ratio, sentence };
      }
      const base = { skill_name: req.skill_name, category: req.category, target_level: req.target_level };
      if (best && best.ratio >= 0.99 && words(best.sentence) >= 5) {
        return {
          ...base,
          status: "found",
          confidence: words(best.sentence) >= 8 ? "high" : "medium",
          passages: [best.sentence],
          note: `The CV describes work involving ${req.skill_name.toLowerCase()}.`,
        };
      }
      if (best) {
        return {
          ...base,
          status: "unclear",
          confidence: "low",
          passages: best.sentence.length >= 8 ? [best.sentence] : [],
          note: "Only a partial or indirect mention; ask the candidate for an example.",
        };
      }
      return {
        ...base,
        status: "not_found",
        confidence: "medium",
        passages: [],
        note: "No relevant passage in the CV. This is not proof the skill is missing.",
      };
    });
    const found = skills.filter((x) => x.status === "found").length;
    const unclear = skills.filter((x) => x.status === "unclear").length;
    const qualification =
      /\b(BSc|B\.Sc|MSc|M\.Sc|MBA|BA|MA|PhD|HND|OND|Degree|Diploma|Certified|Certificate|Certification|ACCA|ICAN|CIPM)\b/;
    const result: CvAnalysis = {
      role_title: request.role_title,
      skills,
      experience: lines.filter((l) => /\b(19|20)\d{2}\b/.test(l)).slice(0, 5),
      qualifications: lines.filter((l) => qualification.test(l)).slice(0, 5),
      summary: `The CV shows clear evidence for ${found} of ${skills.length} required skills. Other skills are unclear or not mentioned and should be explored with the candidate.`,
      coverage_pct: Math.round((100 * found) / skills.length),
      evidence_found: found,
      unclear,
      not_found: skills.length - found - unclear,
      validation: { passed: true, repaired: false, issues: [] },
      provenance: provenance("talent.analyze_cv"),
      disclaimer:
        "CV analysis is a screening signal, not proof of competence. A skill marked Not found or Unclear may still be held: no candidate is rejected on this basis alone, and people review every result.",
    };
    return this.wait(result);
  };

  /** T1 talent.draft_items: a draft design built from the framework role profile (HR only). */
  designAssessment: AiClient["designAssessment"] = async (request) => {
    if (!this.persona().roles.includes("hr_ld_admin")) this.fail("forbidden", "Assessment design is available to HR only.");
    const role = FRAMEWORK_ROLES[request.role_id ?? ""];
    if (!role) this.fail("not_found", "There is no framework role profile for this role yet.");
    const wanted = request.skill_ids?.length
      ? role.requirements.filter((r) => request.skill_ids!.includes(r.skill_id))
      : role.requirements;
    if (wanted.length === 0) this.fail("invalid_request", "The selected skills are not requirements of this role.");
    const perSkill = Math.min(3, Math.max(1, request.questions_per_competency ?? 2));
    const competencies: CompetencyRubric[] = wanted.map((r) => {
      const level = request.target_level ?? r.required_level;
      return {
        skill_id: r.skill_id,
        skill_name: r.skill_name,
        category: r.category,
        target_level: level,
        bands: [1, 2, 3, 4, 5].map((l) => ({
          level: l,
          label: LEVEL_LABELS[l - 1]!,
          descriptor: LEVEL_LABELS[l - 1] + " use of " + r.skill_name + ".",
          indicator_ids: ["ind-" + r.skill_id + "-" + l + "-1"],
        })),
        criteria: [
          { criterion_id: "ind-" + r.skill_id + "-" + level + "-1", skill_id: r.skill_id, level, text: "Applies " + r.skill_name + " independently in complex situations." },
          { criterion_id: "ind-" + r.skill_id + "-" + level + "-2", skill_id: r.skill_id, level, text: "Explains " + r.skill_name + " trade-offs to stakeholders." },
        ],
      };
    });
    const questions: AssessmentQuestion[] = competencies.flatMap((c) => {
      const [c1, c2] = c.criteria;
      const sjt: AssessmentQuestion = {
        question_key: c.skill_id + "-sjt",
        type: "situational_judgement",
        respondent: "subject",
        skill_id: c.skill_id,
        target_level: c.target_level,
        prompt: "A delivery deadline is at risk because of a " + c.skill_name.toLowerCase() + " decision your team disagrees on. What do you do first?",
        options: [
          { option_key: "a", text: "Escalate to your manager and wait for a decision", score: 1, indicator_ids: [], rationale: "Defers ownership." },
          { option_key: "b", text: "Lay out the options and trade-offs, agree criteria with the team, then decide", score: 4, indicator_ids: [c1!.criterion_id, c2!.criterion_id], rationale: "Owns the decision with transparent trade-offs." },
          { option_key: "c", text: "Pick the option you prefer and move on", score: 2, indicator_ids: [], rationale: "Decides without agreement." },
          { option_key: "d", text: "Delay the deadline", score: 1, indicator_ids: [], rationale: "Avoids the decision." },
        ],
        expected_indicator_ids: [c1!.criterion_id],
        look_fors: [],
        model_answer_outline: null,
        feedback: { strong: "Weighs trade-offs openly and owns the decision.", developing: "Practise setting decision criteria with the team." },
        evidence_required: "Selected option.",
        estimated_minutes: 3,
      };
      const scenario: AssessmentQuestion = {
        question_key: c.skill_id + "-scenario",
        type: "scenario",
        respondent: "subject",
        skill_id: c.skill_id,
        target_level: c.target_level,
        prompt: "Describe how you would apply " + c.skill_name + " to a new customer-facing platform that must scale to three times today's load. Explain the trade-offs you would present to stakeholders.",
        options: null,
        expected_indicator_ids: [c1!.criterion_id, c2!.criterion_id],
        look_fors: ["States constraints and success measures", "Compares at least two options", "Explains trade-offs in business terms"],
        model_answer_outline: "Constraints, options, recommendation, risks and how success is measured.",
        feedback: { strong: "Clear options, explicit trade-offs and measurable outcomes.", developing: "Name the trade-offs and how you would measure success." },
        evidence_required: "Written answer.",
        estimated_minutes: 6,
      };
      const behavioural: AssessmentQuestion = {
        ...scenario,
        question_key: c.skill_id + "-behavioural",
        type: "behavioural",
        prompt: "Tell us about a time you used " + c.skill_name + " to resolve a difficult problem. What did you do and what was the outcome?",
      };
      return [sjt, scenario, behavioural].slice(0, perSkill);
    });
    const design: AssessmentDesign = {
      design_type: "assessment_design",
      method: request.method ?? "competency_based",
      title: role.title + " assessment",
      objectives: ["Establish evidence of the " + role.title + " role requirements."],
      role_id: request.role_id ?? null,
      role_profile_version: role.version,
      competencies,
      questions,
      rating_scale: competencies[0]!.bands,
      scoring_method: "Highest level whose criteria are at least 75% evidenced.",
      evidence_policy: "Scores rely on response evidence only.",
      total_minutes: questions.reduce((sum, q) => sum + q.estimated_minutes, 0),
      validation: { passed: true, repaired: false, issues: [] },
    };
    const envelope: AssessmentDesignEnvelope = {
      draft: {
        draft_id: nextId("drf") as AssessmentDesignEnvelope["draft"]["draft_id"],
        kind: "assessment_items",
        status: "open",
        subject_employee_id: null,
        payload: design,
        provenance: provenance("talent.draft_items"),
        approval_policy: { mode: "per_item_review", approver_roles: ["hr_ld_admin"], commit_target: "backend", commit_endpoint_id: "BE-065" },
        disclaimer: "AI-drafted assessment design. It is used only after an assessor has reviewed and approved it.",
        created_by: "user-mock",
        created_at: now(),
        expires_at: inDays(14),
        resolution: null,
      },
      version: 1,
      review_history: [{ at: now(), action: "created", actor_hash: "mock", version: 1, note: null }],
      commit_plan: [],
      can_resolve: true,
      can_propose_edits: true,
    };
    return this.wait(envelope);
  };

  private evaluation(assessmentId: string): AssessmentEvaluation {
    const rows: Array<[string, string, string, number, number | null, "low" | "medium" | "high", string]> = [
      ["row-api", "skl-api-gov", "API Governance", 4, 4, "medium", "Selected option d."],
      ["row-inf", "skl-influence", "Strategic Influence", 5, 3, "medium", "I explained the latency versus cost trade-off of caching to the product and finance leads."],
      ["row-ms", "skl-microservices", "Microservices Design", 4, 3, "high", "the employee split the payments domain into independently deployable services last quarter."],
    ];
    const recommendations: CompetencyScore[] = rows.map(([row, skill, name, required, score, confidence, quote]) => ({
      rubric_row_id: row,
      skill_id: skill,
      skill_name: name,
      required_level: required,
      recommended_score: score,
      determination: `Level ${score} is the highest level demonstrated by the criteria evidence.`,
      levels: [{ level: score ?? 1, status: "demonstrated", coverage: 1 }],
      criteria: [
        { criterion_id: `ind-${skill}-${score}-1`, level: score ?? 1, text: `Demonstrates ${name} at level ${score}.`, judgement: "met", evidence: [{ kind: "quote", response_item_id: "resp-1", respondent: "subject", item_type: "behavioural_assessment", quote, option_key: null, option_score: null, self_reported: false }], basis: "ai_judgement" },
        { criterion_id: `ind-${skill}-${required}-1`, level: required, text: `Demonstrates ${name} at level ${required}.`, judgement: score !== null && score >= required ? "met" : "not_evidenced", evidence: [], basis: "none" },
      ],
      confidence,
      rationale: "Judged each criterion against the submitted responses only.",
      evidence: [{ response_item_id: "resp-1", quote }],
      indicators_met: [`ind-${skill}-${score}-1`],
      indicators_missing: score !== null && score >= required ? [] : [`ind-${skill}-${required}-1`],
      gap: score === null ? null : Math.max(0, required - score),
      below_required: score === null || score < required,
      rating_claims: skill === "skl-api-gov" ? [{ respondent: "subject", response_item_id: "resp-self", rating: 4, alignment: "aligned" }] : [],
      sufficient_evidence: true,
    }));
    return {
      scoring_set_id: nextId("scs") as AssessmentEvaluation["scoring_set_id"],
      assessment_id: assessmentId,
      assessment_type: "development",
      rubric_version: "1",
      blind: true,
      objectives: ["Establish evidence-based proficiency in the role's priority competencies."],
      methods: ["behavioural_assessment", "situational_judgement", "practical_exercise"],
      scoring_rule: "Score = highest proficiency level whose criteria are at least 75% covered by evidence.",
      integrity_warnings: [],
      recommendations,
      approval_policy: { mode: "per_item_review", approver_roles: ["hr_ld_admin"], commit_target: "backend", commit_endpoint_id: "BE-063" },
      provenance: provenance("talent.recommend_scores"),
      disclaimer: "AI-recommended scores for assessor consideration. Each score requires an assessor decision.",
    };
  }

  scoreAssessment: AiClient["scoreAssessment"] = async (assessmentId) => {
    if (!this.persona().roles.includes("hr_ld_admin")) this.fail("forbidden", "Only HR assessors can score assessments.");
    const evaluation = this.evaluation(assessmentId);
    const approval: OrchestratorApproval = {
      approval_id: nextId("apr") as OrchestratorApproval["approval_id"],
      step_id: "st_1",
      capability: "talent.recommend_scores",
      mode: "per_item_review",
      approver_roles: ["hr_ld_admin"],
      summary: `Review evidence-based scores for ${evaluation.recommendations.length} competencies.`,
      items: evaluation.recommendations.map((r) => ({ item_id: r.rubric_row_id, label: r.skill_name, proposal: { recommended_score: r.recommended_score } })),
      status: "pending",
      commit_endpoint_id: "BE-063",
      decided_by_hash: null,
      decided_at: null,
      decision: null,
      reviewed_output: null,
      commit_plan: [],
    };
    const view: ScoringView = {
      execution_id: nextId("exe"),
      status: "awaiting_approval",
      evaluation,
      review: approval,
      follow_ups: [],
      suggestions: [],
    };
    this.scoring.set(evaluation.scoring_set_id, view);
    return this.wait(view);
  };

  getScoringSet = (id: string) => {
    const found = this.scoring.get(id);
    if (!found) this.fail("not_found", "The scoring set was not found.");
    return this.wait(found);
  };

  reviewScoringSet: AiClient["reviewScoringSet"] = async (id, decision) => {
    const view = this.scoring.get(id);
    if (!view?.review) this.fail("not_found", "The scoring set was not found.");
    const decided = decision.items ?? [];
    const items = new Map(decided.map((i) => [i.item_id, i]));
    if (decision.decision !== "reject" && view.evaluation.recommendations.some((r) => !items.has(r.rubric_row_id))) {
      this.fail("invalid_request", "Every rubric row needs exactly one decision.");
    }
    const overridden = decided.some((i) => i.decision === "overridden");
    view.status = "succeeded";
    view.review.status = decision.decision === "reject" ? "rejected" : overridden ? "modified" : "approved";
    view.review.commit_plan =
      decision.decision === "reject"
        ? []
        : view.evaluation.recommendations.map((r) => {
            const item = items.get(r.rubric_row_id)!;
            const score = item.decision === "overridden" ? item.value : r.recommended_score;
            return { endpoint_id: "BE-063", method: "PATCH" as const, path: `/talent/assessments/${view.evaluation.assessment_id}/rubric/${r.rubric_row_id}`, body: { score, score_source: item.decision === "overridden" ? "ai_overridden" : "ai_accepted" }, endpoint_status: "mocked" };
          });
    view.follow_ups =
      decision.decision === "reject" ? [] : [{ capability: "dev_plan.draft_plan", status: "succeeded", subject_employee_id: "emp-8721", summary: "Draft development plan created; awaiting review." }];
    return this.wait(view);
  };

  draftAssessmentReport: AiClient["draftAssessmentReport"] = async () =>
    this.fail("invalid_request", "Reports need committed scores; commit the reviewed scores first.") as never as AssessmentReportEnvelope;
}
