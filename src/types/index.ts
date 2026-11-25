export type UserPortal =
  | "platform_super_admin"
  | "organisation_admin"
  | "hr_ld_admin"
  | "line_manager"
  | "employee";

export type AppRole =
  | "Platform Super Admin"
  | "HR Admin"
  | "Department Admin"
  | "HRBP"
  | "Line Manager"
  | "Employee";

export type { NavItem, NavSection, NavigationConfig, MobileTab } from "./navigation";
export type { MockOrganisation, MockUser } from "./user";
