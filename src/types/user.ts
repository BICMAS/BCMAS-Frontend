import type { AppRole, UserPortal } from "@/types";

export type MockOrganisation = {
  id: string;
  name: string;
  shortName: string;
};

export type MockUser = {
  id: string;
  name: string;
  email: string;
  roleLabel: AppRole;
  portal: UserPortal;
  jobTitle: string;
  avatarUrl: string;
  organisationId: string;
  unreadNotifications: number;
};
