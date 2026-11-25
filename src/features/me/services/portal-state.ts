import {
  initialEvidence,
  initialGoals,
  initialTimeline,
  type EvidenceItem,
  type GrowthGoal,
  type TimelineEvent,
} from "@/features/me/data/portal";
import { mockLatency } from "@/lib/mock/delay";

let goals = structuredClone(initialGoals);
let evidence = structuredClone(initialEvidence);
let timeline = structuredClone(initialTimeline);

export function listGoals() {
  return goals;
}

export function getGoal(goalId: string) {
  return goals.find((goal) => goal.id === goalId) ?? null;
}

export async function createGoal(
  title: string,
  levels: { current: number; target: number } = { current: 2, target: 4 },
): Promise<GrowthGoal> {
  await mockLatency(400);
  const goal: GrowthGoal = {
    id: `goal-${Date.now()}`,
    title: title.trim(),
    kind: "Custom goal",
    currentLevel: levels.current,
    targetLevel: levels.target,
    dueLabel: "Due in 30 Days",
    progress: 0,
    objective: `Build ${title.trim()} from Level ${levels.current} toward Level ${levels.target}.`,
    learningTitle: `${title.trim()} learning path`,
    learningMeta: "Self-directed",
    practices: ["Capture one piece of workplace evidence.", "Ask your manager for a review."],
  };
  goals = [goal, ...goals];
  return goal;
}

export async function resumeLearning(goalId: string) {
  await mockLatency(300);
  goals = goals.map((goal) =>
    goal.id === goalId
      ? { ...goal, progress: Math.min(100, goal.progress + 10) }
      : goal,
  );
  return getGoal(goalId);
}

export function listEvidence() {
  return evidence;
}

export function listTimeline(): TimelineEvent[] {
  return timeline;
}

export async function addEvidence(input: {
  title: string;
  fileNames: string[];
  linkedTo: string;
  notes: string;
}): Promise<EvidenceItem> {
  await mockLatency(600);
  const files =
    input.fileNames.length === 1 ? input.fileNames[0] : `${input.fileNames.length} files`;
  const item: EvidenceItem = {
    id: `ev-${Date.now()}`,
    title: input.title,
    fileName: input.fileNames[0] ?? "",
    fileNames: input.fileNames,
    linkedTo: input.linkedTo,
    when: "Just now",
    status: "awaiting_review",
  };
  evidence = [item, ...evidence];
  timeline = [
    {
      id: `tl-${Date.now()}`,
      when: "Just now",
      title: "Evidence submitted",
      detail: input.notes
        ? `${input.title} (${files}) linked to ${input.linkedTo}. ${input.notes}`
        : `${input.title} (${files}) linked to ${input.linkedTo}.`,
    },
    ...timeline,
  ];
  return item;
}
