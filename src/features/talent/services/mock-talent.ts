export type TalentAssessmentType = "recruitment" | "promotion";

export type Readiness = "Ready" | "Near Ready" | "Not Ready";

export type TalentAssessment = {
  id: string;
  name: string;
  type: TalentAssessmentType;
  targetRole: string;
  result: number;
  readiness: Readiness;
  status: "Completed";
};

export type TalentPipelineSlice = {
  label: string;
  count: number;
  share: string;
  color: string;
};

export type TalentMethod = {
  id: string;
  title: string;
  detail: string;
  href?: string;
};

export const talentMetrics = [
  { label: "Candidates Assessed", value: "38", note: "Recruitment" },
  { label: "Employees Assessed", value: "24", note: "Promotion" },
  { label: "Role Readiness Rate", value: "68%", note: "Promotion" },
  { label: "Hiring Decisions Supported", value: "12", note: "Recruitment" },
  { label: "Assessment Utilisation", value: "+26pp", note: "Vs. previous period" },
] as const;

export const talentPipeline: TalentPipelineSlice[] = [
  { label: "Completed", count: 38, share: "61%", color: "#72c900" },
  { label: "In Progress", count: 12, share: "19%", color: "#f5c542" },
  { label: "Invited", count: 8, share: "13%", color: "#3b82f6" },
  { label: "Awaiting Review", count: 4, share: "7%", color: "#cbd5e1" },
];

export const talentPipelineTotal = 62;

export const talentPipelineGradient = talentPipeline
  .reduce(
    (state, slice) => {
      const span = (slice.count / talentPipelineTotal) * 360;
      return {
        cursor: state.cursor + span,
        parts: [...state.parts, `${slice.color} ${state.cursor}deg ${state.cursor + span}deg`],
      };
    },
    { cursor: 0, parts: [] as string[] },
  )
  .parts.join(", ");

export const roleReadiness = [
  { role: "Regional Sales Manager", percent: 78 },
  { role: "Key Account Manager", percent: 72 },
  { role: "Trade Marketing Manager", percent: 68 },
  { role: "Supply Chain Manager", percent: 63 },
] as const;

export const talentAssessments: TalentAssessment[] = [
  {
    id: "david-kalu",
    name: "David Kalu",
    type: "recruitment",
    targetRole: "Regional Sales Manager",
    result: 72,
    readiness: "Not Ready",
    status: "Completed",
  },
  {
    id: "aisha-okafor",
    name: "Aisha Okafor",
    type: "recruitment",
    targetRole: "Key Account Manager",
    result: 88,
    readiness: "Ready",
    status: "Completed",
  },
  {
    id: "tunde-martins",
    name: "Tunde Martins",
    type: "promotion",
    targetRole: "Regional Sales Manager",
    result: 76,
    readiness: "Near Ready",
    status: "Completed",
  },
  {
    id: "funmi-nwosu",
    name: "Funmi Nwosu",
    type: "promotion",
    targetRole: "Trade Marketing Manager",
    result: 62,
    readiness: "Not Ready",
    status: "Completed",
  },
  {
    id: "ifeoma-obi",
    name: "Ifeoma Obi",
    type: "recruitment",
    targetRole: "Sales Manager",
    result: 85,
    readiness: "Ready",
    status: "Completed",
  },
];

export const talentMethods: TalentMethod[] = [
  { id: "knowledge", title: "Knowledge & Test", detail: "Role and product knowledge" },
  { id: "scenario", title: "Scenario & Case Study", detail: "Business situations" },
  {
    id: "roleplay",
    title: "AI Role Play",
    detail: "Realistic interactions",
    href: "/ai-coach/scenarios",
  },
  { id: "practical", title: "Practical Task", detail: "Job simulation" },
  { id: "behaviour", title: "Behavioural Assessment", detail: "Competencies and values" },
  { id: "manager", title: "Manager Review", detail: "For internal candidates" },
];

export function listTalentAssessments() {
  return talentAssessments;
}

export function getTalentAssessment(id: string, type?: TalentAssessmentType) {
  return (
    talentAssessments.find(
      (item) => item.id === id && (type ? item.type === type : true),
    ) ?? null
  );
}

export function talentAssessmentHref(item: TalentAssessment) {
  return item.type === "recruitment"
    ? `/talent/recruitment/${item.id}`
    : `/talent/promotion/${item.id}`;
}

export function talentReportText() {
  const rows = talentAssessments
    .map(
      (item) =>
        `${item.name}\t${item.type}\t${item.targetRole}\t${item.result}%\t${item.readiness}\t${item.status}`,
    )
    .join("\n");
  return `Talent Assessment & Selection\nCandidates assessed: 38\nEmployees assessed: 24\nRole readiness rate: 68%\nHiring decisions supported: 12\nAssessment utilisation: +26pp\n\nName\tType\tTarget role\tResult\tReadiness\tStatus\n${rows}\n`;
}
