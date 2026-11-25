import type { MockOrganisation, MockUser } from "@/types/user";

/**
 * Organisations and first admin accounts created on the New Tenant Provisioning page.
 * Kept apart from the seeded personas so `getMockUser` / `getMockOrganisation` (and so sign-in,
 * the workspace switcher and the dev persona switcher) can find them. Sample data only:
 * the backend creates the organisation and invites the admin.
 */

type Registry = { organisations: MockOrganisation[]; users: MockUser[] };

const STORAGE_KEY = "bcms-provisioned-tenants-v1";
let registry: Registry | null = null;

function read(): Registry {
  if (registry) return registry;
  if (typeof window === "undefined") return { organisations: [], users: [] };
  registry = { organisations: [], users: [] };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) registry = JSON.parse(raw) as Registry;
  } catch {
    /* Unreadable storage: start empty. */
  }
  return registry;
}

export function provisionedOrganisations(): MockOrganisation[] {
  return read().organisations;
}

export function provisionedUsers(): MockUser[] {
  return read().users;
}

export function registerProvisionedTenant(organisation: MockOrganisation, admin: MockUser) {
  const current = read();
  registry = {
    organisations: [...current.organisations.filter((o) => o.id !== organisation.id), organisation],
    users: [...current.users.filter((u) => u.id !== admin.id), admin],
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch {
    /* Storage unavailable: kept for this page only. */
  }
}

/** Test helper. */
export function resetProvisionedTenants() {
  registry = { organisations: [], users: [] };
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Adds or updates one person (an activated account). */
export function registerProvisionedUser(user: MockUser) {
  const current = read();
  registry = { ...current, users: [...current.users.filter((u) => u.id !== user.id), user] };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch {
    /* Storage unavailable: kept for this page only. */
  }
}
