import { mockLatency } from "@/lib/mock/delay";

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

export type EvidenceDecision = "verified" | "more_evidence" | "not_verified";

export type EvidenceItem = {
  id: string;
  memberId: string;
  skill: string;
  quote: string;
  fileName: string;
  fileMeta: string;
  decision: EvidenceDecision | null;
  feedback: string;
};

let evidenceItems: EvidenceItem[] = [
  {
    id: "evidence-james",
    memberId: "james",
    skill: "Cloud Infrastructure Design",
    quote:
      "I led the migration of the core payment gateway to Azure. Attached is the architecture diagram (G-02) showing multi-region redundancy and the security group patterns I defined.",
    fileName: "PaymentGateway_Arch_V2.pdf",
    fileMeta: "2.4 MB · G-02",
    decision: null,
    feedback: "",
  },
  {
    id: "evidence-elena",
    memberId: "elena",
    skill: "People Analytics",
    quote: "No supporting file has been attached for this self-assessment.",
    fileName: "",
    fileMeta: "Missing evidence",
    decision: null,
    feedback: "",
  },
];

export const elena = {
  id: "elena",
  name: "Elena Rodriguez",
  title: "HR Specialist",
  dept: "People",
  avatarUrl: avatar(4),
};

export function listEvidence() {
  return evidenceItems;
}

export function getEvidence(id: string) {
  return evidenceItems.find((item) => item.id === id) ?? null;
}

export function jamesVerificationStatus() {
  const item = getEvidence("evidence-james");
  if (!item?.decision) return "Awaiting Verification" as const;
  if (item.decision === "verified") return "Verified" as const;
  if (item.decision === "more_evidence") return "Changes Requested" as const;
  return "Not Yet Verified" as const;
}

export async function submitVerification(
  id: string,
  decision: EvidenceDecision,
  feedback: string,
) {
  await mockLatency(400);
  evidenceItems = evidenceItems.map((item) =>
    item.id === id ? { ...item, decision, feedback } : item,
  );
  return getEvidence(id);
}

export type AssessmentCycle = {
  id: string;
  name: string;
  scope: string;
  status: "Active" | "Completed" | "Archived";
  completion: number;
  completedDate: string;
};

let cycles: AssessmentCycle[] = [
  {
    id: "cycle-q3",
    name: "2024 Q3 Strategic Alignment",
    scope: "IT & Product Depts",
    status: "Completed",
    completion: 100,
    completedDate: "30 Sep 2024",
  },
  {
    id: "cycle-2023",
    name: "2023 Annual Performance",
    scope: "Global Org",
    status: "Archived",
    completion: 94,
    completedDate: "15 Dec 2023",
  },
];

export function listCycles() {
  return cycles;
}

export async function createCycle(name: string) {
  await mockLatency(400);
  const cycle: AssessmentCycle = {
    id: `cycle-${Date.now()}`,
    name: name.trim(),
    scope: "Global Enterprise Corp",
    status: "Active",
    completion: 0,
    completedDate: "In progress",
  };
  cycles = [cycle, ...cycles];
  return cycle;
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
  category: "gap" | "internal" | "practice" | "coaching" | "elearning";
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
    category: "internal",
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

export const assessmentSkills = [
  {
    id: "cloud",
    name: "Cloud Infrastructure Design",
    target: "Level 4 (Expert)",
    indicators: [
      "Configures and deploys virtual networks, subnets, and security groups following patterns.",
      "Troubleshoots common connectivity and performance issues within cloud environments independently.",
      "Utilises Infrastructure as Code (IaC) templates to provision standard resource stacks.",
    ],
  },
  {
    id: "micro",
    name: "Microservices",
    target: "Level 4 (Expert)",
    indicators: [
      "Splits a domain into independently deployable services with clear ownership.",
      "Defines failure handling for synchronous calls between services.",
    ],
  },
  {
    id: "infra",
    name: "Infrastructure Design",
    target: "Level 4 (Expert)",
    indicators: [
      "Designs for high availability and zero-trust access.",
      "Documents the operating model for the platform team.",
    ],
  },
  {
    id: "cyber",
    name: "Cyber Security",
    target: "Level 3 (Proficient)",
    indicators: [
      "Applies the organisation security baseline to a new workload.",
      "Explains residual risk to a non-technical sponsor.",
    ],
  },
  {
    id: "api",
    name: "API Management",
    target: "Level 4 (Expert)",
    indicators: [
      "Defines expiry and access rules for customer data exposed through APIs.",
      "Reviews a partner integration against the API standard.",
    ],
  },
];

const ratings: Record<string, number> = {};

export function getRating(skillId: string) {
  return ratings[skillId] ?? 0;
}

export function saveRating(skillId: string, level: number) {
  ratings[skillId] = level;
}

export function ratedCount() {
  return assessmentSkills.filter((skill) => ratings[skill.id]).length;
}
