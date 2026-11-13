import {
  assessmentQuestions,
  initialEvidence,
  initialGoals,
  initialTimeline,
  ratingLevels,
  type EvidenceItem,
  type GrowthGoal,
  type TimelineEvent,
} from "@/features/me/data/portal";
import { mockLatency } from "@/lib/mock/delay";

const ratings = new Map<string, string>([
  ["cloud", "proficient"],
  ["influence", "advanced"],
  ["api", "developing"],
]);

let submitted = false;
let goals = structuredClone(initialGoals);
let evidence = structuredClone(initialEvidence);
let timeline = structuredClone(initialTimeline);

export function listRatingLevels() {
  return ratingLevels;
}

export function listAssessmentQuestions() {
  return assessmentQuestions;
}

export function getRating(questionId: string) {
  return ratings.get(questionId) ?? null;
}

export function getRatingLabel(questionId: string) {
  const id = ratings.get(questionId);
  return ratingLevels.find((level) => level.id === id)?.label ?? "Not rated";
}

export function getRatingScore(questionId: string) {
  const id = ratings.get(questionId);
  return ratingLevels.find((level) => level.id === id)?.level ?? 0;
}

export async function saveRating(questionId: string, levelId: string) {
  await mockLatency(200);
  ratings.set(questionId, levelId);
}

export function isAssessmentSubmitted() {
  return submitted;
}

export async function saveAssessmentDraft() {
  await mockLatency(400);
  submitted = false;
}

export async function submitAssessment() {
  await mockLatency(700);
  submitted = true;
  timeline = [
    {
      id: `tl-${Date.now()}`,
      when: "Just now",
      title: "Annual Assessment Submitted",
      detail: `Completed ${assessmentQuestions.length}/${assessmentQuestions.length} skill self-ratings.`,
    },
    ...timeline.filter((event) => event.id !== "tl-2"),
  ];
}

export function listGoals() {
  return goals;
}

export function getGoal(goalId: string) {
  return goals.find((goal) => goal.id === goalId) ?? null;
}

export async function createGoal(title: string): Promise<GrowthGoal> {
  await mockLatency(400);
  const goal: GrowthGoal = {
    id: `goal-${Date.now()}`,
    title: title.trim(),
    kind: "Custom goal",
    currentLevel: 2,
    targetLevel: 4,
    dueLabel: "Due in 30 Days",
    progress: 0,
    objective: `Build ${title.trim()} from Level 2 toward Level 4.`,
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
  fileName: string;
  linkedTo: string;
  notes: string;
}): Promise<EvidenceItem> {
  await mockLatency(600);
  const item: EvidenceItem = {
    id: `ev-${Date.now()}`,
    fileName: input.fileName,
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
        ? `${input.fileName} linked to ${input.linkedTo}. ${input.notes}`
        : `${input.fileName} linked to ${input.linkedTo}.`,
    },
    ...timeline,
  ];
  return item;
}
