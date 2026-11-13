export type SkillGroup = "technical" | "behavioural";

export type PortalSkill = {
  id: string;
  name: string;
  description: string;
  group: SkillGroup;
  verifiedLevel: number;
  targetLevel: number;
};

export type RatingLevel = {
  id: string;
  label: string;
  detail: string;
  level: number;
};

export type AssessmentQuestion = {
  id: string;
  name: string;
  prompt: string;
  why: string;
};

export type GrowthGoal = {
  id: string;
  title: string;
  kind: string;
  currentLevel: number;
  targetLevel: number;
  dueLabel: string;
  progress: number;
  objective: string;
  learningTitle: string;
  learningMeta: string;
  practices: string[];
};

export type EvidenceItem = {
  id: string;
  fileName: string;
  linkedTo: string;
  when: string;
  status: "verified" | "awaiting_review";
};

export type TimelineEvent = {
  id: string;
  when: string;
  title: string;
  detail: string;
  active?: boolean;
};

export const portalSkills: PortalSkill[] = [
  {
    id: "cloud",
    name: "Cloud Infrastructure Design",
    description:
      "Designing and managing secure, scalable cloud architectures.",
    group: "technical",
    verifiedLevel: 4,
    targetLevel: 4,
  },
  {
    id: "api",
    name: "API Governance",
    description:
      "Establishing standards for internal and external API management.",
    group: "technical",
    verifiedLevel: 2,
    targetLevel: 4,
  },
  {
    id: "influence",
    name: "Strategic Influence",
    description:
      "Communicating technical vision to non-technical stakeholders.",
    group: "behavioural",
    verifiedLevel: 3,
    targetLevel: 5,
  },
];

export const ratingLevels: RatingLevel[] = [
  {
    id: "foundation",
    label: "Foundation",
    detail: "Basic understanding, need guidance.",
    level: 1,
  },
  {
    id: "developing",
    label: "Developing",
    detail: "Can perform routine tasks independently.",
    level: 2,
  },
  {
    id: "proficient",
    label: "Proficient",
    detail: "Consistently apply skills in varied situations.",
    level: 3,
  },
  {
    id: "advanced",
    label: "Advanced",
    detail: "Subject matter expert for complex problems.",
    level: 4,
  },
  {
    id: "expert",
    label: "Expert",
    detail: "Strategic leader and industry authority.",
    level: 5,
  },
];

export const assessmentQuestions: AssessmentQuestion[] = [
  {
    id: "cloud",
    name: "Cloud Infrastructure Design",
    prompt:
      "How confident are you in designing scalable, secure cloud-based architectures independently?",
    why: "As a Senior Solutions Architect, this skill is critical for ensuring our systems remain available and cost-efficient as we scale globally.",
  },
  {
    id: "influence",
    name: "Strategic Influence",
    prompt:
      "How confident are you communicating a technical vision to non-technical stakeholders?",
    why: "This role bridges business needs and engineering. Influence is how roadmap decisions get adopted.",
  },
  {
    id: "api",
    name: "API Governance",
    prompt:
      "How confident are you setting standards for internal and external API management?",
    why: "Your current role requires independent governance oversight. Closing this gap unlocks project ownership.",
  },
];

export const initialGoals: GrowthGoal[] = [
  {
    id: "goal-ai",
    title: "Advanced AI Governance",
    kind: "Skill Gap Fix",
    currentLevel: 2,
    targetLevel: 4,
    dueLabel: "Due in 14 Days",
    progress: 35,
    objective:
      "Advance from Level 2 to Level 4 in AI governance, ethics, and compliance standards.",
    learningTitle: "AI Ethics & Strategy Masterclass",
    learningMeta: "E-Learning",
    practices: [
      "Complete the AI Compliance Masterclass modules.",
      "Document one governance decision from a current project.",
      "Present the ethics checklist to your squad.",
    ],
  },
  {
    id: "goal-api",
    title: "API Governance Mastery",
    kind: "Priority: High",
    currentLevel: 2,
    targetLevel: 4,
    dueLabel: "15 Nov Due",
    progress: 40,
    objective:
      "Advance from Level 2 to Level 4 proficiency in organizational API governance and technical standards.",
    learningTitle: "Advanced API Governance & Ethics 2024",
    learningMeta: "E-Learning",
    practices: [
      "Attend the monthly API Standards Committee meeting as an observer.",
      "Draft the new API Documentation Policy for the IT Infrastructure team.",
      "Deliver a 15-minute presentation on Zero-Trust API Security to your pod.",
    ],
  },
];

export const initialEvidence: EvidenceItem[] = [
  {
    id: "ev-1",
    fileName: "PaymentGateway_Arch_V2.pdf",
    linkedTo: "Cloud Infrastructure",
    when: "12 Oct",
    status: "verified",
  },
  {
    id: "ev-2",
    fileName: "Q4_Gov_Strategy_Draft.docx",
    linkedTo: "AI Governance",
    when: "Yesterday",
    status: "awaiting_review",
  },
];

export const initialTimeline: TimelineEvent[] = [
  {
    id: "tl-now",
    when: "Active Now",
    title: "Working on API Governance",
    detail: "40% of learning objectives complete.",
    active: true,
  },
  {
    id: "tl-1",
    when: "12 Oct 2024",
    title: "Cloud Infrastructure Design Verified",
    detail: "Verified by Michael Kyle at Level 4 (Expert).",
  },
  {
    id: "tl-2",
    when: "05 Oct 2024",
    title: "Annual Assessment Submitted",
    detail: "Completed 12/12 skill self-ratings.",
  },
  {
    id: "tl-3",
    when: "15 Sep 2024",
    title: "Role Alignment Completed",
    detail: "Matched to Senior Solutions Architect profile.",
  },
];
