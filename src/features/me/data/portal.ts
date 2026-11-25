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
  /** Title the employee gives the evidence; older items only have a file name. */
  title?: string;
  fileName: string;
  /** Every attachment submitted with this evidence (fileName is the first). */
  fileNames?: string[];
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
  /** Optional page this event links to, e.g. the learning page for active work. */
  href?: string;
};

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
    href: "/learning",
  },
  {
    id: "tl-1",
    when: "12 Oct 2024",
    title: "Cloud Infrastructure Design Verified",
    detail: "Verified by Michael Kyle at Level 4 – Advanced.",
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
