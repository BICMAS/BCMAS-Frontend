import type { MockOrganisation, MockUser } from "@/types/user";

export const mockOrganisations: MockOrganisation[] = [
  {
    id: "org-gec",
    name: "Global Enterprise Corp",
    shortName: "GEC",
  },
  {
    id: "org-ths",
    name: "TechHealth Solutions",
    shortName: "THS",
  },
];

/**
 * Development personas — switch via DevRoleSwitcher. No real auth yet.
 */
export const mockUsers: MockUser[] = [
  {
    id: "user-alex",
    name: "Alex Root",
    email: "alex.root@bicmas.com",
    roleLabel: "Platform Super Admin",
    portal: "platform_super_admin",
    jobTitle: "Platform Lead",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-9.jpg",
    organisationId: "org-gec",
    unreadNotifications: 2,
  },
  {
    id: "user-sarah",
    name: "Sarah Jenkins",
    email: "sarah.jenkins@gec.example",
    roleLabel: "Organisation Admin",
    portal: "organisation_admin",
    jobTitle: "Organisation Administrator",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg",
    organisationId: "org-gec",
    unreadNotifications: 3,
  },
  {
    id: "user-priya",
    name: "Priya Nair",
    email: "priya.nair@gec.example",
    roleLabel: "L&D Administrator",
    portal: "hr_ld_admin",
    jobTitle: "Head of L&D",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-5.jpg",
    organisationId: "org-gec",
    unreadNotifications: 5,
  },
  {
    id: "user-michael",
    name: "Michael Kyle",
    email: "michael.kyle@gec.example",
    roleLabel: "Line Manager",
    portal: "line_manager",
    jobTitle: "IT Infrastructure Manager",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-2.jpg",
    organisationId: "org-gec",
    unreadNotifications: 4,
  },
  {
    id: "user-james",
    name: "James Miller",
    email: "james.miller@gec.example",
    roleLabel: "Employee",
    portal: "employee",
    jobTitle: "Senior Solutions Architect",
    avatarUrl:
      "https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-6.jpg",
    organisationId: "org-gec",
    unreadNotifications: 2,
  },
];

export const defaultMockUserId = "user-sarah";

export function getMockUser(id: string): MockUser {
  return mockUsers.find((user) => user.id === id) ?? mockUsers[1]!;
}

export function getMockOrganisation(id: string): MockOrganisation {
  return (
    mockOrganisations.find((org) => org.id === id) ?? mockOrganisations[0]!
  );
}
