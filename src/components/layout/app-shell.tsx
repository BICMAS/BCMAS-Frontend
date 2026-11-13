"use client";

import { Suspense, useCallback, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  GlobalSearch,
  useGlobalSearchShortcut,
} from "@/components/layout/global-search";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { ShellFallback } from "@/components/layout/shell-fallback";
import { getNavigationConfig } from "@/config/navigation";
import { useSessionStore } from "@/stores/session-store";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  className?: string;
};

function AppShellInner({ children, className }: AppShellProps) {
  const user = useSessionStore((s) => s.user);
  const navigation = getNavigationConfig(user.portal);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useGlobalSearchShortcut(openSearch);

  if (user.portal === "platform_super_admin") {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-bg-slate p-6">
        <p className="text-sm text-slate-500">
          Platform Super Admin uses the BICMAS COMMAND shell. Switch persona or
          open <code className="font-semibold">/platform</code>.
        </p>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-full flex-1 flex-col bg-bg-slate", className)}>
      <AppHeader
        user={user}
        navigation={navigation}
        onToggleSidebar={toggleSidebar}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onOpenSearch={openSearch}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="hidden h-full lg:flex">
          <AppSidebar navigation={navigation} collapsed={sidebarCollapsed} />
        </div>

        <main
          id="content"
          className="relative min-h-0 flex-1 overflow-y-auto bg-bg-slate p-5 md:p-6 lg:p-8 xl:p-10"
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
      />

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

/**
 * Tenant AppShell — desktop sidebar + tablet/mobile drawer + bottom tabs.
 * Mirrors reference-html AppShell 02 / 03 / 04.
 */
export function AppShell(props: AppShellProps) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <AppShellInner {...props} />
    </Suspense>
  );
}
