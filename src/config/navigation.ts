import {
  BotIcon,
  Building2Icon,
  ChartPieIcon,
  CirclePlusIcon,
  ClipboardCheckIcon,
  CpuIcon,
  GraduationCapIcon,
  HeadphonesIcon,
  HomeIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  LibraryIcon,
  LineChartIcon,
  NetworkIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  ShieldUserIcon,
  SparklesIcon,
  ListChecksIcon,
  TargetIcon,
  UserCogIcon,
  UsersIcon,
  WaypointsIcon,
} from "lucide-react";

import type { NavigationConfig } from "@/types/navigation";
import type { UserPortal } from "@/types";

/**
 * Role-scoped navigation from HTML sidebars / ROUTE_MAP.
 * Only routes with HTML screens are linked; no invented destinations.
 */
export const navigationByPortal: Record<UserPortal, NavigationConfig> = {
  organisation_admin: {
    portal: "organisation_admin",
    brandLabel: "BICMAS",
    brandSubtitle: "BCMS",
    workspaceLabel: "Admin Hub",
    defaultHref: "/org",
    sections: [
      {
        id: "core-lifecycle",
        title: "Core Lifecycle",
        items: [
          {
            id: "roles",
            label: "Role Requirements",
            href: "/roles",
            icon: NetworkIcon,
            matchPrefix: "/roles",
            children: [
              {
                id: "roles-list",
                label: "Roles Directory",
                href: "/roles",
                icon: NetworkIcon,
              },
              {
                id: "org-overview",
                label: "Organisation Overview",
                href: "/org",
                icon: Building2Icon,
                matchPrefix: "/org",
              },
            ],
          },
          {
            id: "skills",
            label: "Skills Profiles",
            href: "/skills",
            icon: UserCogIcon,
            matchPrefix: "/skills",
            children: [
              {
                id: "skills-library",
                label: "Skills Library",
                href: "/skills",
                icon: LibraryIcon,
              },
              {
                id: "skills-framework",
                label: "Framework Settings",
                href: "/skills/framework",
                icon: SettingsIcon,
              },
            ],
          },
          {
            id: "employees",
            label: "Employee Alignment",
            href: "/employees",
            icon: UsersIcon,
            matchPrefix: "/employees",
            children: [
              {
                id: "employee-directory",
                label: "Employee Directory",
                href: "/employees",
                icon: UsersIcon,
              },
              {
                id: "mapping",
                label: "Mapping Workspace",
                href: "/employees/mapping",
                icon: WaypointsIcon,
              },
              {
                id: "bulk-mapping",
                label: "Bulk Mapping",
                href: "/employees/mapping/bulk",
                icon: ListChecksIcon,
              },
              {
                id: "exceptions",
                label: "Mapping Exceptions",
                href: "/employees/mapping/exceptions",
                icon: TargetIcon,
              },
              {
                id: "import",
                label: "Bulk Import",
                href: "/employees/import",
                icon: CirclePlusIcon,
              },
            ],
          },
          {
            id: "assessments",
            label: "Capability Assessment",
            href: "/assessments/cycles",
            icon: ChartPieIcon,
            matchPrefix: "/assessments",
          },
          {
            id: "learning",
            label: "Learning Delivery",
            href: "/learning",
            icon: GraduationCapIcon,
            matchPrefix: "/learning",
          },
        ],
      },
      {
        id: "admin-hub",
        title: "Admin Hub",
        items: [
          {
            id: "organization",
            label: "Organization",
            href: "/org",
            icon: Building2Icon,
            matchPrefix: "/org",
            children: [
              {
                id: "departments",
                label: "Departments",
                href: "/org/departments",
                icon: Building2Icon,
              },
              {
                id: "org-chart",
                label: "Org Chart",
                href: "/org/chart",
                icon: NetworkIcon,
              },
              {
                id: "bulk-upload",
                label: "Bulk Upload",
                href: "/org/bulk-upload",
                icon: CirclePlusIcon,
              },
            ],
          },
          {
            id: "insights",
            label: "Executive Insights",
            href: "/insights",
            icon: LineChartIcon,
            matchPrefix: "/insights",
          },
          {
            id: "security",
            label: "Security & Roles",
            href: "/settings/security",
            icon: ShieldIcon,
            matchPrefix: "/settings/security",
          },
          {
            id: "settings",
            label: "System Settings",
            href: "/settings/organisation",
            icon: SettingsIcon,
            matchPrefix: "/settings",
            children: [
              {
                id: "org-settings",
                label: "Organisation Profile",
                href: "/settings/organisation",
                icon: Building2Icon,
              },
              {
                id: "users",
                label: "User Management",
                href: "/settings/users",
                icon: UsersIcon,
              },
              {
                id: "governance",
                label: "Audit & Governance",
                href: "/settings/governance",
                icon: ScrollTextIcon,
              },
            ],
          },
        ],
      },
    ],
    mobileTabs: [
      { id: "home", label: "Home", href: "/org", icon: HomeIcon },
      {
        id: "roles",
        label: "Roles",
        href: "/roles",
        icon: NetworkIcon,
        matchPrefix: "/roles",
      },
      {
        id: "team",
        label: "Team",
        href: "/employees",
        icon: UsersIcon,
        matchPrefix: "/employees",
      },
      {
        id: "stats",
        label: "Stats",
        href: "/insights",
        icon: LineChartIcon,
        matchPrefix: "/insights",
      },
    ],
  },

  hr_ld_admin: {
    portal: "hr_ld_admin",
    brandLabel: "BICMAS",
    brandSubtitle: "Growth Hub",
    workspaceLabel: "Development",
    defaultHref: "/ld",
    sections: [
      {
        id: "core-lifecycle",
        title: "Core Lifecycle",
        items: [
          {
            id: "roles",
            label: "Role Requirements",
            href: "/roles",
            icon: NetworkIcon,
            matchPrefix: "/roles",
          },
          {
            id: "employees",
            label: "Employee Alignment",
            href: "/employees",
            icon: UsersIcon,
            matchPrefix: "/employees",
          },
          {
            id: "capability-build",
            label: "Capability Build",
            href: "/assessments/cycles",
            icon: ClipboardCheckIcon,
            matchPrefix: "/assessments",
          },
          {
            id: "talent-assessment",
            label: "Talent Assessment",
            href: "/talent",
            icon: TargetIcon,
            matchPrefix: "/talent",
            children: [
              {
                id: "talent-overview",
                label: "Overview",
                href: "/talent",
                icon: LayoutGridIcon,
              },
              {
                id: "talent-recruitment",
                label: "Recruitment",
                href: "/talent/recruitment",
                icon: ClipboardCheckIcon,
                matchPrefix: "/talent/recruitment",
              },
              {
                id: "talent-promotion",
                label: "Promotion",
                href: "/talent/promotion",
                icon: UsersIcon,
                matchPrefix: "/talent/promotion",
              },
              {
                id: "talent-library",
                label: "Library",
                href: "/talent/library",
                icon: LibraryIcon,
                matchPrefix: "/talent/library",
              },
              {
                id: "talent-insights",
                label: "Insights",
                href: "/talent/insights",
                icon: LineChartIcon,
                matchPrefix: "/talent/insights",
              },
            ],
          },
        ],
      },
      {
        id: "development",
        title: "Development",
        items: [
          {
            id: "ld-dashboard",
            label: "Growth Dashboard",
            href: "/ld",
            icon: LayoutDashboardIcon,
            matchPrefix: "/ld",
          },
          {
            id: "catalogue",
            label: "Capability Library",
            href: "/learning",
            icon: LibraryIcon,
            matchPrefix: "/learning",
          },
          {
            id: "verification",
            label: "Verification",
            href: "/verification",
            icon: ShieldIcon,
            matchPrefix: "/verification",
            children: [
              {
                id: "verification-overview",
                label: "Overview",
                href: "/verification",
                icon: LayoutGridIcon,
              },
              {
                id: "verification-results",
                label: "Results & Audit",
                href: "/verification/results",
                icon: ScrollTextIcon,
              },
            ],
          },
          {
            id: "ai-scenarios",
            label: "Scenario Library",
            href: "/ai-coach/scenarios",
            icon: SparklesIcon,
            matchPrefix: "/ai-coach",
          },
          {
            id: "learning-insights",
            label: "Learning & ROI",
            href: "/insights/learning",
            icon: LineChartIcon,
            matchPrefix: "/insights",
          },
        ],
      },
    ],
    mobileTabs: [
      { id: "home", label: "Home", href: "/ld", icon: HomeIcon },
      {
        id: "assess",
        label: "Assess",
        href: "/assessments/cycles",
        icon: ClipboardCheckIcon,
        matchPrefix: "/assessments",
      },
      {
        id: "learn",
        label: "Learn",
        href: "/learning",
        icon: GraduationCapIcon,
        matchPrefix: "/learning",
      },
      {
        id: "verify",
        label: "Verify",
        href: "/verification",
        icon: ShieldIcon,
        matchPrefix: "/verification",
      },
    ],
  },

  line_manager: {
    portal: "line_manager",
    brandLabel: "BICMAS",
    brandSubtitle: "Team Hub",
    workspaceLabel: "Line Manager Workspace",
    defaultHref: "/manager",
    sections: [
      {
        id: "my-team",
        title: "My Team",
        items: [
          {
            id: "team-dashboard",
            label: "Team Dashboard",
            href: "/manager",
            icon: LayoutDashboardIcon,
            matchPrefix: "/manager",
          },
          {
            id: "team-directory",
            label: "Team Directory",
            href: "/manager/team",
            icon: UsersIcon,
            matchPrefix: "/manager/team",
          },
          {
            id: "promotion-review",
            label: "Promotion Review",
            href: "/manager/promotion",
            icon: ClipboardCheckIcon,
            matchPrefix: "/manager/promotion",
          },
          {
            id: "verification-queue",
            label: "Verification Queue",
            href: "/verification/team",
            icon: ClipboardCheckIcon,
            matchPrefix: "/verification",
          },
          {
            id: "gaps",
            label: "Team Progress",
            href: "/insights/gaps",
            icon: TargetIcon,
            matchPrefix: "/insights/gaps",
          },
        ],
      },
    ],
    mobileTabs: [
      { id: "home", label: "Home", href: "/manager", icon: HomeIcon },
      {
        id: "team",
        label: "Team",
        href: "/manager/team",
        icon: UsersIcon,
        matchPrefix: "/manager/team",
      },
      {
        id: "verify",
        label: "Verify",
        href: "/verification/team",
        icon: ClipboardCheckIcon,
        matchPrefix: "/verification",
      },
      {
        id: "gaps",
        label: "Gaps",
        href: "/insights/gaps",
        icon: LineChartIcon,
        matchPrefix: "/insights",
      },
    ],
  },

  employee: {
    portal: "employee",
    brandLabel: "BICMAS",
    brandSubtitle: "My Growth",
    workspaceLabel: "Employee Workspace",
    defaultHref: "/me",
    sections: [
      {
        id: "journey",
        title: "Journey",
        items: [
          {
            id: "home",
            label: "Home",
            href: "/me",
            icon: HomeIcon,
          },
          {
            id: "skills",
            label: "Role & Skills",
            href: "/me/skills",
            icon: UserCogIcon,
            matchPrefix: "/me/skills",
          },
          {
            id: "growth",
            label: "Growth Hub",
            href: "/me/growth",
            icon: TargetIcon,
            matchPrefix: "/me/growth",
          },
          {
            id: "progress",
            label: "My Progress",
            href: "/me/progress",
            icon: LineChartIcon,
            matchPrefix: "/me/progress",
          },
          {
            id: "promotion",
            label: "Promotion",
            href: "/me/promotion",
            icon: ClipboardCheckIcon,
            matchPrefix: "/me/promotion",
          },
        ],
      },
      {
        id: "practice",
        title: "Practice",
        items: [
          {
            id: "ai-coach",
            label: "AI Coach",
            href: "/ai-coach",
            icon: BotIcon,
            matchPrefix: "/ai-coach",
          },
          {
            id: "learning",
            label: "Learning Library",
            href: "/learning",
            icon: LibraryIcon,
            matchPrefix: "/learning",
          },
        ],
      },
    ],
    mobileTabs: [
      { id: "home", label: "Home", href: "/me", icon: HomeIcon },
      {
        id: "skills",
        label: "Skills",
        href: "/me/skills",
        icon: UserCogIcon,
        matchPrefix: "/me/skills",
      },
      {
        id: "growth",
        label: "Growth",
        href: "/me/growth",
        icon: TargetIcon,
        matchPrefix: "/me/growth",
      },
      {
        id: "coach",
        label: "Coach",
        href: "/ai-coach",
        icon: BotIcon,
        matchPrefix: "/ai-coach",
      },
    ],
  },

  platform_super_admin: {
    portal: "platform_super_admin",
    brandLabel: "BICMAS COMMAND",
    brandSubtitle: "Vendor Administration",
    workspaceLabel: "Platform Control",
    defaultHref: "/platform",
    sections: [
      {
        id: "platform-control",
        title: "Platform Control",
        items: [
          {
            id: "dashboard",
            label: "Dashboard",
            href: "/platform",
            icon: LayoutGridIcon,
          },
          {
            id: "tenants",
            label: "Tenant Directory",
            href: "/platform/tenants",
            icon: Building2Icon,
            matchPrefix: "/platform/tenants",
          },
        ],
      },
      {
        id: "support-ops",
        title: "Support Ops",
        items: [
          {
            id: "assumed-access",
            label: "Assumed Access",
            href: "/platform/support/access",
            icon: ShieldUserIcon,
            matchPrefix: "/platform/support/access",
          },
          {
            id: "provision",
            label: "Provision Tenant",
            href: "/platform/tenants/new",
            icon: CirclePlusIcon,
            matchPrefix: "/platform/tenants/new",
          },
          {
            id: "support",
            label: "Support Management",
            href: "/platform/support",
            icon: HeadphonesIcon,
            matchPrefix: "/platform/support",
          },
        ],
      },
      {
        id: "infrastructure",
        title: "Infrastructure",
        items: [
          {
            id: "audit",
            label: "Platform Audit",
            href: "/platform/audit",
            icon: ShieldIcon,
            matchPrefix: "/platform/audit",
          },
        ],
      },
    ],
    mobileTabs: [
      { id: "home", label: "Home", href: "/platform", icon: HomeIcon },
      {
        id: "tenants",
        label: "Tenants",
        href: "/platform/tenants",
        icon: Building2Icon,
        matchPrefix: "/platform/tenants",
      },
      {
        id: "support",
        label: "Support",
        href: "/platform/support",
        icon: HeadphonesIcon,
        matchPrefix: "/platform/support",
      },
      {
        id: "audit",
        label: "Audit",
        href: "/platform/audit",
        icon: ScrollTextIcon,
        matchPrefix: "/platform/audit",
      },
    ],
  },
};

export function getNavigationConfig(portal: UserPortal): NavigationConfig {
  return navigationByPortal[portal];
}

/** Platform shell uses Cpu icon in HTML; expose for header brand */
export const platformBrandIcon = CpuIcon;
