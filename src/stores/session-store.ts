"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  allOrganisations,
  defaultMockUserId,
  getMockOrganisation,
  getMockUser,
} from "@/config/mock-users";
import type { SessionUser } from "@/lib/bcms-api/session-user";
import type { MockOrganisation, MockUser } from "@/types/user";

type SessionState = {
  userId: string;
  organisationId: string;
  user: MockUser;
  organisation: MockOrganisation;
  organisations: MockOrganisation[];
  /** The person signed in through the BCMS backend; null for the sample personas. */
  liveUser: SessionUser | null;
  setUserId: (userId: string) => void;
  setOrganisationId: (organisationId: string) => void;
  /** After a real sign-in. */
  setLiveUser: (user: SessionUser) => void;
  /** After signing out: back to the sample personas. */
  clearLiveUser: () => void;
};

function resolveSession(userId: string, organisationId?: string) {
  const user = getMockUser(userId);
  const orgId = organisationId ?? user.organisationId;
  return {
    userId: user.id,
    organisationId: orgId,
    user,
    organisation: getMockOrganisation(orgId),
    organisations: allOrganisations(),
    liveUser: null,
  };
}

/** A real person belongs to their own organisation only. */
function liveSession(liveUser: SessionUser) {
  const { organisationName, ...user } = liveUser;
  const shortName = organisationName.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 3).toUpperCase();
  const organisation: MockOrganisation = { id: user.organisationId, name: organisationName, shortName };
  return {
    userId: user.id,
    organisationId: user.organisationId,
    user,
    organisation,
    organisations: [organisation],
    liveUser,
  };
}

/**
 * The signed-in session. A real sign-in (NEXT_PUBLIC_AUTH_MODE=live) stores the person the backend
 * returned; the token itself stays in an httpOnly cookie. Otherwise the sample personas are used.
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
        set((state) =>
          state.liveUser
            ? {}
            : {
                organisationId,
                organisation: getMockOrganisation(organisationId),
                organisations: allOrganisations(),
                user: state.user,
              },
        ),
      setLiveUser: (user) => set(liveSession(user)),
      clearLiveUser: () => set(resolveSession(defaultMockUserId)),
    }),
    {
      name: "bcms-mock-session",
      partialize: (state) => ({
        userId: state.userId,
        organisationId: state.organisationId,
        liveUser: state.liveUser,
      }),
      merge: (persisted, current) => {
        const partial = persisted as
          | { userId?: string; organisationId?: string; liveUser?: SessionUser | null }
          | undefined;
        const resolved = partial?.liveUser
          ? liveSession(partial.liveUser)
          : resolveSession(partial?.userId ?? defaultMockUserId, partial?.organisationId);
        return {
          ...current,
          ...resolved,
        };
      },
    },
  ),
);
