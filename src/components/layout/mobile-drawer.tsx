"use client";

import { XIcon } from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { DevRoleSwitcher } from "@/components/layout/dev-role-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import type { NavigationConfig } from "@/types/navigation";
import type { MockUser } from "@/types/user";
import { cn } from "@/lib/utils";

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  navigation: NavigationConfig;
  user: MockUser;
  variant?: "tenant" | "platform";
};

export function MobileDrawer({
  open,
  onClose,
  navigation,
  user,
  variant = "tenant",
}: MobileDrawerProps) {
  const isPlatform = variant === "platform";

  return (
    <div className="lg:hidden" aria-hidden={!open}>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <div
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-[60] flex w-4/5 max-w-sm flex-col border-r transition-transform duration-300",
          isPlatform
            ? "border-white/10 bg-navy text-white"
            : "border-border-slate bg-white",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between border-b p-6",
            isPlatform ? "border-white/10" : "border-border-slate",
          )}
        >
          <BrandLogo
            variant={isPlatform ? "platform" : "tenant"}
            label={navigation.brandLabel}
            subtitle={navigation.brandSubtitle}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close navigation"
            className={isPlatform ? "text-white/70 hover:bg-white/10 hover:text-white" : undefined}
          >
            <XIcon />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <SidebarNav
            sections={navigation.sections}
            variant={variant}
            onNavigate={onClose}
          />
        </div>

        <div
          className={cn(
            "space-y-4 border-t p-6",
            isPlatform ? "border-white/10" : "border-border-slate",
          )}
        >
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user.avatarUrl}
              alt=""
              className="size-10 rounded-full object-cover"
            />
            <div>
              <p
                className={cn(
                  "text-sm font-bold",
                  isPlatform ? "text-white" : "text-navy",
                )}
              >
                {user.name}
              </p>
              <p
                className={cn(
                  "text-xs",
                  isPlatform ? "text-white/50" : "text-slate-400",
                )}
              >
                {user.roleLabel}
              </p>
            </div>
          </div>
          <DevRoleSwitcher />
          <Button
            variant="secondary"
            className="w-full"
            nativeButton={false}
            render={<a href="/login" />}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
