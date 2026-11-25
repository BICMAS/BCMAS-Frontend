/**
 * Skills marked essential to safety or compliance in a role profile. Any gap in an essential skill is
 * critical (capability assessment methodology §6). Applies to cycles activated after the change.
 * Sample data in the browser; the backend stores the flag on the profile version, with who and when.
 */
import { listRoleRecords } from "./mock-roles";

type Entry = { skills: string[]; by: string; at: string };

const STORAGE_KEY = "bcms-essential-skills-v1";
let state: Record<string, Entry> = {};
let loaded = false;
let revision = 0;
const listeners = new Set<() => void>();

function db() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) state = JSON.parse(raw) as Record<string, Entry>;
    } catch {
      /* Start empty when stored JSON cannot be read. */
    }
  }
  return state;
}

function changed() {
  revision += 1;
  listeners.forEach((l) => l());
}

export function subscribeEssentialSkills(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function essentialSkillsRevision() {
  return revision;
}

export function essentialSkills(roleId: string): Entry | null {
  return db()[roleId] ?? null;
}

export function isEssentialSkill(roleId: string, skill: string) {
  return db()[roleId]?.skills.includes(skill) ?? false;
}

/** Only the HR Admin (the organisation's main HR) decides which skills are essential. */
export function canEditEssentialSkills(portal: string | undefined) {
  return portal === "organisation_admin";
}

export function setEssentialSkill(user: { name: string; portal: string }, roleId: string, skill: string, essential: boolean) {
  if (!canEditEssentialSkills(user.portal)) throw new Error("Only an HR Admin can change this.");
  const role = listRoleRecords().find((r) => r.id === roleId);
  if (!role || ![...role.technicalSkills.map((s) => s.name), ...role.behaviouralSkills].includes(skill)) {
    throw new Error("That skill is not in this role profile.");
  }
  const current = new Set(db()[roleId]?.skills ?? []);
  if (essential) current.add(skill);
  else current.delete(skill);
  state = { ...state, [roleId]: { skills: [...current], by: user.name, at: new Date().toISOString() } };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage unavailable: kept for this page. */
  }
  changed();
}

/** Test helper. */
export function resetEssentialSkills() {
  state = {};
  loaded = true;
  changed();
}
