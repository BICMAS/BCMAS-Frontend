import {
  BotIcon,
  Building2Icon,
  ChartPieIcon,
  CirclePlusIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  CpuIcon,
  GraduationCapIcon,
  HeadphonesIcon,
  HomeIcon,
  InfoIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  LibraryIcon,
  LineChartIcon,
  ListChecksIcon,
  NetworkIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  ShieldUserIcon,
  SparklesIcon,
  TargetIcon,
  UserCogIcon,
  UsersIcon,
  WaypointsIcon,
} from "lucide-react";

import type { UserPortal } from "@/types";
import type { MobileTab, NavigationConfig, NavItem } from "@/types/navigation";

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
                id: "org-overview",
                label: "Organisation Overview",
                href: "/org",
                icon: Building2Icon,
                matchPrefix: "/org",
              },
              {
                id: "roles-list",
                label: "Roles Directory",
                href: "/roles",
                icon: NetworkIcon,
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
                id: "skills-framework",
                label: "Framework Settings",
                href: "/skills/framework",
                icon: SettingsIcon,
              },
              {
                id: "skills-library",
                label: "Skills Library",
                href: "/skills",
                icon: LibraryIcon,
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
                id: "bulk-mapping",
                label: "Bulk Mapping",
                href: "/employees/mapping/bulk",
                icon: ListChecksIcon,
              },
              {
                id: "mapping",
                label: "Mapping Workspace",
                href: "/employees/mapping",
                icon: WaypointsIcon,
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
            label: "Learning & Development",
            href: "/learning",
            icon: GraduationCapIcon,
            matchPrefix: "/learning",
          },
          {
            id: "training-plan",
            label: "Training Plan",
            href: "/training-plan",
            icon: ClipboardListIcon,
            matchPrefix: "/training-plan",
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
                id: "org-chart",
                label: "Org Chart",
                href: "/org/chart",
                icon: NetworkIcon,
              },
              {
                id: "departments",
                label: "Departments",
                href: "/org/departments",
                icon: Building2Icon,
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
          {
            id: "about",
            label: "About BCMS",
            href: "/about",
            icon: InfoIcon,
            matchPrefix: "/about",
          },
        ],
      },
      {
        id: "ai",
        title: "AI",
        items: [
          {
            id: "ai-centre",
            label: "AI Capability Centre",
            href: "/ai",
            icon: SparklesIcon,
          },
          {
            id: "ai-plans",
            label: "AI Training Plans",
            href: "/ai/plans",
            icon: GraduationCapIcon,
            matchPrefix: "/ai/plans",
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

  // HRBP view, per the "HR BP View" review: Roles Directory first, skills and employee
  // alignment work, view-only assessment cycles, L&D and Training Plan. No Organisation
  // Overview, Framework Settings, Admin Hub (except About BCMS) or AI section.
  hr_ld_admin: {
    portal: "hr_ld_admin",
    brandLabel: "BICMAS",
    brandSubtitle: "BCMS",
    workspaceLabel: "HR Business Partner",
    defaultHref: "/roles",
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
                id: "bulk-mapping",
                label: "Bulk Mapping",
                href: "/employees/mapping/bulk",
                icon: ListChecksIcon,
              },
              {
                id: "mapping",
                label: "Mapping Workspace",
                href: "/employees/mapping",
                icon: WaypointsIcon,
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
            label: "Learning & Development",
            href: "/learning",
            icon: GraduationCapIcon,
            matchPrefix: "/learning",
          },
          {
            id: "training-plan",
            label: "Training Plan",
            href: "/training-plan",
            icon: ClipboardListIcon,
            matchPrefix: "/training-plan",
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
                id: "talent-vacancies",
                label: "Vacancies",
                href: "/talent/vacancies",
                icon: ClipboardCheckIcon,
                matchPrefix: "/talent/vacancies",
              },
              {
                id: "talent-candidates",
                label: "Candidates",
                href: "/talent/candidates",
                icon: UsersIcon,
                matchPrefix: "/talent/candidates",
              },
              {
                id: "talent-library",
                label: "Assessment Library",
                href: "/talent/library",
                icon: LibraryIcon,
                matchPrefix: "/talent/library",
              },
              {
                id: "talent-insights",
                label: "Recruitment Insights",
                href: "/talent/insights",
                icon: LineChartIcon,
                matchPrefix: "/talent/insights",
              },
            ],
          },
        ],
      },
      {
        id: "help",
        title: "Help",
        items: [
          {
            id: "about",
            label: "About BCMS",
            href: "/about",
            icon: InfoIcon,
            matchPrefix: "/about",
          },
        ],
      },
    ],
    mobileTabs: [
      { id: "home", label: "Roles", href: "/roles", icon: NetworkIcon, matchPrefix: "/roles" },
      {
        id: "team",
        label: "Team",
        href: "/employees",
        icon: UsersIcon,
        matchPrefix: "/employees",
      },
      {
        id: "assess",
        label: "Assess",
        href: "/assessments/cycles",
        icon: ChartPieIcon,
        matchPrefix: "/assessments",
      },
      {
        id: "learn",
        label: "Learn",
        href: "/learning",
        icon: GraduationCapIcon,
        matchPrefix: "/learning",
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
            id: "verification-queue",
            label: "Verification Queue",
            href: "/verification/team",
            icon: ClipboardCheckIcon,
            matchPrefix: "/verification",
          },
          {
            id: "vacancy-approvals",
            label: "Vacancy Approvals",
            href: "/manager/vacancies",
            icon: ListChecksIcon,
            matchPrefix: "/manager/vacancies",
          },
          {
            id: "hiring-review",
            label: "Hiring Review",
            href: "/manager/recruitment",
            icon: UsersIcon,
            matchPrefix: "/manager/recruitment",
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
      {
        id: "ai",
        title: "AI",
        items: [
          {
            id: "ai-centre",
            label: "AI Capability Centre",
            href: "/ai",
            icon: SparklesIcon,
          },
          {
            id: "ai-coaching",
            label: "AI Coaching",
            href: "/ai/coaching",
            icon: BotIcon,
            matchPrefix: "/ai/coaching",
          },
          {
            id: "ai-plans",
            label: "AI Training Plans",
            href: "/ai/plans",
            icon: GraduationCapIcon,
            matchPrefix: "/ai/plans",
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
        ],
      },
      {
        id: "practice",
        title: "Practice",
        items: [
          {
            id: "learning",
            label: "Learning & Development",
            href: "/learning",
            icon: LibraryIcon,
            matchPrefix: "/learning",
          },
        ],
      },
      {
        id: "ai",
        title: "AI",
        items: [
          {
            id: "ai-centre",
            label: "AI Capability Centre",
            href: "/ai",
            icon: SparklesIcon,
          },
          {
            id: "ai-coaching",
            label: "AI Coaching",
            href: "/ai/coaching",
            icon: BotIcon,
            matchPrefix: "/ai/coaching",
          },
          {
            id: "ai-plans",
            label: "AI Training Plans",
            href: "/ai/plans",
            icon: GraduationCapIcon,
            matchPrefix: "/ai/plans",
          },
          {
            id: "ai-assessments",
            label: "AI Talent Assessment",
            href: "/ai/assessments",
            icon: ClipboardCheckIcon,
            matchPrefix: "/ai/assessments",
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
        href: "/ai/coaching",
        icon: BotIcon,
        matchPrefix: "/ai/coaching",
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
            exact: true,
          },
          {
            id: "assessment-library",
            label: "Assessment Library",
            href: "/platform/assessment-library",
            icon: LibraryIcon,
            matchPrefix: "/platform/assessment-library",
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
            exact: true,
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

/**
 * Menu paths owned by each tenant feature (the Platform Super Admin turns features on per tenant).
 * Paths not listed here are core and always shown. Multi-BU and SAML have no menus of their own.
 */
export const FEATURE_ROUTES: Record<string, string[]> = {
  "AI Coaching": ["/ai/coaching"],
  "L&D Library": ["/learning", "/training-plan", "/ld"],
  Assessments: ["/assessments", "/verification"],
  "Talent Assessment": ["/talent", "/manager/vacancies", "/manager/recruitment"],
  Reports: ["/insights"],
};

/**
 * Pages a portal may not open even by URL, because they are not part of that role's work.
 * The HRBP list follows the "HR BP View" review: no Organisation pages, Framework Settings,
 * Admin Hub (except About BCMS) or AI section.
 */
export const PORTAL_BLOCKED_ROUTES: Partial<Record<UserPortal, string[]>> = {
  hr_ld_admin: ["/org", "/skills/framework", "/settings", "/insights", "/ai", "/ld", "/growth", "/verification"],
};

/** True when the portal may not open this page. */
export function isPathBlockedForPortal(href: string, portal: UserPortal) {
  return (PORTAL_BLOCKED_ROUTES[portal] ?? []).some((prefix) => startsWithPath(href, prefix));
}

function startsWithPath(href: string, prefix: string) {
  return href === prefix || href.startsWith(`${prefix}/`);
}

/** The feature that owns a path, or null for core paths. */
export function featureForPath(href: string): string | null {
  for (const [feature, prefixes] of Object.entries(FEATURE_ROUTES)) {
    if (prefixes.some((prefix) => startsWithPath(href, prefix))) return feature;
  }
  return null;
}

/** False when the path belongs to a feature the tenant does not have. Used for menus and page access. */
export function isPathAllowed(href: string, entitlements: readonly string[]) {
  const feature = featureForPath(href);
  return feature === null || entitlements.includes(feature);
}

const allowed = isPathAllowed;

function filterItems(items: NavItem[], entitlements: readonly string[]): NavItem[] {
  return items.flatMap((item) => {
    const children = item.children ? filterItems(item.children, entitlements) : undefined;
    if (!allowed(item.href, entitlements)) {
      // A group whose own link is switched off stays only if some of its children are on.
      if (!children?.length) return [];
      return [{ ...item, href: children[0]!.href, children }];
    }
    return [{ ...item, ...(item.children ? { children } : {}) }];
  });
}

/**
 * Navigation for a portal. Pass the tenant's enabled features to hide the menus of features it
 * does not have; omit them (or pass null) to show everything.
 */
export function getNavigationConfig(portal: UserPortal, entitlements?: readonly string[] | null): NavigationConfig {
  const config = navigationByPortal[portal];
  if (!entitlements || portal === "platform_super_admin") return config;
  const sections = config.sections
    .map((section) => ({ ...section, items: filterItems(section.items, entitlements) }))
    .filter((section) => section.items.length > 0);
  const mobileTabs: MobileTab[] = config.mobileTabs.filter((tab) => allowed(tab.href, entitlements));
  const firstHref = sections[0]?.items[0]?.href ?? config.defaultHref;
  return {
    ...config,
    sections,
    mobileTabs,
    defaultHref: allowed(config.defaultHref, entitlements) ? config.defaultHref : firstHref,
  };
}

/** Platform shell uses Cpu icon in HTML; expose for header brand */
export const platformBrandIcon = CpuIcon;
