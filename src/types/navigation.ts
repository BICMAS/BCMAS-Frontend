import type { LucideIcon } from "lucide-react";

import type { UserPortal } from "@/types";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional nested links — renders as expandable group */
  children?: NavItem[];
  /** Match active state for nested routes */
  matchPrefix?: string;
  /** Hide until a screen exists (still omitted from configs that shouldn't show it) */
  disabled?: boolean;
};

export type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

export type MobileTab = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  matchPrefix?: string;
};

export type NavigationConfig = {
  portal: UserPortal;
  brandLabel: string;
  brandSubtitle: string;
  workspaceLabel?: string;
  sections: NavSection[];
  mobileTabs: MobileTab[];
  defaultHref: string;
};
