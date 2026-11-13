"use client";

import Link from "next/link";
import {
  ChevronDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MockUser } from "@/types/user";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  user: MockUser;
  variant?: "tenant" | "platform";
  className?: string;
};

export function UserMenu({
  user,
  variant = "tenant",
  className,
}: UserMenuProps) {
  const isPlatform = variant === "platform";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(
              "h-auto gap-3 rounded-lg px-2 py-1 hover:bg-slate-50",
              isPlatform && "hover:bg-white/10",
              className,
            )}
          />
        }
      >
        <div className="hidden text-left xl:block">
          <p
            className={cn(
              "text-xs leading-none font-bold",
              isPlatform ? "text-white" : "text-navy",
            )}
          >
            {user.name}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[10px] leading-tight font-medium tracking-wider uppercase",
              isPlatform ? "text-white/40" : "text-slate-400",
            )}
          >
            {user.roleLabel}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatarUrl}
          alt=""
          className={cn(
            "size-8 rounded-full border object-cover",
            isPlatform
              ? "border-white/20 ring-2 ring-green-lime/20"
              : "border-border-slate",
          )}
        />
        <ChevronDownIcon
          className={cn(
            "size-2.5",
            isPlatform ? "text-white/50" : "text-slate-400",
          )}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span>{user.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings/organisation" />}>
          <UserIcon className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings/security" />}>
          <SettingsIcon className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/login" />}>
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
