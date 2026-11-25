
export function avatar(n: number) {
  return `https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-${n}.jpg`;
}

export type TeamMember = {
  id: string;
  name: string;
  title: string;
  dept: string;
  avatarUrl: string;
  match: number;
  gaps: number;
  pendingAssessments: number;
  status: string;
  evidenceCount: number;
  growth: string;
};

export const teamMembers: TeamMember[] = [
  {
    id: "james",
    name: "James Miller",
    title: "Senior Solutions Architect",
    dept: "IT Dept",
    avatarUrl: avatar(2),
    match: 92,
    gaps: 1,
    pendingAssessments: 2,
    status: "Aligned",
    evidenceCount: 1,
    growth: "Active",
  },
  {
    id: "sarah-connor",
    name: "Sarah Connor",
    title: "Cloud Architect",
    dept: "IT Dept",
    avatarUrl: avatar(5),
    match: 78,
    gaps: 0,
    pendingAssessments: 0,
    status: "Review Ready",
    evidenceCount: 3,
    growth: "Active",
  },
  {
    id: "robert",
    name: "Robert Chen",
    title: "Lead Data Engineer",
    dept: "IT Dept",
    avatarUrl: avatar(3),
    match: 68,
    gaps: 2,
    pendingAssessments: 1,
    status: "In Progress",
    evidenceCount: 0,
    growth: "Active",
  },
];

export function getTeamMember(id: string) {
  return teamMembers.find((member) => member.id === id) ?? null;
}

export type GrowthPlan = {
  id: string;
  memberId: string;
  skill: string;
  due: string;
  verifiedLevel: string;
  requiredLevel: string;
  objective: string;
  learningTitle: string;
  learningMeta: string;
  practices: string[];
  owner: string;
};

export const growthPlans: GrowthPlan[] = [
  {
    id: "plan-james-ai",
    memberId: "james",
    skill: "Advanced AI Governance",
    due: "15 Nov 2024",
    verifiedLevel: "Level 2",
    requiredLevel: "Level 4",
    objective:
      "Master organizational AI ethics frameworks and achieve certified expert status.",
    learningTitle: "Advanced AI Governance 2024",
    learningMeta: "E-Learning · 6 Modules",
    practices: [
      "Shadow the AI Safety Committee for 2 weekly sessions and contribute to the risk register.",
      "Draft the Q4 Governance update for the IT Department Lead.",
    ],
    owner: "Michael Kyle (Manager)",
  },
  {
    id: "plan-robert-infra",
    memberId: "robert",
    skill: "Infrastructure Design",
    due: "20 Dec 2024",
    verifiedLevel: "Level 3",
    requiredLevel: "Level 4",
    objective: "Mentor 2 junior engineers through a production infrastructure change.",
    learningTitle: "Cloud Migration Mentoring",
    learningMeta: "Workplace practice",
    practices: ["Pair on one production change and record the design decision."],
    owner: "Michael Kyle (Manager)",
  },
];

export function getGrowthPlan(id: string) {
  return growthPlans.find((plan) => plan.id === id) ?? null;
}

export type CatalogueItem = {
  id: string;
  title: string;
  description: string;
  kind: string;
  provider: string;
  tags: string[];
  meta: string;
  action: "Assign" | "Enroll";
  category: "internal" | "practice" | "coaching" | "elearning" | "workshop";
};

export const catalogue: CatalogueItem[] = [
  {
    id: "asset-ai",
    title: "Advanced AI Governance 2024",
    description:
      "Comprehensive guide to organizational AI ethics, safety frameworks and regulatory compliance.",
    kind: "E-Learning",
    provider: "Coursera",
    tags: ["AI Governance (L4)", "Ethics"],
    meta: "12 Hours",
    action: "Assign",
    category: "elearning",
  },
  {
    id: "asset-influence",
    title: "Strategic Influence Masterclass",
    description:
      "High-impact communication techniques for technical leaders dealing with executive stakeholders.",
    kind: "Workshop",
    provider: "Internal",
    tags: ["Influence (L3-5)", "Leadership"],
    meta: "15 Nov Session",
    action: "Enroll",
    category: "workshop",
  },
  {
    id: "asset-cloud",
    title: "Cloud Migration Mentoring",
    description:
      "Structure for 1-on-1 workplace shadowing and hands-on practice in cloud resource provisioning.",
    kind: "Workplace Practice",
    provider: "Framework Guide",
    tags: ["Cloud Architecture (L2)"],
    meta: "Practical",
    action: "Assign",
    category: "practice",
  },
  {
    id: "asset-coach",
    title: "AI Governance Stakeholder Simulation",
    description: "Practice explaining retention and ethics constraints to a CPO persona.",
    kind: "AI Coaching",
    provider: "BICMAS Coach",
    tags: ["AI Governance (L4)"],
    meta: "18 mins",
    action: "Assign",
    category: "coaching",
  },
];
