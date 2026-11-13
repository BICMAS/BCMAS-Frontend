import type {
  CoachMessage,
  CoachMetrics,
  CoachScenario,
  CoachSession,
  ScenarioCategory,
} from "@/features/ai-coach/types";
import { mockLatency } from "@/lib/mock/delay";

const scenarios: CoachScenario[] = [
  {
    id: "sim-ai-gov",
    title: "AI Governance Risk Mitigation",
    description:
      "Simulate an executive briefing where you must defend an AI implementation strategy against privacy concerns.",
    category: "role",
    department: "Leadership",
    targetSkill: "AI Governance (L4)",
    minutes: 15,
    difficulty: "Intermediate",
    persona: "CPO",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg",
    opening:
      "I've reviewed the proposal for the sentiment tool. My main concern is the permanent storage of anonymised customer snippets. SFIA 8 standards suggest clear expiry. How does your framework handle that?",
  },
  {
    id: "sim-cloud-cost",
    title: "Cloud Cost Optimisation Workshop",
    description:
      "Lead a technical team session to identify and resolve resource waste in multi-cloud environments.",
    category: "technical",
    department: "IT Infrastructure",
    targetSkill: "Cloud Security (L4)",
    minutes: 20,
    difficulty: "Advanced",
    persona: "Engineering Lead",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-3.jpg",
    opening:
      "Our multi-cloud bill jumped 18% this quarter. Walk me through the first three wastes you would cut, and what you would not touch.",
  },
  {
    id: "sim-azure",
    title: "Azure Security Breach: Response Protocol",
    description:
      "Manage a simulated multi-region outage. Communicate with leadership while identifying the root cause under pressure.",
    category: "technical",
    department: "IT Infrastructure",
    targetSkill: "Cloud Security (L4)",
    minutes: 25,
    difficulty: "Hard",
    persona: "Incident Commander",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-4.jpg",
    opening:
      "EU-West is unresponsive. Leadership is already on the bridge. What is your first priority, and who do you tell?",
  },
  {
    id: "sim-vendor",
    title: "Handling Vendor Contract Negotiations",
    description:
      "Simulate a high-stakes meeting with a global SaaS provider. Balance cost reduction with SLA requirements.",
    category: "soft",
    department: "Leadership",
    targetSkill: "Stakeholder Mgmt (L5)",
    minutes: 15,
    difficulty: "Medium",
    persona: "Vendor Director",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg",
    opening:
      "We can offer 8% off if you extend the term by two years. Your team wants a tighter SLA. How do you want to trade those?",
  },
];

function stamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function openingMessages(scenario: CoachScenario): CoachMessage[] {
  return [
    {
      id: `${scenario.id}-open`,
      role: "coach",
      text: scenario.opening,
      time: "04:10 PM",
    },
  ];
}

let scenarioState = structuredClone(scenarios);

const azureScenario = scenarios.find((item) => item.id === "sim-azure");
const vendorScenario = scenarios.find((item) => item.id === "sim-vendor");

let sessions: CoachSession[] = [
  {
    id: "session-cloud",
    scenarioId: "sim-azure",
    title: "Cloud Infrastructure Troubleshooting",
    date: "12 Oct 2023",
    duration: "18 Mins",
    score: 92,
    skill: "Cloud Security (L4)",
    result: "completed",
    persona: "Incident Commander",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-4.jpg",
    messages: azureScenario ? openingMessages(azureScenario) : [],
  },
  {
    id: "session-stakeholder",
    scenarioId: "sim-vendor",
    title: "Leading Stakeholder Conflict",
    date: "08 Oct 2023",
    duration: "22 Mins",
    score: 74,
    skill: "Stakeholder Mgmt (L5)",
    result: "completed",
    persona: "Vendor Director",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg",
    messages: vendorScenario ? openingMessages(vendorScenario) : [],
  },
];

export function listScenarios(): CoachScenario[] {
  return scenarioState;
}

export function getScenario(id: string) {
  return scenarioState.find((scenario) => scenario.id === id) ?? null;
}

export function listSessions(): CoachSession[] {
  return sessions;
}

export function getCoachMetrics(): CoachMetrics {
  const completed = sessions.filter((session) => session.result === "completed");
  const average = completed.length
    ? Math.round(completed.reduce((sum, session) => sum + session.score, 0) / completed.length)
    : 86;
  return {
    totalSessions: Math.max(24, sessions.length),
    sessionsThisMonth: 4,
    gapsTargeted: 8,
    averagePerformance: average,
    hoursCoached: 12.5,
  };
}

export function getSession(sessionId: string): CoachSession | null {
  return sessions.find((session) => session.id === sessionId) ?? null;
}

export function startSession(scenarioId: string): CoachSession {
  const scenario =
    getScenario(scenarioId) ??
    ({
      id: scenarioId,
      title: "Coaching session",
      description: "Practice conversation",
      category: "role" as ScenarioCategory,
      department: "General",
      targetSkill: "Role practice",
      minutes: 15,
      difficulty: "Intermediate" as const,
      persona: "Coach",
      avatarUrl:
        "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg",
      opening: "Tell me how you would handle this situation, and what evidence you would use.",
    } satisfies CoachScenario);

  const existing = sessions.find(
    (session) => session.id === scenario.id && session.result === "in_progress",
  );
  if (existing) return existing;

  const session: CoachSession = {
    id: scenario.id,
    scenarioId: scenario.id,
    title: scenario.title,
    date: "In progress",
    duration: `${scenario.minutes} Mins`,
    score: 0,
    skill: scenario.targetSkill,
    result: "in_progress",
    persona: scenario.persona,
    avatarUrl: scenario.avatarUrl,
    messages: openingMessages(scenario),
  };
  sessions = [session, ...sessions.filter((item) => item.id !== session.id)];
  return session;
}

export async function sendCoachMessage(sessionId: string, text: string) {
  await mockLatency(500);
  const reply = replyFor(text);
  sessions = sessions.map((session) => {
    if (session.id !== sessionId) return session;
    return {
      ...session,
      messages: [
        ...session.messages,
        { id: `u-${Date.now()}`, role: "user", text, time: stamp() },
        { id: `c-${Date.now()}`, role: "coach", text: reply, time: stamp() },
      ],
    };
  });
  return getSession(sessionId);
}

function replyFor(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("expir") || lower.includes("retention") || lower.includes("24")) {
    return "That retention window is clearer. Which internal policy section would you cite if I asked you to prove the expiry is enforced, not just described?";
  }
  if (lower.includes("cost") || lower.includes("waste")) {
    return "Good. Name one control you would keep even if it costs more, and why leadership should accept that trade.";
  }
  return "Stay with the stakeholder, not the architecture. Reframe the constraint as a safeguard you can both verify. What would you say next?";
}

export async function endSession(sessionId: string) {
  await mockLatency(600);
  sessions = sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          result: "completed",
          score: session.score || 85,
          date: "Today",
          duration: "18:42",
        }
      : session,
  );
  return getSession(sessionId);
}

export async function createScenario(title: string): Promise<CoachScenario> {
  await mockLatency(400);
  const scenario: CoachScenario = {
    id: `sim-${Date.now()}`,
    title: title.trim(),
    description: "Custom role-based practice defined by you.",
    category: "custom",
    department: "Custom",
    targetSkill: "Role practice",
    minutes: 15,
    difficulty: "Intermediate",
    persona: "Coach",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg",
    opening: `Let's practice ${title.trim()}. Set the scene, then tell me your first move.`,
  };
  scenarioState = [scenario, ...scenarioState];
  return scenario;
}
