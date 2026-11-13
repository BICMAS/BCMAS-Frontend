"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  defaultMockUserId,
  getMockOrganisation,
  getMockUser,
  mockOrganisations,
} from "@/config/mock-users";
import type { MockOrganisation, MockUser } from "@/types/user";

type SessionState = {
  userId: string;
  organisationId: string;
  user: MockUser;
  organisation: MockOrganisation;
  organisations: MockOrganisation[];
  setUserId: (userId: string) => void;
  setOrganisationId: (organisationId: string) => void;
};

function resolveSession(userId: string, organisationId?: string) {
  const user = getMockUser(userId);
  const orgId = organisationId ?? user.organisationId;
  return {
    userId: user.id,
    organisationId: orgId,
    user,
    organisation: getMockOrganisation(orgId),
    organisations: mockOrganisations,
  };
}

/**
 * Mock session for shell development. Replace with real auth later.
 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...resolveSession(defaultMockUserId),
      setUserId: (userId) => {
        const next = resolveSession(userId);
        set(next);
      },
      setOrganisationId: (organisationId) =>
        set((state) => ({
          organisationId,
          organisation: getMockOrganisation(organisationId),
          user: state.user,
        })),
    }),
    {
      name: "bcms-mock-session",
      partialize: (state) => ({
        userId: state.userId,
        organisationId: state.organisationId,
      }),
      merge: (persisted, current) => {
        const partial = persisted as
          | { userId?: string; organisationId?: string }
          | undefined;
        const resolved = resolveSession(
          partial?.userId ?? defaultMockUserId,
          partial?.organisationId,
        );
        return {
          ...current,
          ...resolved,
        };
      },
    },
  ),
);
