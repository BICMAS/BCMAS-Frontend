/**
 * Capability assessment programme: how many cycles a department (or the whole organisation)
 * runs per year, and the month-by-month windows that gives everyone.
 */

export type CyclesPerYear = 1 | 2 | 3 | 4;

export const CYCLE_OPTIONS: { value: CyclesPerYear; label: string }[] = [
  { value: 1, label: "Annual" },
  { value: 2, label: "Biannual" },
  { value: 3, label: "Three cycles" },
  { value: 4, label: "Quarterly" },
];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type AssessmentWindow = {
  cycle: number;
  /** e.g. "January – June" */
  period: string;
  /** Month the manager verification must be completed by, e.g. "June 2027". */
  verificationDeadline: string;
};

/** Splits the year into equal windows; verification is due in the last month of each window. */
export function buildSchedule(cycles: CyclesPerYear, year: number): AssessmentWindow[] {
  const span = 12 / cycles;
  return Array.from({ length: cycles }, (_, i) => {
    const first = MONTHS[i * span]!;
    const last = MONTHS[i * span + span - 1]!;
    return {
      cycle: i + 1,
      period: `${first} – ${last}`,
      verificationDeadline: `${last} ${year}`,
    };
  });
}

export const ORGANISATION_SCOPE = "Entire organisation";

/** Assessment scopes: the whole organisation or a single department. */
export const ASSESSMENT_SCOPES = [
  ORGANISATION_SCOPE,
  "Information Technology",
  "Human Resources",
  "Finance & Accounting",
  "Operations",
  "Legal",
];
