"use client";

import { StatusIndicator } from "@/components/shared/status-indicator";
import { DevRoleSwitcher } from "@/components/layout/dev-role-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import type { NavigationConfig } from "@/types/navigation";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  navigation: NavigationConfig;
  collapsed: boolean;
  variant?: "tenant" | "platform";
  showTenantSwitcher?: boolean;
  className?: string;
};

export function AppSidebar({
  navigation,
  collapsed,
  variant = "tenant",
  showTenantSwitcher = true,
  className,
}: AppSidebarProps) {
  const isPlatform = variant === "platform";

  return (
    <aside
      id="app-sidebar"
      data-collapsed={collapsed || undefined}
      className={cn(
        "sidebar-transition z-20 flex h-full shrink-0 flex-col border-r",
        isPlatform
          ? "border-white/5 bg-navy text-white/70"
          : "border-border-slate bg-white",
        collapsed ? "w-16" : "w-[var(--sidebar-width)]",
        className,
      )}
      aria-label="Primary"
    >
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <SidebarNav
          sections={navigation.sections}
          collapsed={collapsed}
          variant={variant}
        />
      </div>

      <div
        className={cn(
          "space-y-3 border-t p-4",
          isPlatform ? "border-white/5" : "border-border-slate",
        )}
      >
        {!collapsed && showTenantSwitcher && !isPlatform ? (
          <TenantSwitcher compact className="w-full" />
        ) : null}

        <DevRoleSwitcher collapsed={collapsed} />

        <div
          className={cn(
            "flex items-center gap-3 rounded-lg p-3",
            isPlatform ? "bg-white/5" : "bg-slate-50",
            collapsed && "justify-center p-2",
          )}
        >
          {collapsed ? (
            <span
              className="size-2 rounded-full bg-green-lime shadow-status-glow animate-status-pulse"
              aria-label="All systems operational"
            />
          ) : isPlatform ? (
            <span className="text-[10px] font-semibold tracking-widest text-white/40 uppercase">
              v4.2.0-stable
            </span>
          ) : (
            <StatusIndicator label="All systems operational" />
          )}
        </div>
      </div>
    </aside>
  );
}
