"use client";

import Link from "next/link";
import {
  BellIcon,
  CircleHelpIcon,
  MenuIcon,
  SearchIcon,
} from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/layout/brand-logo";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { SearchField } from "@/components/shared/search-field";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { Button } from "@/components/ui/button";
import { useNotificationsStore } from "@/features/notifications";
import type { NavigationConfig } from "@/types/navigation";
import type { MockUser } from "@/types/user";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  user: MockUser;
  navigation: NavigationConfig;
  variant?: "tenant" | "platform";
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  onOpenSearch?: () => void;
  className?: string;
};

export function AppHeader({
  user,
  navigation,
  variant = "tenant",
  onToggleSidebar,
  onOpenMobileNav,
  onOpenSearch,
  className,
}: AppHeaderProps) {
  const isPlatform = variant === "platform";
  const unreadCount = useNotificationsStore((s) =>
    s.items.filter((item) => !item.read).length,
  );

  if (isPlatform) {
    return (
      <header
        className={cn(
          "z-30 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-navy-deep px-4 text-white md:px-6",
          className,
        )}
      >
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </Button>
          <BrandLogo
            variant="platform"
            label={navigation.brandLabel}
            subtitle={navigation.brandSubtitle}
          />
          <div className="hidden items-center border-l border-white/10 pl-4 sm:flex">
            <StatusIndicator
              label="Systems Operational"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-green-lime"
            />
          </div>
        </div>
        <UserMenu user={user} variant="platform" />
      </header>
    );
  }

  return (
    <header
      className={cn(
        "z-30 flex h-14 shrink-0 items-center justify-between border-b border-border-slate bg-white px-4 md:h-16 md:px-6",
        className,
      )}
    >
      <div className="flex items-center gap-3 md:gap-4">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
        >
          <MenuIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden lg:inline-flex"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <MenuIcon />
        </Button>

        <BrandLogo
          className="hidden sm:flex"
          label={navigation.brandLabel}
          subtitle={navigation.brandSubtitle}
        />
        <BrandLogo variant="compact" className="sm:hidden" />

        <div className="mx-1 hidden h-6 w-px bg-border-slate lg:block" />
        <TenantSwitcher className="hidden md:inline-flex" />
      </div>

      <div className="mx-8 hidden max-w-md flex-1 lg:flex">
        <button
          type="button"
          className="w-full text-left"
          onClick={onOpenSearch}
          aria-label="Open search"
        >
          <SearchField showShortcut readOnly tabIndex={-1} className="pointer-events-none" />
        </button>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="Search"
          onClick={onOpenSearch}
        >
          <SearchIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          nativeButton={false}
          render={<Link href="/notifications" />}
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <BellIcon />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full border-2 border-white bg-red-500" />
          ) : null}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden sm:inline-flex"
          aria-label="Help and support"
          onClick={() =>
            toast.message("Need help?", {
              description:
                "Contact support@bicmas.com or your organisation administrator. (Mock guidance — no ticket system yet.)",
            })
          }
        >
          <CircleHelpIcon />
        </Button>
        <div className="mx-1 hidden h-6 w-px bg-border-slate sm:block" />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
