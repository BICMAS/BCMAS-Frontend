import { mockLatency } from "@/lib/mock/delay";

export const libraryTypes = [
  "Knowledge tests",
  "Situational judgement",
  "Case studies",
  "AI role-play",
  "Practical exercises",
  "Behavioural assessment",
] as const;

export type LibraryType = (typeof libraryTypes)[number];

export type LibraryItem = {
  id: string;
  title: string;
  type: LibraryType;
  skillTag: string;
  reusableRoles: string[];
  durationMinutes: number;
};

let sequence = 20;
let libraryItems: LibraryItem[] = seedLibrary();

export function listLibraryItems() {
  return libraryItems.map((item) => ({ ...item, reusableRoles: [...item.reusableRoles] }));
}

export function resolveLibraryItems(ids: string[]) {
  return ids
    .map((id) => libraryItems.find((item) => item.id === id))
    .filter((item): item is LibraryItem => Boolean(item))
    .map((item) => ({ ...item, reusableRoles: [...item.reusableRoles] }));
}

export async function createLibraryItem(input: {
  title: string;
  type: LibraryType;
  skillTag: string;
  reusableRoles: string[];
  durationMinutes: number;
}) {
  await mockLatency(400);
  sequence += 1;
  const record: LibraryItem = {
    id: `lib-${sequence}`,
    title: input.title.trim(),
    type: input.type,
    skillTag: input.skillTag.trim(),
    reusableRoles: input.reusableRoles.map((role) => role.trim()).filter(Boolean),
    durationMinutes: input.durationMinutes,
  };
  libraryItems = [record, ...libraryItems];
  return { ...record, reusableRoles: [...record.reusableRoles] };
}

function seedLibrary(): LibraryItem[] {
  return [
    {
      id: "lib-rsm-knowledge",
      title: "Regional sales knowledge test",
      type: "Knowledge tests",
      skillTag: "Regional sales planning",
      reusableRoles: ["Regional Sales Manager", "Key Account Manager"],
      durationMinutes: 20,
    },
    {
      id: "lib-kam-sjt",
      title: "Account negotiation judgement",
      type: "Situational judgement",
      skillTag: "Key account negotiation",
      reusableRoles: ["Regional Sales Manager", "Key Account Manager"],
      durationMinutes: 25,
    },
    {
      id: "lib-rsm-case",
      title: "Territory plan case",
      type: "Case studies",
      skillTag: "Regional sales planning",
      reusableRoles: ["Regional Sales Manager", "Trade Marketing Manager"],
      durationMinutes: 30,
    },
    {
      id: "lib-rsm-roleplay",
      title: "Sales leadership role-play",
      type: "AI role-play",
      skillTag: "Team leadership",
      reusableRoles: ["Regional Sales Manager", "Engineering Lead"],
      durationMinutes: 20,
    },
    {
      id: "lib-ssa-practical",
      title: "Architecture practical",
      type: "Practical exercises",
      skillTag: "Cloud Infrastructure Design",
      reusableRoles: ["Senior Solutions Architect", "Engineering Lead"],
      durationMinutes: 40,
    },
    {
      id: "lib-behaviour",
      title: "Leadership behaviours",
      type: "Behavioural assessment",
      skillTag: "Leadership & Mentoring",
      reusableRoles: ["Engineering Lead", "Senior Solutions Architect", "Regional Sales Manager"],
      durationMinutes: 20,
    },
    {
      id: "lib-sales-practical",
      title: "Pipeline forecast exercise",
      type: "Practical exercises",
      skillTag: "Pipeline management",
      reusableRoles: ["Sales Manager"],
      durationMinutes: 30,
    },
    {
      id: "lib-tmm-case",
      title: "Trade plan case",
      type: "Case studies",
      skillTag: "Trade planning",
      reusableRoles: ["Trade Marketing Manager"],
      durationMinutes: 30,
    },
    {
      id: "lib-kam-knowledge",
      title: "Account planning knowledge test",
      type: "Knowledge tests",
      skillTag: "Account planning",
      reusableRoles: ["Key Account Manager"],
      durationMinutes: 20,
    },
  ];
}
