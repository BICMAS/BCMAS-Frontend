"use client";

import { Suspense, type ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { ShellFallback } from "@/components/layout/shell-fallback";
import { getNavigationConfig } from "@/config/navigation";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

type PlatformShellProps = {
  children: ReactNode;
  className?: string;
};

function PlatformShellInner({ children, className }: PlatformShellProps) {
  const user = useSessionStore((s) => s.user);
  const navigation = getNavigationConfig("platform_super_admin");
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <div className={cn("flex min-h-full flex-1 flex-col bg-bg-slate", className)}>
      <AppHeader
        user={user}
        navigation={navigation}
        variant="platform"
        onToggleSidebar={toggleSidebar}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden h-full lg:flex">
          <AppSidebar
            navigation={navigation}
            collapsed={sidebarCollapsed}
            variant="platform"
            showTenantSwitcher={false}
          />
        </div>

        <main
          id="content"
          className="relative min-h-0 flex-1 overflow-y-auto bg-bg-slate p-5 text-navy md:p-6 lg:p-8"
        >
          {children}
        </main>
      </div>

      <MobileBottomNav tabs={navigation.mobileTabs} />

      <MobileDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        navigation={navigation}
        user={user}
        variant="platform"
      />
    </div>
  );
}

/**
 * BICMAS COMMAND shell — dark header + navy sidebar (HTML 56+).
 */
export function PlatformShell(props: PlatformShellProps) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <PlatformShellInner {...props} />
    </Suspense>
  );
}
