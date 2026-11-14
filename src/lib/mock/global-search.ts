export type GlobalSearchResult = {
  id: string;
  title: string;
  description: string;
  href: string;
  category: "Organisation" | "Roles" | "Skills" | "Employees" | "Navigation" | "Development" | "Manager";
};

export const globalSearchIndex: GlobalSearchResult[] = [
  {
    id: "org",
    title: "Organisation Overview",
    description: "Structure health and department KPIs",
    href: "/org",
    category: "Organisation",
  },
  {
    id: "depts",
    title: "Departments",
    description: "Manage departments and nested roles",
    href: "/org/departments",
    category: "Organisation",
  },
  {
    id: "chart",
    title: "Visual Org Chart",
    description: "Hierarchy canvas",
    href: "/org/chart",
    category: "Organisation",
  },
  {
    id: "roles",
    title: "Roles Directory",
    description: "Browse organisational roles",
    href: "/roles",
    category: "Roles",
  },
  {
    id: "role-ssa",
    title: "Senior Solutions Architect",
    description: "Published IT role profile",
    href: "/roles/role-ssa",
    category: "Roles",
  },
  {
    id: "skills",
    title: "Skills Library",
    description: "Capability framework catalogue",
    href: "/skills",
    category: "Skills",
  },
  {
    id: "skill-cloud",
    title: "Cloud Infrastructure Design",
    description: "Technical skill · 5 levels",
    href: "/skills/skill-cloud",
    category: "Skills",
  },
  {
    id: "framework",
    title: "Framework Settings",
    description: "Proficiency scale configuration",
    href: "/skills/framework",
    category: "Skills",
  },
  {
    id: "employees",
    title: "Employee Directory",
    description: "Workforce mapping readiness",
    href: "/employees",
    category: "Employees",
  },
  {
    id: "emp-james",
    title: "James Miller",
    description: "EMP-8721 · Senior Solutions Architect",
    href: "/employees/emp-8721",
    category: "Employees",
  },
  {
    id: "mapping",
    title: "Mapping Workspace",
    description: "Individual role alignment",
    href: "/employees/mapping",
    category: "Employees",
  },
  {
    id: "bulk-mapping",
    title: "Bulk Mapping",
    description: "AI role suggestions",
    href: "/employees/mapping/bulk",
    category: "Employees",
  },
  {
    id: "mapping-exceptions",
    title: "Mapping Exceptions",
    description: "Department alignment queue",
    href: "/employees/mapping/exceptions",
    category: "Employees",
  },
  {
    id: "import",
    title: "Bulk Employee Import",
    description: "CSV / XLSX workforce import",
    href: "/employees/import",
    category: "Employees",
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Inbox and alerts",
    href: "/notifications",
    category: "Navigation",
  },
  {
    id: "ld",
    title: "L&D Dashboard",
    description: "Capability development and growth plans",
    href: "/ld",
    category: "Development",
  },
  {
    id: "matrix",
    title: "Team Development Matrix",
    description: "Department skill gaps",
    href: "/ld/team-matrix",
    category: "Development",
  },
  {
    id: "learning",
    title: "Capability Resource Library",
    description: "Learning catalogue",
    href: "/learning",
    category: "Development",
  },
  {
    id: "cycles",
    title: "Assessment Cycles",
    description: "2024 Global Capability Review",
    href: "/assessments/cycles",
    category: "Development",
  },
  {
    id: "verification",
    title: "Verification Hub",
    description: "Evidence and verification plans",
    href: "/verification",
    category: "Development",
  },
  {
    id: "manager",
    title: "Team Dashboard",
    description: "IT Infrastructure team",
    href: "/manager",
    category: "Manager",
  },
  {
    id: "manager-team",
    title: "My Direct Reports",
    description: "Line manager team directory",
    href: "/manager/team",
    category: "Manager",
  },
  {
    id: "gaps",
    title: "Capability Gap Analysis",
    description: "Team strengths and deficits",
    href: "/insights/gaps",
    category: "Manager",
  },
  {
    id: "talent",
    title: "Talent Assessment",
    description: "Recruitment and promotion readiness",
    href: "/talent",
    category: "Development",
  },
  {
    id: "talent-recruitment",
    title: "Recruitment Assessments",
    description: "Candidate assessments against approved role profiles",
    href: "/talent/recruitment",
    category: "Development",
  },
  {
    id: "talent-promotion",
    title: "Promotion Assessments",
    description: "Internal promotion against an approved role",
    href: "/talent/promotion",
    category: "Development",
  },
  {
    id: "talent-library",
    title: "Assessment Library",
    description: "Reusable talent assessment items",
    href: "/talent/library",
    category: "Development",
  },
  {
    id: "talent-insights",
    title: "Talent Insights",
    description: "Same-role comparison and readiness gaps",
    href: "/talent/insights",
    category: "Development",
  },
  {
    id: "manager-promotion",
    title: "Promotion Review",
    description: "Direct report promotion decisions",
    href: "/manager/promotion",
    category: "Manager",
  },
];

export function searchGlobalIndex(query: string, limit = 8): GlobalSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return globalSearchIndex.slice(0, limit);
  return globalSearchIndex
    .filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    )
    .slice(0, limit);
}
