export type ScenarioCategory = "role" | "soft" | "technical" | "custom";

export type CoachScenario = {
  id: string;
  title: string;
  description: string;
  category: ScenarioCategory;
  department: string;
  targetSkill: string;
  minutes: number;
  difficulty: "Intermediate" | "Advanced" | "Medium" | "Hard";
  persona: string;
  avatarUrl: string;
  opening: string;
};

export type CoachMessage = {
  id: string;
  role: "coach" | "user";
  text: string;
  time: string;
};

export type CoachSession = {
  id: string;
  scenarioId: string;
  title: string;
  date: string;
  duration: string;
  score: number;
  skill: string;
  result: "completed" | "in_progress";
  persona: string;
  avatarUrl: string;
  messages: CoachMessage[];
};

export type CoachMetrics = {
  totalSessions: number;
  sessionsThisMonth: number;
  gapsTargeted: number;
  averagePerformance: number;
  hoursCoached: number;
};
