"use client";

import { useRouter } from "next/navigation";
import { UsersIcon } from "lucide-react";

import { mockUsers } from "@/config/mock-users";
import { getNavigationConfig } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionStore } from "@/stores/session-store";
import { cn } from "@/lib/utils";

type DevRoleSwitcherProps = {
  className?: string;
  collapsed?: boolean;
};

/**
 * Development-only persona switcher. Remove or gate when real auth lands.
 */
export function DevRoleSwitcher({
  className,
  collapsed = false,
}: DevRoleSwitcherProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const setUserId = useSessionStore((s) => s.setUserId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="secondary"
            size={collapsed ? "icon-sm" : "sm"}
            className={cn("w-full", collapsed && "w-8", className)}
            aria-label="Switch development persona"
          />
        }
      >
        <UsersIcon className="size-3.5" aria-hidden />
        {!collapsed ? <span className="truncate">Dev role</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuLabel>Development personas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mockUsers.map((persona) => (
          <DropdownMenuItem
            key={persona.id}
            onClick={() => {
              setUserId(persona.id);
              const nav = getNavigationConfig(persona.portal);
              router.push(nav.defaultHref);
            }}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="font-semibold">
              {persona.name}
              {persona.id === user.id ? " · current" : ""}
            </span>
            <span className="text-xs text-muted-foreground">
              {persona.roleLabel}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
